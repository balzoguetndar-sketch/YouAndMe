'use client';

import { useState, useCallback } from 'react';

export function useMediaStream() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const startStream = useCallback(async (video = true, audio = true) => {
    setLoading(true);
    setError(null);

    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('L’accès aux caméras/micros requiert une connexion sécurisée HTTPS (ou localhost).');
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video,
        audio,
      });
      setStream(mediaStream);
      setLoading(false);
      return mediaStream;
    } catch (err: unknown) {
      setLoading(false);
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Accès au microphone ou à la caméra refusé par l’utilisateur.');
        } else if (err.name === 'NotFoundError') {
          setError('Aucun périphérique vidéo ou audio trouvé sur cet appareil.');
        } else {
          setError(`Erreur média : ${err.message}`);
        }
      } else {
        setError('Impossible d’accéder aux périphériques médias.');
      }
      return null;
    }
  }, []);

  const stopStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  const toggleAudio = useCallback((enabled: boolean) => {
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }, [stream]);

  const toggleVideo = useCallback((enabled: boolean) => {
    if (stream) {
      stream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }, [stream]);

  return {
    stream,
    error,
    loading,
    startStream,
    stopStream,
    toggleAudio,
    toggleVideo,
  };
}