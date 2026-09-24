'use client';

import { useState } from 'react';
import { createClient } from '@/src/lib/supabase/clients';

type SharedFile = {
  name: string;
  url: string;
  size: number;
};

export function FileShare() {
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const supabase = createClient();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setUploading(true);
    const file = selectedFiles[0];
    const filePath = `shared/${Date.now()}_${file.name}`;

    const { data, error } = await supabase.storage
      .from('session-files')
      .upload(filePath, file);

    setUploading(false);

    if (error) {
      alert(`Erreur d'envoi : ${error.message}`);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from('session-files')
      .getPublicUrl(data.path);

    setFiles((prev) => [
      ...prev,
      { name: file.name, url: publicUrlData.publicUrl, size: file.size },
    ]);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 shadow-xl">
      <h3 className="text-sm font-semibold text-slate-200">Fichiers & Images partagés</h3>

      <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl cursor-pointer bg-slate-950 transition-colors">
        <span className="text-xs text-slate-400">
          {uploading ? 'Envoi en cours...' : 'Cliquez pour partager une image ou un document'}
        </span>
        <input
          type="file"
          onChange={handleFileUpload}
          disabled={uploading}
          className="hidden"
        />
      </label>

      {files.length > 0 && (
        <ul className="space-y-2 max-h-40 overflow-y-auto">
          {files.map((file, idx) => (
            <li
              key={idx}
              className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300"
            >
              <span className="truncate max-w-[200px]">{file.name}</span>
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:underline font-medium"
              >
                Ouvrir
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}