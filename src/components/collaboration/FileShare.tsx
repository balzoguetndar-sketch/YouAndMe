'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/src/lib/supabase/clients';
import type { RealtimeChannel } from '@supabase/supabase-js';

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const COMPRESSIBLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type FileShareProps = {
  roomId: string;
  receiverEmail: string;
};

type SharedFile = {
  id: string;
  name: string;
  path: string;
  size: number;
  contentType: string;
  createdAt: string;
  url: string;
};

async function compressImage(file: File) {
  if (!COMPRESSIBLE_IMAGE_TYPES.has(file.type)) {
    throw new Error('Cette image ne peut pas être compressée dans le navigateur. Choisissez-en une autre ou réduisez-la avant l’envoi.');
  }

  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    let quality = 0.88;

    for (let attempt = 0; attempt < 14; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Compression d’image indisponible dans ce navigateur.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/webp', quality);
      });
      if (!blob) throw new Error('Impossible de compresser cette image.');
      if (blob.size <= MAX_FILE_SIZE) {
        const outputName = `${file.name.replace(/\.[^.]+$/, '') || 'image'}.webp`;
        return new File([blob], outputName, { type: 'image/webp', lastModified: Date.now() });
      }

      if (attempt % 2 === 1) scale *= 0.82;
      quality = Math.max(0.42, quality - 0.07);
    }
  } finally {
    bitmap.close();
  }

  throw new Error('Cette image reste supérieure à 2 Mio après compression.');
}

export function FileShare({ roomId, receiverEmail }: FileShareProps) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [channelReady, setChannelReady] = useState(false);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const supabase = createClient();

  const loadFiles = useCallback(async () => {
    try {
      const response = await fetch(`/api/collaboration/files?peer=${encodeURIComponent(receiverEmail)}`, {
        cache: 'no-store',
      });
      const result = await response.json() as { files?: SharedFile[]; error?: string };

      if (!response.ok || !result.files) {
        setStatus(`Impossible de charger les fichiers partagés : ${result.error || 'erreur du serveur'}`);
        return;
      }

      setFiles(result.files);
      setStatus(null);
    } catch {
      setStatus('Impossible de joindre le service de partage. Vérifiez votre connexion.');
    }
  }, [receiverEmail]);

  useEffect(() => {
    let isActive = true;
    const channel = supabase.channel(`shared-files:${roomId}`);
    channelRef.current = channel;
    channel
      .on('broadcast', { event: 'file-added' }, () => {
        void loadFiles();
      })
      .subscribe((state) => {
        if (!isActive) return;
        setChannelReady(state === 'SUBSCRIBED');
        if (state === 'SUBSCRIBED') void loadFiles();
      });

    return () => {
      isActive = false;
      channelRef.current = null;
      setChannelReady(false);
      void supabase.removeChannel(channel);
    };
  }, [supabase, roomId, loadFiles]);

  const uploadFiles = async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setStatus(null);
    let uploadedCount = 0;

    try {
      for (const file of selectedFiles) {
        const tokenResponse = await fetch('/api/collaboration/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ peerEmail: receiverEmail, fileName: file.name, size: file.size }),
        });
        const tokenResult = await tokenResponse.json() as { path?: string; token?: string; error?: string };

        if (!tokenResponse.ok || !tokenResult.path || !tokenResult.token) {
          setStatus(`Erreur pour « ${file.name} » : ${tokenResult.error || 'autorisation refusée'}`);
          continue;
        }

        const { error } = await supabase.storage.from('session-files').uploadToSignedUrl(
          tokenResult.path,
          tokenResult.token,
          file,
          { contentType: file.type || 'application/octet-stream' }
        );

        if (error) {
          setStatus(`Erreur pour « ${file.name} » : ${error.message}`);
          continue;
        }

        uploadedCount += 1;
        if (channelReady) {
          await channelRef.current?.send({
            type: 'broadcast',
            event: 'file-added',
            payload: { roomId },
          });
        }
      }
      await loadFiles();
      if (uploadedCount > 0) {
        setStatus(`${uploadedCount} fichier${uploadedCount > 1 ? 's' : ''} partagé${uploadedCount > 1 ? 's' : ''}.`);
      }
    } catch {
      setStatus('L’envoi a échoué. Vérifiez votre connexion puis réessayez.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (selectedFiles.length === 0) return;

    const regularFiles = selectedFiles.filter((file) => file.size <= MAX_FILE_SIZE);
    const largeFiles = selectedFiles.filter((file) => file.size > MAX_FILE_SIZE);
    const compressible = largeFiles.filter((file) => COMPRESSIBLE_IMAGE_TYPES.has(file.type));
    const unsupported = largeFiles.filter((file) => !COMPRESSIBLE_IMAGE_TYPES.has(file.type));

    setPendingImages(compressible);
    if (unsupported.length > 0) {
      setStatus(`${unsupported.map((file) => file.name).join(', ')} dépasse 2 Mio et ne peut pas être compressé ici. Réduisez ces fichiers avant l’envoi.`);
    }
    if (regularFiles.length > 0) void uploadFiles(regularFiles);
  };

  const handleCompressAndUpload = async () => {
    if (pendingImages.length === 0) return;
    setUploading(true);
    setStatus('Compression des images en cours…');
    const compressedFiles: File[] = [];

    for (const image of pendingImages) {
      try {
        compressedFiles.push(await compressImage(image));
      } catch (error) {
        setStatus(error instanceof Error ? error.message : `Impossible de compresser ${image.name}.`);
      }
    }

    setPendingImages([]);
    setUploading(false);
    if (compressedFiles.length > 0) await uploadFiles(compressedFiles);
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-200">Fichiers &amp; images partagés</h3>
        <span className={`text-xs ${channelReady ? 'text-emerald-400' : 'text-slate-500'}`} role="status">
          {channelReady ? 'Synchronisé' : 'Connexion au partage…'}
        </span>
      </div>

      <label className="flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-700 bg-slate-950 p-4 text-center transition-colors hover:border-indigo-500">
        <span className="text-xs text-slate-300">
          {uploading ? 'Envoi en cours…' : 'Choisir un ou plusieurs fichiers (2 Mio maximum chacun)'}
        </span>
        <input type="file" multiple onChange={handleFileSelection} disabled={uploading} className="sr-only" />
      </label>

      {pendingImages.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-800 bg-amber-950/40 p-3">
          <p className="min-w-0 flex-1 text-xs text-amber-200">
            {pendingImages.map((image) => image.name).join(', ')} dépasse 2 Mio. Voulez-vous compresser et envoyer {pendingImages.length > 1 ? 'ces images' : 'cette image'} ?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPendingImages([])}
              disabled={uploading}
              className="rounded-md border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void handleCompressAndUpload()}
              disabled={uploading}
              className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              Compresser et envoyer
            </button>
          </div>
        </div>
      )}

      {status && <p className="text-xs text-slate-300" role="status">{status}</p>}

      {files.length > 0 ? (
        <ul className="max-h-56 space-y-2 overflow-y-auto">
          {files.map((file) => (
            <li key={file.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300">
              <span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span>
              <span className="shrink-0 text-slate-500">
                {file.size ? `${(file.size / (1024 * 1024)).toFixed(2)} Mio` : 'Fichier'}
              </span>
              <a href={file.url} target="_blank" rel="noopener noreferrer" className="shrink-0 font-medium text-indigo-400 hover:underline">
                {file.contentType.startsWith('image/') ? 'Voir' : 'Télécharger'}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">Aucun fichier partagé dans cette salle.</p>
      )}
    </div>
  );
}