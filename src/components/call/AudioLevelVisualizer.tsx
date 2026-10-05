'use client';

import { useEffect, useRef, useState } from 'react';

interface AudioLevelVisualizerProps {
  stream: MediaStream | null;
  isMuted?: boolean;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function AudioLevelVisualizer({
  stream,
  isMuted = false,
  label = 'Micro',
  size = 'md',
}: AudioLevelVisualizerProps) {
  const [audioLevel, setAudioLevel] = useState(0); // 0 à 100
  const [isSpeaking, setIsSpeaking] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream || isMuted) {
      setAudioLevel(0);
      setIsSpeaking(false);
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0 || !audioTracks[0].enabled) {
      setAudioLevel(0);
      setIsSpeaking(false);
      return;
    }

    let isCancelled = false;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioCtx();
      audioContextRef.current = audioContext;

      // Déverrouillage si suspendu
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.5;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        if (isCancelled) return;

        analyser.getByteFrequencyData(dataArray);

        // Calcul du volume moyen (RMS)
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const normalized = Math.min(100, Math.round((average / 128) * 100));

        setAudioLevel(normalized);
        setIsSpeaking(normalized > 8);

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (e) {
      console.warn('Visualiseur audio indisponible :', e);
    }

    return () => {
      isCancelled = true;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [stream, isMuted]);

  // Nombre de barres du VU-mètre
  const barsCount = size === 'sm' ? 4 : size === 'lg' ? 8 : 6;

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/80 backdrop-blur border border-slate-800 shadow-md">
      {/* Icône du micro avec aura dynamique */}
      <span className="relative flex items-center justify-center">
        {isSpeaking && (
          <span className="absolute w-4 h-4 rounded-full bg-emerald-500/40 animate-ping" />
        )}
        <span className={`text-xs ${isMuted ? 'opacity-40' : isSpeaking ? 'text-emerald-400' : 'text-slate-400'}`}>
          {isMuted ? '🔇' : '🎙️'}
        </span>
      </span>

      {/* Barres animées du VU-mètre */}
      <div className="flex items-center gap-0.5 h-3.5">
        {Array.from({ length: barsCount }).map((_, idx) => {
          const threshold = ((idx + 1) / barsCount) * 100;
          const isActive = !isMuted && audioLevel >= threshold * 0.5;
          const heightPercent = isMuted ? 15 : isActive ? Math.max(25, (audioLevel / 100) * 100) : 20;

          return (
            <div
              key={idx}
              className={`w-1 rounded-full transition-all duration-75 ${
                isMuted
                  ? 'bg-slate-700 h-1'
                  : isActive
                  ? idx > barsCount - 3
                    ? 'bg-emerald-400'
                    : 'bg-indigo-400'
                  : 'bg-slate-700/60'
              }`}
              style={{ height: `${heightPercent}%`, minHeight: '3px' }}
            />
          );
        })}
      </div>

      {/* Libellé de statut */}
      <span className="text-[11px] font-semibold text-slate-300">
        {isMuted ? (
          <span className="text-red-400">Coupé</span>
        ) : isSpeaking ? (
          <span className="text-emerald-400 font-bold">Actif ({audioLevel}%)</span>
        ) : (
          <span className="text-slate-400">{label}</span>
        )}
      </span>
    </div>
  );
}
