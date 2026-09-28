'use client';

import { useEffect } from 'react';
import { soundManager } from '@/src/lib/sound';

type IncomingCallModalProps = {
  callerEmail: string;
  callType: 'audio' | 'video';
  ambience: string;
  onAccept: () => void;
  onReject: () => void;
};

export function IncomingCallModal({
  callerEmail,
  callType,
  ambience,
  onAccept,
  onReject,
}: IncomingCallModalProps) {
  useEffect(() => {
    // Démarre la sonnerie d'appel entrant
    soundManager.startIncomingRingtone();

    return () => {
      soundManager.stop();
    };
  }, []);

  const handleAcceptCall = () => {
    soundManager.stop();
    onAccept();
  };

  const handleRejectCall = () => {
    soundManager.stop();
    onReject();
  };

  const initial = callerEmail.charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-slate-900 border-2 border-indigo-500/50 rounded-3xl p-6 sm:p-8 text-center space-y-6 shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden">
        {/* Effet lumineux d'arrière-plan */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-600/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-emerald-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Avatar animé avec ondes sonores */}
        <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" />
          <div className="absolute -inset-2 rounded-full border border-indigo-500/40 animate-pulse" />
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center text-2xl font-bold shadow-xl">
            {initial}
          </div>
          <span className="absolute bottom-0 right-1 bg-slate-900 border border-slate-700 p-1.5 rounded-full text-sm">
            {callType === 'video' ? '📹' : '🎙️'}
          </span>
        </div>

        {/* Détails de l'appelant */}
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 text-xs font-bold uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
            <span>Appel entrant • Sonnerie en cours</span>
          </div>

          <h3 className="text-xl sm:text-2xl font-extrabold text-white truncate px-2" title={callerEmail}>
            {callerEmail}
          </h3>

          <p className="text-xs sm:text-sm text-slate-400">
            Souhaite démarrer un appel <strong>{callType === 'video' ? 'Vidéo' : 'Audio'}</strong> en ambiance{' '}
            <span className="text-indigo-300 font-semibold capitalize">{ambience}</span>.
          </p>
        </div>

        {/* Boutons d'action : Accepter ou Refuser */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          <button
            type="button"
            onClick={handleRejectCall}
            className="py-3.5 px-4 rounded-2xl bg-red-600/90 hover:bg-red-500 font-bold text-white transition-all shadow-lg hover:shadow-red-600/30 flex items-center justify-center gap-2 cursor-pointer text-sm"
          >
            <span>🔴</span>
            <span>Refuser</span>
          </button>

          <button
            type="button"
            onClick={handleAcceptCall}
            className="py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white transition-all shadow-xl hover:shadow-emerald-600/40 flex items-center justify-center gap-2 cursor-pointer text-sm animate-pulse"
          >
            <span>🟢</span>
            <span>Décrocher</span>
          </button>
        </div>
      </div>
    </div>
  );
}