'use client';

import { useEffect, useRef, useState } from 'react';
import { useMediaStream } from '@/src/hooks/useMediaStream';

export function VideoRoom() {
  const { stream, error, loading, startStream, stopStream, toggleAudio, toggleVideo } = useMediaStream();
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const [micActive, setMicActive] = useState(true);
  const [camActive, setCamActive] = useState(true);
  const [inCall, setInCall] = useState(false);

  useEffect(() => {
    if (stream && localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
  }, [stream]);

  const handleStartCall = async () => {
    const activeStream = await startStream(true, true);
    if (activeStream) {
      setInCall(true);
    }
  };

  const handleEndCall = () => {
    stopStream();
    setInCall(false);
  };

  const handleToggleMic = () => {
    const nextState = !micActive;
    setMicActive(nextState);
    toggleAudio(nextState);
  };

  const handleToggleCam = () => {
    const nextState = !camActive;
    setCamActive(nextState);
    toggleVideo(nextState);
  };

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-4 text-sm text-red-300 bg-red-950/60 rounded-lg border border-red-700"
        >
          {error}
        </div>
      )}

      <div className="relative aspect-video w-full max-w-2xl mx-auto rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center shadow-2xl">
        {inCall ? (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover transform -scale-x-100"
          />
        ) : (
          <div className="text-center p-6 space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
              🎥
            </div>
            <p className="text-slate-400 text-sm">
              La caméra et le microphone ne sont activés qu&apos;avec votre consentement.
            </p>
          </div>
        )}

        {/* Indicateur d'état en direct */}
        {inCall && (
          <div className="absolute top-4 left-4 flex items-center gap-2 bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-full text-xs font-medium border border-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>En direct</span>
          </div>
        )}
      </div>

      {/* Contrôles de l'appel */}
      <div className="flex items-center justify-center gap-4">
        {!inCall ? (
          <button
            onClick={handleStartCall}
            disabled={loading}
            className="px-6 py-3 rounded-full bg-indigo-600 hover:bg-indigo-500 font-semibold text-white shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {loading ? 'Initialisation...' : 'Démarrer un test vidéo'}
          </button>
        ) : (
          <>
            <button
              onClick={handleToggleMic}
              aria-label={micActive ? 'Désactiver le microphone' : 'Activer le microphone'}
              className={`p-4 rounded-full font-semibold transition-colors focus:outline-none focus:ring-2 ${
                micActive
                  ? 'bg-slate-800 text-slate-200 hover:bg-slate-700 focus:ring-slate-500'
                  : 'bg-red-900/80 text-red-300 border border-red-700 hover:bg-red-800 focus:ring-red-500'
              }`}
            >
              {micActive ? '🎙️ Micro On' : '🎙️ Micro Off'}
            </button>

            <button
              onClick={handleToggleCam}
              aria-label={camActive ? 'Désactiver la caméra' : 'Activer la caméra'}
              className={`p-4 rounded-full font-semibold transition-colors focus:outline-none focus:ring-2 ${
                camActive
                  ? 'bg-slate-800 text-slate-200 hover:bg-slate-700 focus:ring-slate-500'
                  : 'bg-red-900/80 text-red-300 border border-red-700 hover:bg-red-800 focus:ring-red-500'
              }`}
            >
              {camActive ? '📹 Cam On' : '📹 Cam Off'}
            </button>

            <button
              onClick={handleEndCall}
              aria-label="Raccrocher et quitter la session"
              className="px-6 py-3 rounded-full bg-red-600 hover:bg-red-500 font-semibold text-white shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              Raccrocher
            </button>
          </>
        )}
      </div>
    </div>
  );
}