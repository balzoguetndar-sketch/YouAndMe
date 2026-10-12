'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';

type OfflineMessageModalProps = {
  senderEmail: string;
  recipientEmail: string;
  onClose: () => void;
};

const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const AUDIO_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Impossible de préparer le fichier audio.'));
        return;
      }
      resolve(reader.result.slice(reader.result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('Impossible de lire le fichier audio.'));
    reader.readAsDataURL(blob);
  });
}

export function OfflineMessageModal({ senderEmail, recipientEmail, onClose }: OfflineMessageModalProps) {
  const [subject, setSubject] = useState('Bonjour depuis You\u0026Me');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTooLargeRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const MAX_CHARS = 1000;

  const stopMicrophone = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const releaseAudioPreview = () => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setAudioUrl(null);
    setAudioBlob(null);
  };

  const startRecording = async () => {
    setAudioError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setAudioError('L’enregistrement audio n’est pas pris en charge par ce navigateur.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeType = AUDIO_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      recordingTooLargeRef.current = false;

      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        const size = audioChunksRef.current.reduce((total, chunk) => total + chunk.size, 0);
        if (size + event.data.size > MAX_AUDIO_BYTES) {
          recordingTooLargeRef.current = true;
          recorder.stop();
          return;
        }
        audioChunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        setAudioError('L’enregistrement audio a échoué. Réessayez.');
        stopMicrophone();
        setIsRecording(false);
      };

      recorder.onstop = () => {
        stopMicrophone();
        mediaRecorderRef.current = null;
        setIsRecording(false);
        if (recordingTooLargeRef.current) {
          audioChunksRef.current = [];
          setAudioError('L’enregistrement dépasse la limite de 2 Mio.');
          return;
        }

        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || audioChunksRef.current[0]?.type || 'audio/webm',
        });
        audioChunksRef.current = [];
        if (!blob.size) {
          setAudioError('Aucun son n’a été enregistré.');
          return;
        }

        releaseAudioPreview();
        const previewUrl = URL.createObjectURL(blob);
        audioUrlRef.current = previewUrl;
        setAudioBlob(blob);
        setAudioUrl(previewUrl);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
    } catch {
      stopMicrophone();
      setAudioError('Accès au micro refusé ou indisponible. Vérifiez les permissions du navigateur.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
  };

  const handleClose = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    stopMicrophone();
    onClose();
  };

  useEffect(() => () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  // Focus automatique sur le textarea à l'ouverture
  useEffect(() => {
    const timer = setTimeout(() => textareaRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, []);

  // Fermeture avec Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Fermeture automatique après succès
  useEffect(() => {
    if (status === 'success') {
      const timer = setTimeout(() => onClose(), 2800);
      return () => clearTimeout(timer);
    }
  }, [status, onClose]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if ((!message.trim() && !audioBlob) || sending || isRecording) return;

    setSending(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/contact/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderEmail,
          recipientEmail,
          subject: subject.trim() || 'Message via You&Me',
          message: message.trim(),
          audio: audioBlob
            ? { contentType: audioBlob.type || 'audio/webm', base64: await blobToBase64(audioBlob) }
            : undefined,
        }),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Échec de l\'envoi.');
      }
      setStatus('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur lors de l\'envoi.');
      setStatus('error');
    } finally {
      setSending(false);
    }
  };

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="offline-msg-title"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      {/* Panneau */}
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-900 shadow-2xl animate-in zoom-in-95 duration-200">

        {/* En-tête */}
        <div className="relative shrink-0 border-b border-slate-800 bg-gradient-to-br from-slate-800 to-slate-900 px-6 pt-6 pb-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-lg shadow-lg">
                ✉️
              </div>
              <div>
                <h2 id="offline-msg-title" className="text-base font-bold text-white">
                  Message à <span className="text-indigo-400">{recipientEmail}</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Sera livré par e-mail via You&amp;Me</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="mt-0.5 p-1.5 rounded-xl text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>

          {/* Méta expéditeur / destinataire */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-slate-950/60 px-3 py-2 border border-slate-800">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">De</p>
              <p className="text-xs font-semibold text-slate-300 truncate">{senderEmail}</p>
            </div>
            <div className="rounded-xl bg-indigo-950/50 px-3 py-2 border border-indigo-900/60">
              <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wider mb-0.5">À</p>
              <p className="text-xs font-semibold text-indigo-300 truncate">{recipientEmail}</p>
            </div>
          </div>
        </div>

        {/* Corps du formulaire */}
        <div className="min-h-0 overflow-y-auto overscroll-contain px-6 py-5">
          {status === 'success' ? (
            /* Écran de succès */
            <div className="flex flex-col items-center justify-center py-8 space-y-3 animate-in fade-in">
              <div className="w-14 h-14 rounded-full bg-emerald-950 border border-emerald-700 flex items-center justify-center text-2xl">
                ✅
              </div>
              <p className="text-base font-bold text-emerald-400">Message envoyé !</p>
              <p className="text-xs text-slate-400 text-center">
                Votre message a bien été livré à <strong className="text-slate-300">{recipientEmail}</strong>.
                <br />Cette fenêtre se ferme automatiquement…
              </p>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              {/* Champ objet */}
              <div className="space-y-1.5">
                <label htmlFor="offline-msg-subject" className="block text-xs font-semibold text-slate-400">
                  Objet
                </label>
                <input
                  id="offline-msg-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={120}
                  placeholder="Objet de votre message"
                  disabled={sending}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all disabled:opacity-60"
                />
              </div>

              {/* Zone de message */}
              <div className="space-y-1.5">
                <label htmlFor="offline-msg-body" className="flex items-center justify-between text-xs font-semibold text-slate-400">
                  <span>Message</span>
                  <span className={`font-normal tabular-nums ${message.length > MAX_CHARS * 0.9 ? 'text-amber-400' : 'text-slate-600'}`}>
                    {message.length} / {MAX_CHARS}
                  </span>
                </label>
                <textarea
                  ref={textareaRef}
                  id="offline-msg-body"
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, MAX_CHARS))}
                  rows={6}
                  placeholder={`Bonjour,\n\nJe vous contacte via You&Me…`}
                  disabled={sending}
                  required={!audioBlob}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all resize-none disabled:opacity-60 leading-relaxed"
                />
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-400">Message audio</p>
                  {isRecording ? (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white hover:bg-red-600"
                    >
                      ■ Arrêter l’enregistrement
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void startRecording()}
                      disabled={sending}
                      className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-600 disabled:opacity-50"
                    >
                      🎙️ {audioBlob ? 'Recommencer' : 'Enregistrer'}
                    </button>
                  )}
                  <span className="text-[10px] text-slate-500">2 Mio maximum</span>
                </div>
                {audioUrl && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <audio controls src={audioUrl} className="min-w-0 flex-1" aria-label="Écouter l’aperçu du message audio" />
                    <button
                      type="button"
                      onClick={releaseAudioPreview}
                      disabled={sending}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                    >
                      Supprimer
                    </button>
                  </div>
                )}
                {audioError && <p role="alert" className="text-xs text-amber-300">{audioError}</p>}
              </div>

              {/* Erreur */}
              {status === 'error' && errorMsg && (
                <div role="alert" className="rounded-xl bg-red-950/60 border border-red-800/60 px-4 py-2.5 text-xs text-red-300">
                  ⚠️ {errorMsg}
                </div>
              )}

              {/* Actions */}
              <div className="sticky bottom-0 -mx-6 flex items-center gap-3 border-t border-slate-800 bg-slate-900/95 px-6 pt-3 pb-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={sending}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-all disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={sending || isRecording || (!audioBlob && message.trim().length < 5)}
                  className="flex-[2] py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-sm font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Envoi en cours…
                    </>
                  ) : (
                    <>
                      📨 {audioBlob
                        ? message.trim() ? 'Envoyer le texte et l’audio' : 'Envoyer le message audio'
                        : 'Envoyer le message'}
                    </>
                  )}
                </button>
              </div>

              <p className="text-center text-[10px] text-slate-600 pt-1">
                  Le texte et l&apos;audio éventuel seront envoyés à l&apos;adresse e-mail de votre correspondant
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
