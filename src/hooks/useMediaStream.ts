'use client';

import { useState, useCallback, useEffect } from 'react';
import { isMediaPermissionError } from '@/src/lib/mediaPermissions';
import {
  acquireHardwareLock,
  releaseHardware,
  registerActiveMediaStream,
  initHardwareCoordinator,
} from '@/src/lib/hardwareCoordinator';
import {
  CALL_AUDIO_CONSTRAINTS,
  CALL_VIDEO_CONSTRAINTS,
} from '@/src/lib/callMedia';

export function useMediaStream() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Écoute de libération matérielle : si l'autre onglet est fermé, cet onglet peut reprendre le flux
  useEffect(() => {
    return initHardwareCoordinator((isNextEligible) => {
      if (isNextEligible && !stream) {
        // L'onglet précédent s'est fermé, la caméra et le micro sont libres
        setError(null);
      }
    });
  }, [stream]);

  const startStream = useCallback(async (video = true, audio = true) => {
    setLoading(true);
    setError(null);

    // Règle 2 : Vérification du verrou exclusif matériel entre onglets
    const hardwareType = video ? 'video_audio' : 'audio_only';
    const lockAcquired = acquireHardwareLock(hardwareType);
    if (!lockAcquired) {
      setLoading(false);
      setError('La caméra et le microphone sont actuellement utilisés par un autre onglet de votre navigateur. Dès que vous fermez cet onglet, les ressources seront automatiquement attribuées à cet onglet.');
      return null;
    }

    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('L’accès aux caméras/micros requiert une connexion sécurisée HTTPS (ou localhost).');
      }

      let mediaStream: MediaStream | null = null;

      // Tentative 1 : Contraintes optimisées HD + Audio DSP anti-écho
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: audio ? CALL_AUDIO_CONSTRAINTS : false,
          video: video ? CALL_VIDEO_CONSTRAINTS : false,
        });
      } catch (hdErr) {
        if (isMediaPermissionError(hdErr)) {
          throw hdErr;
        }

        console.warn('Tentative flux HD échouée, basculement en mode standard...', hdErr);
        // Tentative 2 : Standard avec audio DSP basique
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: audio ? { echoCancellation: true, noiseSuppression: true } : false,
            video: video,
          });
        } catch (stdErr) {
          if (isMediaPermissionError(stdErr)) {
            throw stdErr;
          }

          console.warn('Tentative standard échouée, tentative audio seul...', stdErr);
          if (audio) {
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setError('Caméra indisponible ou occupée. Le micro est actif.');
          } else {
            throw stdErr;
          }
        }
      }

      if (mediaStream) {
        setStream(mediaStream);
        registerActiveMediaStream(mediaStream, hardwareType);
      }
      setLoading(false);
      return mediaStream;
    } catch (err: unknown) {
      releaseHardware();
      setLoading(false);
      if (err instanceof Error) {
        if (isMediaPermissionError(err)) {
          setError('Accès au microphone ou à la caméra refusé. Veuillez autoriser l’accès dans les paramètres du navigateur ou de l’application.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setError('Aucun périphérique vidéo ou audio détecté sur cet appareil.');
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          setError('La caméra ou le micro est déjà utilisé par une autre application.');
        } else {
          setError(`Erreur d’accès matériel : ${err.message}`);
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
    releaseHardware();
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
