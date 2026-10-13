'use client';

import Image from 'next/image';
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
  downloadUrl?: string;
};

type PendingFile = {
  id: string;
  file: File;
  previewUrl: string | null;
  needsCompression: boolean;
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
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const previewUrlsRef = useRef(new Set<string>());
  const supabase = createClient();

  const createPendingFile = (file: File, needsCompression: boolean): PendingFile => {
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    if (previewUrl) previewUrlsRef.current.add(previewUrl);
    return { id: crypto.randomUUID(), file, previewUrl, needsCompression };
  };

  const releasePreview = (pendingFile: PendingFile) => {
    if (!pendingFile.previewUrl) return;
    URL.revokeObjectURL(pendingFile.previewUrl);
    previewUrlsRef.current.delete(pendingFile.previewUrl);
  };

  useEffect(() => () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current.clear();
  }, []);

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

  const uploadFiles = async (selectedFiles: File[]): Promise<Set<File>> => {
    if (selectedFiles.length === 0) return new Set();
    setUploading(true);
    setStatus(null);
    let uploadedCount = 0;
    const failedFiles = new Set<File>();
    const errors: string[] = [];

    try {
      for (const file of selectedFiles) {
        const tokenResponse = await fetch('/api/collaboration/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ peerEmail: receiverEmail, fileName: file.name, size: file.size }),
        });
        const tokenResult = await tokenResponse.json() as { path?: string; token?: string; error?: string };

        if (!tokenResponse.ok || !tokenResult.path || !tokenResult.token) {
          failedFiles.add(file);
          errors.push(`Erreur pour « ${file.name} » : ${tokenResult.error || 'autorisation refusée'}`);
          continue;
        }

        const { error } = await supabase.storage.from('session-files').uploadToSignedUrl(
          tokenResult.path,
          tokenResult.token,
          file,
          { contentType: file.type || 'application/octet-stream' }
        );

        if (error) {
          failedFiles.add(file);
          errors.push(`Erreur pour « ${file.name} » : ${error.message}`);
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
      setStatus(errors.length > 0
        ? errors.join(' ')
        : `${uploadedCount} fichier${uploadedCount > 1 ? 's' : ''} partagé${uploadedCount > 1 ? 's' : ''}.`);
      return failedFiles;
    } catch {
      setStatus('L’envoi a échoué. Vérifiez votre connexion puis réessayez.');
      return new Set(selectedFiles);
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (selectedFiles.length === 0) return;

    const acceptedFiles = selectedFiles
      .filter((file) => file.size <= MAX_FILE_SIZE || COMPRESSIBLE_IMAGE_TYPES.has(file.type))
      .map((file) => createPendingFile(file, file.size > MAX_FILE_SIZE));
    const unsupported = selectedFiles.filter((file) => (
      file.size > MAX_FILE_SIZE && !COMPRESSIBLE_IMAGE_TYPES.has(file.type)
    ));

    if (acceptedFiles.length > 0) {
      setPendingFiles((current) => [...current, ...acceptedFiles]);
      setStatus(`${acceptedFiles.length} fichier${acceptedFiles.length > 1 ? 's' : ''} ajouté${acceptedFiles.length > 1 ? 's' : ''} à la sélection. Vérifiez puis envoyez.`);
    }
    if (unsupported.length > 0) {
      setStatus(`${unsupported.map((file) => file.name).join(', ')} dépasse 2 Mio et ne peut pas être compressé ici. Réduisez ces fichiers avant l’envoi.`);
    }
  };

  const handleCompressPending = async () => {
    const oversizedImages = pendingFiles.filter((item) => item.needsCompression);
    if (oversizedImages.length === 0) return;
    setUploading(true);
    setStatus('Compression des images en cours…');
    const replacements = new Map<File, PendingFile>();
    const errors: string[] = [];

    for (const item of oversizedImages) {
      try {
        const compressed = await compressImage(item.file);
        replacements.set(item.file, createPendingFile(compressed, false));
        releasePreview(item);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `Impossible de compresser ${item.file.name}.`);
      }
    }

    setPendingFiles((current) => current.map((item) => replacements.get(item.file) || item));
    setUploading(false);
    setStatus(errors.length > 0
      ? errors.join(' ')
      : `${oversizedImages.length} image${oversizedImages.length > 1 ? 's' : ''} compressée${oversizedImages.length > 1 ? 's' : ''}. Vérifiez puis envoyez.`);
  };

  const handleSendPending = async () => {
    if (pendingFiles.length === 0 || pendingFiles.some((item) => item.needsCompression)) return;
    const failedFiles = await uploadFiles(pendingFiles.map((item) => item.file));
    const successfulFiles = pendingFiles.filter((item) => !failedFiles.has(item.file));
    successfulFiles.forEach(releasePreview);
    setPendingFiles((current) => current.filter((item) => failedFiles.has(item.file)));
  };

  const removePendingFile = (pendingFile: PendingFile) => {
    releasePreview(pendingFile);
    setPendingFiles((current) => current.filter((item) => item !== pendingFile));
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
          {uploading ? 'Traitement en cours…' : 'Ajouter des fichiers à partager (2 Mio maximum chacun)'}
        </span>
        <input type="file" multiple onChange={handleFileSelection} disabled={uploading} className="sr-only" />
      </label>

      {pendingFiles.length > 0 && (
        <div className="space-y-3 rounded-lg border border-indigo-800/70 bg-indigo-950/30 p-3">
          <p className="text-xs font-semibold text-slate-200">À envoyer ({pendingFiles.length})</p>
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {pendingFiles.map((item) => (
              <li key={item.id} className="flex min-w-0 items-center gap-3 rounded-md bg-slate-950/80 p-2">
                {item.previewUrl ? (
                  <Image src={item.previewUrl} alt={`Aperçu de ${item.file.name}`} width={48} height={48} unoptimized className="h-12 w-12 shrink-0 rounded object-cover" />
                ) : (
                  <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-slate-800 text-lg">📄</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-slate-200" title={item.file.name}>{item.file.name}</span>
                  <span className={`block text-[10px] ${item.needsCompression ? 'text-amber-300' : 'text-slate-500'}`}>
                    {item.needsCompression ? 'À compresser avant envoi' : `${(item.file.size / (1024 * 1024)).toFixed(2)} Mio`}
                  </span>
                </span>
                <button type="button" onClick={() => removePendingFile(item)} disabled={uploading} className="shrink-0 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50" aria-label={`Retirer ${item.file.name}`}>
                  Retirer
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-2">
            {pendingFiles.some((item) => item.needsCompression) && (
              <button type="button" onClick={() => void handleCompressPending()} disabled={uploading} className="rounded-md border border-amber-700 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-950 disabled:opacity-60">
                Compresser les images
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleSendPending()}
          disabled={uploading || pendingFiles.length === 0 || pendingFiles.some((item) => item.needsCompression)}
          className="rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading
            ? 'Envoi en cours…'
            : pendingFiles.length > 0
              ? `Envoyer ${pendingFiles.length} fichier${pendingFiles.length > 1 ? 's' : ''}`
              : 'Envoyer les fichiers'}
        </button>
      </div>

      {status && <p className="text-xs text-slate-300" role="status">{status}</p>}

      {files.length > 0 ? (
        <ul className="max-h-56 space-y-2 overflow-y-auto">
          {files.map((file) => (
            <li key={file.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300">
              <span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span>
              <span className="shrink-0 text-slate-500">
                {file.size ? `${(file.size / (1024 * 1024)).toFixed(2)} Mio` : 'Fichier'}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <a href={file.url} target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-400 hover:underline">
                  Ouvrir
                </a>
                <a href={file.downloadUrl || file.url} className="font-medium text-indigo-400 hover:underline">
                  Télécharger
                </a>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">Aucun fichier partagé dans cette salle.</p>
      )}
    </div>
  );
}