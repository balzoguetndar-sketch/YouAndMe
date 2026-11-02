'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/src/lib/supabase/clients';
import { ICE_SERVERS, sendSignal, subscribeToSignals, SignalData } from '@/src/lib/webrtc';
import { soundManager } from '@/src/lib/sound';
import { PricingPlans } from '@/src/components/subscription/PricingPlans';
import { Whiteboard } from '@/src/components/collaboration/Whiteboard';
import { FileShare } from '@/src/components/collaboration/FileShare';
import { AudioLevelVisualizer } from '@/src/components/call/AudioLevelVisualizer';
import { isMediaPermissionError } from '@/src/lib/mediaPermissions';
import {
  acquireHardwareLock,
  releaseHardware,
  registerActiveMediaStream,
} from '@/src/lib/hardwareCoordinator';
import {
  CALL_AUDIO_CONSTRAINTS,
  CALL_VIDEO_CONSTRAINTS,
  configureCallSenderQuality,
} from '@/src/lib/callMedia';
import type { RealtimeChannel } from '@supabase/supabase-js';

type WhiteboardOpenRequest = {
  requestId: string;
  senderEmail: string;
};

type FileShareOpenRequest = {
  requestId: string;
  senderEmail: string;
};

type ActiveCallRoomProps = {
  callerEmail: string;
  receiverEmail: string;
  callId: string;
  isInitiator?: boolean;
  callType: 'video' | 'audio';
  ambience: string;
  onEndCall: (notifyPeer?: boolean) => void;
};

type AmbienceTheme = {
  id: string;
  label: string;
  icon: string;
  badgeBg: string;
  roomBg: string;
  roomBorder: string;
  videoBorder: string;
  videoGlow: string;
  accentText: string;
  avatarBg: string;
  tagline: string;
};

const AMBIENCE_THEMES: Record<string, AmbienceTheme> = {
  neutral: {
    id: 'neutral',
    label: '⚪ Neutre',
    icon: '⚪',
    badgeBg: 'bg-slate-900 text-slate-300 border-slate-700',
    roomBg: 'bg-slate-950',
    roomBorder: 'border-slate-800',
    videoBorder: 'border-slate-800',
    videoGlow: 'shadow-xl shadow-slate-950/50',
    accentText: 'text-indigo-400',
    avatarBg: 'bg-slate-800 text-indigo-400',
    tagline: 'Échange sobre et confidentiel',
  },
  love: {
    id: 'love',
    label: '❤️ Amoureux',
    icon: '❤️',
    badgeBg: 'bg-rose-950 text-rose-300 border-rose-800',
    roomBg: 'bg-gradient-to-b from-rose-950/40 via-slate-950 to-pink-950/30',
    roomBorder: 'border-rose-900/60',
    videoBorder: 'border-rose-800/80',
    videoGlow: 'shadow-2xl shadow-rose-950/40',
    accentText: 'text-rose-400',
    avatarBg: 'bg-rose-950 text-rose-300 ring-2 ring-rose-500/40',
    tagline: 'Un moment privilégié et intime à deux',
  },
  family: {
    id: 'family',
    label: '🏡 Famille',
    icon: '🏡',
    badgeBg: 'bg-amber-950 text-amber-300 border-amber-800',
    roomBg: 'bg-gradient-to-b from-amber-950/35 via-slate-950 to-orange-950/25',
    roomBorder: 'border-amber-900/60',
    videoBorder: 'border-amber-800/80',
    videoGlow: 'shadow-2xl shadow-amber-950/40',
    accentText: 'text-amber-400',
    avatarBg: 'bg-amber-950 text-amber-300 ring-2 ring-amber-500/40',
    tagline: 'Chaleur et partage en famille',
  },
  couple: {
    id: 'couple',
    label: '💍 Couple',
    icon: '💍',
    badgeBg: 'bg-purple-950 text-purple-300 border-purple-800',
    roomBg: 'bg-gradient-to-b from-purple-950/40 via-slate-950 to-violet-950/30',
    roomBorder: 'border-purple-900/60',
    videoBorder: 'border-purple-800/80',
    videoGlow: 'shadow-2xl shadow-purple-950/40',
    accentText: 'text-purple-400',
    avatarBg: 'bg-purple-950 text-purple-300 ring-2 ring-purple-500/40',
    tagline: 'Complicité et harmonie à deux',
  },
  friendship: {
    id: 'friendship',
    label: '🤝 Amitié',
    icon: '🤝',
    badgeBg: 'bg-sky-950 text-sky-300 border-sky-800',
    roomBg: 'bg-gradient-to-b from-sky-950/35 via-slate-950 to-teal-950/25',
    roomBorder: 'border-sky-900/60',
    videoBorder: 'border-sky-800/80',
    videoGlow: 'shadow-2xl shadow-sky-950/40',
    accentText: 'text-sky-400',
    avatarBg: 'bg-sky-950 text-sky-300 ring-2 ring-sky-500/40',
    tagline: 'Détente et complicité amicale',
  },
};

export function ActiveCallRoom({
  callerEmail,
  receiverEmail,
  callId,
  isInitiator = true,
  callType,
  ambience,
  onEndCall,
}: ActiveCallRoomProps) {
  const [currentAmbience, setCurrentAmbience] = useState<string>(ambience || 'neutral');
  const [showAmbiencePicker, setShowAmbiencePicker] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const whiteboardControlChannelRef = useRef<RealtimeChannel | null>(null);
  const outgoingWhiteboardRequestIdRef = useRef<string | null>(null);
  const outgoingFileShareRequestIdRef = useRef<string | null>(null);
  const outgoingFileShareTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [remoteAudioStream, setRemoteAudioStream] = useState<MediaStream | null>(null);
  const [remoteAudioReceived, setRemoteAudioReceived] = useState(false);
  const [remoteVideoReceived, setRemoteVideoReceived] = useState(false);
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const [mediaWarning, setMediaWarning] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [connectionWarning, setConnectionWarning] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'video' | 'tarifs' | 'whiteboard' | 'files'>('video');
  const [isWhiteboardControlReady, setIsWhiteboardControlReady] = useState(false);
  const [incomingWhiteboardRequest, setIncomingWhiteboardRequest] = useState<WhiteboardOpenRequest | null>(null);
  const [outgoingWhiteboardRequestId, setOutgoingWhiteboardRequestId] = useState<string | null>(null);
  const [whiteboardRequestStatus, setWhiteboardRequestStatus] = useState<'accepted' | 'declined' | 'unavailable' | null>(null);
  const [incomingFileShareRequest, setIncomingFileShareRequest] = useState<FileShareOpenRequest | null>(null);
  const [outgoingFileShareRequestId, setOutgoingFileShareRequestId] = useState<string | null>(null);
  const [fileShareRequestStatus, setFileShareRequestStatus] = useState<'accepted' | 'declined' | 'unavailable' | null>(null);
  const [isFileShareAuthorized, setIsFileShareAuthorized] = useState(false);
  const [showPricingSetting, setShowPricingSetting] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    const saved = localStorage.getItem('yam_show_pricing_in_room');
    return saved === null ? true : saved === 'true';
  });
  const onEndCallRef = useRef(onEndCall);
  const callEndingRef = useRef(false);

  const supabase = createClient();
  const roomId = [callerEmail, receiverEmail].sort().join('__').replace(/[^a-zA-Z0-9_-]/g, '_');

  useEffect(() => {
    onEndCallRef.current = onEndCall;
  }, [onEndCall]);

  const finishCall = useCallback((notifyPeer: boolean) => {
    if (callEndingRef.current) return;
    callEndingRef.current = true;
    soundManager.stop();

    const localStream = localStreamRef.current;
    localStreamRef.current = null;
    localStream?.getTracks().forEach((track) => track.stop());

    const pc = pcRef.current;
    pcRef.current = null;
    pc?.close();

    const remoteStream = remoteStreamRef.current;
    remoteStreamRef.current = null;
    remoteStream?.getTracks().forEach((track) => track.stop());

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    releaseHardware();

    if (notifyPeer) {
      void sendSignal(receiverEmail, {
        type: 'call-ended',
        sender: callerEmail,
        target: receiverEmail,
        callId,
      }).catch((error: unknown) => {
        console.error('Erreur lors de la notification de fin d’appel :', error);
      });
    }

    onEndCallRef.current(false);
  }, [callerEmail, receiverEmail, callId]);

  // 1. Récupération & écoute en direct du réglage administrateur pour l'affichage des tarifs en salle
  useEffect(() => {
    // Écoute en direct des changements diffusés par l'administrateur
    const channel = supabase.channel('yam_admin_settings');
    channel
      .on('broadcast', { event: 'pricing_toggle' }, (payload) => {
        if (payload?.payload?.showPricing !== undefined) {
          setShowPricingSetting(Boolean(payload.payload.showPricing));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    let isActive = true;
    const channel = supabase.channel(`whiteboard-control:${roomId}`);
    whiteboardControlChannelRef.current = channel;

    channel
      .on('broadcast', { event: 'open-request' }, ({ payload }) => {
        const senderEmail = typeof payload?.from === 'string' ? payload.from : '';
        const targetEmail = typeof payload?.to === 'string' ? payload.to : '';
        const requestId = typeof payload?.requestId === 'string' ? payload.requestId : '';

        if (
          !requestId ||
          senderEmail.toLowerCase() !== receiverEmail.toLowerCase() ||
          targetEmail.toLowerCase() !== callerEmail.toLowerCase()
        ) return;

        setIncomingWhiteboardRequest({ requestId, senderEmail });
      })
      .on('broadcast', { event: 'open-response' }, ({ payload }) => {
        const senderEmail = typeof payload?.from === 'string' ? payload.from : '';
        const targetEmail = typeof payload?.to === 'string' ? payload.to : '';

        if (
          payload?.requestId !== outgoingWhiteboardRequestIdRef.current ||
          senderEmail.toLowerCase() !== receiverEmail.toLowerCase() ||
          targetEmail.toLowerCase() !== callerEmail.toLowerCase()
        ) return;

        outgoingWhiteboardRequestIdRef.current = null;
        setOutgoingWhiteboardRequestId(null);
        setWhiteboardRequestStatus(payload.accepted === true ? 'accepted' : 'declined');
      })
      .on('broadcast', { event: 'files-open-request' }, ({ payload }) => {
        const senderEmail = typeof payload?.from === 'string' ? payload.from : '';
        const targetEmail = typeof payload?.to === 'string' ? payload.to : '';
        const requestId = typeof payload?.requestId === 'string' ? payload.requestId : '';

        if (
          !requestId ||
          senderEmail.toLowerCase() !== receiverEmail.toLowerCase() ||
          targetEmail.toLowerCase() !== callerEmail.toLowerCase()
        ) return;

        setIncomingFileShareRequest({ requestId, senderEmail });
      })
      .on('broadcast', { event: 'files-open-response' }, ({ payload }) => {
        const senderEmail = typeof payload?.from === 'string' ? payload.from : '';
        const targetEmail = typeof payload?.to === 'string' ? payload.to : '';

        if (
          payload?.requestId !== outgoingFileShareRequestIdRef.current ||
          senderEmail.toLowerCase() !== receiverEmail.toLowerCase() ||
          targetEmail.toLowerCase() !== callerEmail.toLowerCase()
        ) return;

        if (outgoingFileShareTimeoutRef.current) clearTimeout(outgoingFileShareTimeoutRef.current);
        outgoingFileShareTimeoutRef.current = null;
        outgoingFileShareRequestIdRef.current = null;
        setOutgoingFileShareRequestId(null);
        if (payload.accepted === true) {
          setIsFileShareAuthorized(true);
          setActiveTab('files');
          setFileShareRequestStatus('accepted');
        } else {
          setFileShareRequestStatus('declined');
        }
      })
      .subscribe((status) => {
        if (isActive) setIsWhiteboardControlReady(status === 'SUBSCRIBED');
      });

    return () => {
      isActive = false;
      if (outgoingFileShareTimeoutRef.current) clearTimeout(outgoingFileShareTimeoutRef.current);
      outgoingFileShareTimeoutRef.current = null;
      whiteboardControlChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [supabase, roomId, callerEmail, receiverEmail]);

  const handleOpenWhiteboard = () => {
    setActiveTab('whiteboard');
    setWhiteboardRequestStatus(null);

    const channel = whiteboardControlChannelRef.current;
    if (!isWhiteboardControlReady || !channel) {
      setWhiteboardRequestStatus('unavailable');
      return;
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    outgoingWhiteboardRequestIdRef.current = requestId;
    setOutgoingWhiteboardRequestId(requestId);
    void channel.send({
      type: 'broadcast',
      event: 'open-request',
      payload: { requestId, from: callerEmail, to: receiverEmail },
    }).then((status) => {
      if (status !== 'ok') {
        outgoingWhiteboardRequestIdRef.current = null;
        setOutgoingWhiteboardRequestId(null);
        setWhiteboardRequestStatus('unavailable');
      }
    });
  };

  const respondToWhiteboardRequest = async (accepted: boolean) => {
    const request = incomingWhiteboardRequest;
    const channel = whiteboardControlChannelRef.current;
    if (!request || !channel) return;

    setIncomingWhiteboardRequest(null);
    if (accepted) setActiveTab('whiteboard');

    const status = await channel.send({
      type: 'broadcast',
      event: 'open-response',
      payload: {
        requestId: request.requestId,
        from: callerEmail,
        to: request.senderEmail,
        accepted,
      },
    });

    if (status !== 'ok') setWhiteboardRequestStatus('unavailable');
  };

  const handleOpenFiles = () => {
    setFileShareRequestStatus(null);
    if (isFileShareAuthorized) {
      setActiveTab('files');
      return;
    }

    const channel = whiteboardControlChannelRef.current;
    if (!isWhiteboardControlReady || !channel) {
      setFileShareRequestStatus('unavailable');
      return;
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    outgoingFileShareRequestIdRef.current = requestId;
    setOutgoingFileShareRequestId(requestId);
    outgoingFileShareTimeoutRef.current = setTimeout(() => {
      if (outgoingFileShareRequestIdRef.current !== requestId) return;
      outgoingFileShareRequestIdRef.current = null;
      setOutgoingFileShareRequestId(null);
      setFileShareRequestStatus('unavailable');
    }, 15000);

    void channel.send({
      type: 'broadcast',
      event: 'files-open-request',
      payload: { requestId, from: callerEmail, to: receiverEmail },
    }).then((status) => {
      if (status === 'ok') return;
      if (outgoingFileShareTimeoutRef.current) clearTimeout(outgoingFileShareTimeoutRef.current);
      outgoingFileShareTimeoutRef.current = null;
      outgoingFileShareRequestIdRef.current = null;
      setOutgoingFileShareRequestId(null);
      setFileShareRequestStatus('unavailable');
    });
  };

  const respondToFileShareRequest = async (accepted: boolean) => {
    const request = incomingFileShareRequest;
    const channel = whiteboardControlChannelRef.current;
    if (!request || !channel) return;

    setIncomingFileShareRequest(null);
    const status = await channel.send({
      type: 'broadcast',
      event: 'files-open-response',
      payload: {
        requestId: request.requestId,
        from: callerEmail,
        to: request.senderEmail,
        accepted,
      },
    });

    if (status !== 'ok') {
      setFileShareRequestStatus('unavailable');
      return;
    }
    if (accepted) {
      setIsFileShareAuthorized(true);
      setActiveTab('files');
    }
  };

  // 2. Initialisation WebRTC complète avec file d'attente ICE Candidate sécurisée
  useEffect(() => {
    let isMounted = true;
    let remoteVideoElement = remoteVideoRef.current;
    let remoteAudioElement = remoteAudioRef.current;
    const pendingIceCandidates: RTCIceCandidateInit[] = [];
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Stream distant accumulé
    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;
    let iceWarningTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearIceWarningTimeout = () => {
      if (iceWarningTimeout) clearTimeout(iceWarningTimeout);
      iceWarningTimeout = null;
    };

    // Fonction pour vider la file d'attente des candidats ICE dès que la remoteDescription est prête
    const processPendingIceCandidates = async () => {
      while (pendingIceCandidates.length > 0) {
        const candidate = pendingIceCandidates.shift();
        if (candidate && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.warn('Erreur lors du traitement d’un candidat ICE en attente :', err);
          }
        }
      }
    };

    // Réception des flux distants (Audio et Vidéo)
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach((track) => {
          if (!remoteStream.getTracks().some((t) => t.id === track.id)) {
            remoteStream.addTrack(track);
          }
        });
      } else if (event.track) {
        if (!remoteStream.getTracks().some((t) => t.id === event.track.id)) {
          remoteStream.addTrack(event.track);
        }
      }

      setRemoteAudioStream(remoteStream);

      const audioElement = remoteAudioRef.current;
      if (audioElement) {
        remoteAudioElement = audioElement;
        audioElement.srcObject = remoteStream;
        audioElement.play().then(() => {
          if (isMounted) setAudioPlaybackBlocked(false);
        }).catch((error: unknown) => {
          console.warn('Lecture audio distante bloquée par le navigateur :', error);
          if (isMounted) setAudioPlaybackBlocked(true);
        });
      }

      const videoElement = remoteVideoRef.current;
      if (videoElement) {
        remoteVideoElement = videoElement;
        videoElement.playsInline = true;
        videoElement.srcObject = remoteStream;
        videoElement.play().catch((error: unknown) => {
          console.warn('Lecture vidéo distante impossible :', error);
        });
      }

      soundManager.stop();
      if (isMounted) {
        if (event.track.kind === 'audio') setRemoteAudioReceived(true);
        if (event.track.kind === 'video') setRemoteVideoReceived(true);
        setConnectionWarning(null);
        setConnectionStatus('connected');
      }
    };

    // Gestion des changements d'état de connexion ICE
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        clearIceWarningTimeout();
        if (isMounted) setConnectionWarning(null);
        if (isMounted) setConnectionStatus('connected');
      } else if (pc.iceConnectionState === 'checking' || pc.iceConnectionState === 'disconnected') {
        if (!iceWarningTimeout) {
          iceWarningTimeout = setTimeout(() => {
            if (!isMounted || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') return;
            setConnectionWarning('La connexion média est bloquée. Ce réseau mobile peut nécessiter un relais TURN.');
          }, 12000);
        }
        if (pc.iceConnectionState === 'disconnected' && isMounted) setConnectionStatus('disconnected');
      } else if (pc.iceConnectionState === 'failed') {
        clearIceWarningTimeout();
        if (isMounted) {
          setConnectionStatus('disconnected');
          setConnectionWarning('Connexion média impossible. Un relais TURN doit être configuré pour ce réseau.');
        }
      } else if (pc.iceConnectionState === 'closed') {
        clearIceWarningTimeout();
        if (isMounted) setConnectionStatus('disconnected');
      }
    };

    // Envoi des candidats ICE à l'autre utilisateur
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(receiverEmail, {
          type: 'ice-candidate',
          sender: callerEmail,
          target: receiverEmail,
          callId,
          payload: event.candidate.toJSON(),
        });
      }
    };

    let resolveMediaReady: () => void;
    const mediaReadyPromise = new Promise<void>((resolve) => {
      resolveMediaReady = resolve;
    });
    let offerSent = false;
    let remoteOfferReceived = false;
    let remoteAnswerReceived = false;
    let readyRetryTimer: ReturnType<typeof setInterval> | null = null;

    const createAndSendOffer = async () => {
      if (offerSent || !isInitiator) return;
      offerSent = true;
      await mediaReadyPromise;
      if (!isMounted) return;

      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: callType === 'video',
        });
        await pc.setLocalDescription(offer);
        await sendSignal(receiverEmail, {
          type: 'offer',
          sender: callerEmail,
          target: receiverEmail,
          callId,
          payload: offer,
          callType,
          ambience,
        });
      } catch (offerErr) {
        offerSent = false;
        console.error('Erreur création offer :', offerErr);
      }
    };

    const sendPeerReady = () => sendSignal(receiverEmail, {
      type: 'peer-ready',
      sender: callerEmail,
      target: receiverEmail,
      callId,
    });

    // Démarrage des médias locaux et signalisation
    async function initCall() {
      let mediaStream: MediaStream | null = null;
      try {
        if (navigator?.mediaDevices?.getUserMedia) {
          const hardwareType = callType === 'video' ? 'video_audio' : 'audio_only';
          const lockAcquired = acquireHardwareLock(hardwareType);
          if (!lockAcquired) {
            setMediaWarning('La caméra et le microphone sont actuellement utilisés par un autre onglet. Dès que vous fermez cet onglet, les ressources seront automatiquement attribuées à cet appel.');
            resolveMediaReady();
            return;
          }

          if (callType === 'video') {
            try {
              // Tentative 1 : Qualité optimisée HD + Audio DSP anti-écho/anti-bruit
              mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: CALL_AUDIO_CONSTRAINTS,
                video: CALL_VIDEO_CONSTRAINTS,
              });
            } catch (e1) {
              if (isMediaPermissionError(e1)) {
                setMediaWarning('L’accès au microphone ou à la caméra a été refusé. Autorisez-les dans le navigateur avant de relancer l’appel.');
                return;
              }

              console.warn('Tentative haute résolution échouée, tentative mobile avant...', e1);
              try {
                // Tentative 2 : Caméra avant mobile avec contraintes allégées
                mediaStream = await navigator.mediaDevices.getUserMedia({
                  audio: CALL_AUDIO_CONSTRAINTS,
                  video: { facingMode: 'user' },
                });
              } catch (e2) {
                if (isMediaPermissionError(e2)) {
                  setMediaWarning('L’accès au microphone ou à la caméra a été refusé. Autorisez-les dans le navigateur avant de relancer l’appel.');
                  return;
                }

                console.warn('Tentative vidéo standard échouée, tentative vidéo de base...', e2);
                try {
                  // Tentative 2bis : N'importe quelle caméra disponible
                  mediaStream = await navigator.mediaDevices.getUserMedia({
                    audio: CALL_AUDIO_CONSTRAINTS,
                    video: true,
                  });
                } catch (e2bis) {
                  if (isMediaPermissionError(e2bis)) {
                    setMediaWarning('L’accès au microphone ou à la caméra a été refusé. Autorisez-les dans le navigateur avant de relancer l’appel.');
                    return;
                  }

                  console.warn('Tentatives vidéo échouées, tentative audio seul...', e2bis);
                  try {
                    // Tentative 3 : Audio seul
                    mediaStream = await navigator.mediaDevices.getUserMedia({
                      audio: CALL_AUDIO_CONSTRAINTS,
                    });
                    setMediaWarning('Caméra indisponible ou occupée : l’appel continue en audio haute qualité.');
                  } catch (e3) {
                    if (isMediaPermissionError(e3)) {
                      setMediaWarning('L’accès au microphone ou à la caméra a été refusé. Autorisez-les dans le navigateur avant de relancer l’appel.');
                      return;
                    }

                    console.error('Périphériques audio/vidéo inaccessibles :', e3);
                    setMediaWarning('Microphone ou caméra inaccessibles. Veuillez vérifier les autorisations dans votre navigateur ou application.');
                  }
                }
              }
            }
          } else {
            // Appel audio seul
            try {
              mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: CALL_AUDIO_CONSTRAINTS,
              });
            } catch (eAudio) {
              if (isMediaPermissionError(eAudio)) {
                setMediaWarning('L’accès au microphone a été refusé. Autorisez-le dans le navigateur avant de relancer l’appel.');
                return;
              }
              console.error('Microphone inaccessible :', eAudio);
              setMediaWarning('Microphone inaccessible. Veuillez vérifier les autorisations dans votre navigateur.');
            }
          }
        }

        if (!isMounted) {
          if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
          releaseHardware();
          return;
        }

        if (mediaStream) {
          const capturedStream = mediaStream;
          localStreamRef.current = capturedStream;
          setStream(capturedStream);
          registerActiveMediaStream(capturedStream, callType === 'video' ? 'video_audio' : 'audio_only');

            if (callType === 'video' && capturedStream.getVideoTracks().length === 0) {
              setMediaWarning('Caméra indisponible : l’appel continue sans votre vidéo.');
            }

          // Ajout des pistes au PeerConnection
          await Promise.all(capturedStream.getTracks().map(async (track) => {
            const sender = pc.addTrack(track, capturedStream);
            if (track.kind === 'audio' || track.kind === 'video') {
              await configureCallSenderQuality(sender, track.kind);
            }
          }));
        }
      } catch (err) {
        console.error('Erreur accès média / WebRTC :', err);
      } finally {
        resolveMediaReady();
      }

    }

    initCall();

    // Écoute des signaux WebRTC distants
    const unsubscribeSignals = subscribeToSignals(callerEmail, async (signal: SignalData) => {
      if (
        !isMounted ||
        !pcRef.current ||
        signal.callId !== callId ||
        signal.sender.toLowerCase() !== receiverEmail.toLowerCase() ||
        signal.target.toLowerCase() !== callerEmail.toLowerCase()
      ) return;
      const currentPc = pcRef.current;

      try {
        if (signal.type === 'offer' && !isInitiator) {
          if (remoteOfferReceived || currentPc.signalingState !== 'stable') return;
          remoteOfferReceived = true;
          if (readyRetryTimer) clearInterval(readyRetryTimer);
          // Attendre impérativement que les pistes locales soient capturées et ajoutées au PC avant de générer la réponse
          await mediaReadyPromise;

          if (!isMounted || currentPc.signalingState !== 'stable') return;

          try {
            await currentPc.setRemoteDescription(
              new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit)
            );
            await processPendingIceCandidates();

            const answer = await currentPc.createAnswer();
            await currentPc.setLocalDescription(answer);
            await sendSignal(receiverEmail, {
              type: 'answer',
              sender: callerEmail,
              target: receiverEmail,
              callId,
              payload: answer,
            });
          } catch (error) {
            remoteOfferReceived = false;
            throw error;
          }
        } else if (signal.type === 'answer' && isInitiator) {
          if (remoteAnswerReceived || currentPc.signalingState !== 'have-local-offer') return;
          remoteAnswerReceived = true;
          try {
            await currentPc.setRemoteDescription(
              new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit)
            );
          } catch (error) {
            remoteAnswerReceived = false;
            throw error;
          }
          await processPendingIceCandidates();
        } else if (signal.type === 'ice-candidate' && signal.payload) {
          // PROTECTION : Si la description distante n'est pas encore prête, on met en file d'attente
          if (currentPc.remoteDescription && currentPc.remoteDescription.type) {
            try {
              await currentPc.addIceCandidate(
                new RTCIceCandidate(signal.payload as RTCIceCandidateInit)
              );
            } catch (iceErr) {
              console.warn('Erreur ajout candidat ICE immédiat :', iceErr);
            }
          } else {
            pendingIceCandidates.push(signal.payload);
          }
        } else if (signal.type === 'call-ended') {
          finishCall(false);
        } else if (signal.type === 'ambience-changed' && signal.ambience) {
          setCurrentAmbience(signal.ambience);
        } else if (signal.type === 'peer-ready' && isInitiator) {
          await createAndSendOffer();
        }
      } catch (signalErr) {
        console.error('Erreur traitement signal WebRTC :', signalErr);
      }
    }, () => {
      if (!isInitiator) {
        if (readyRetryTimer) clearInterval(readyRetryTimer);
        void sendPeerReady();
        readyRetryTimer = setInterval(() => {
          void sendPeerReady();
        }, 1000);
      }
    });

    return () => {
      isMounted = false;
      soundManager.stop();
      clearIceWarningTimeout();
      unsubscribeSignals();
      if (readyRetryTimer) clearInterval(readyRetryTimer);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      if (remoteVideoElement?.srcObject === remoteStream) {
        remoteVideoElement.srcObject = null;
      }
      if (remoteAudioElement?.srcObject === remoteStream) {
        remoteAudioElement.srcObject = null;
      }
      remoteStream.getTracks().forEach((track) => track.stop());
      remoteStreamRef.current = null;
      setRemoteAudioStream(null);
      pc.close();
      releaseHardware();
    };
  }, [callerEmail, receiverEmail, callId, isInitiator, callType, ambience, finishCall]);

  useEffect(() => {
    const videoElement = localVideoRef.current;
    if (!videoElement || !stream || callType !== 'video' || camOff) return;

    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.srcObject = stream;
    void videoElement.play().catch((error: unknown) => {
      console.warn('Lecture vidéo locale impossible :', error);
    });

    return () => {
      if (videoElement.srcObject === stream) videoElement.srcObject = null;
    };
  }, [stream, callType, camOff]);

  useEffect(() => {
    if (activeTab !== 'video') return;
    const remoteStream = remoteStreamRef.current;
    if (!remoteStream || !remoteVideoRef.current) return;

    remoteVideoRef.current.playsInline = true;
    remoteVideoRef.current.srcObject = remoteStream;
    remoteVideoRef.current.play().catch((error: unknown) => {
      console.warn('Lecture vidéo distante impossible :', error);
    });
  }, [activeTab, remoteVideoReceived]);

  const toggleMic = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setMicMuted(!micMuted);
    }
  };

  const toggleCam = () => {
    if (localStreamRef.current && callType === 'video') {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setCamOff(!camOff);
    }
  };

  const handleHangup = () => finishCall(true);

  const handleEnableRemoteAudio = () => {
    const audio = remoteAudioRef.current;
    if (!audio) return;

    audio.play().then(() => {
      setAudioPlaybackBlocked(false);
    }).catch((error: unknown) => {
      console.warn('Activation audio distante impossible :', error);
      setAudioPlaybackBlocked(true);
    });
  };

  const hasLocalVideo = stream?.getVideoTracks().some((track) => track.readyState === 'live') ?? false;

  const handleSwitchAmbience = async (newAmbience: string) => {
    setCurrentAmbience(newAmbience);
    await sendSignal(receiverEmail, {
      type: 'ambience-changed',
      sender: callerEmail,
      target: receiverEmail,
      callId,
      ambience: newAmbience,
    }).catch(() => {});
  };

  const theme = AMBIENCE_THEMES[currentAmbience] || AMBIENCE_THEMES.neutral;

  return (
    <div className={`w-full max-w-5xl mx-auto border rounded-3xl p-4 sm:p-6 shadow-2xl space-y-6 text-slate-100 transition-all duration-700 animate-in fade-in ${theme.roomBg} ${theme.roomBorder}`}>
      <audio ref={remoteAudioRef} autoPlay playsInline className="sr-only" />

      {mediaWarning && (
        <p role="status" className="rounded-xl border border-amber-800 bg-amber-950/60 px-4 py-3 text-sm text-amber-200">
          {mediaWarning}
        </p>
      )}

      {audioPlaybackBlocked && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-800 bg-amber-950/60 px-4 py-3">
          <p className="text-sm text-amber-200">Le navigateur a bloqué le son du correspondant.</p>
          <button
            type="button"
            onClick={handleEnableRemoteAudio}
            className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600"
          >
            Activer le son
          </button>
        </div>
      )}

      {/* En-tête de la salle d'appel */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-white">
              Communication en direct : <span className={`transition-colors duration-500 ${theme.accentText}`}>{receiverEmail}</span>
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <p className="text-xs text-slate-400">
              {connectionStatus === 'connected'
                ? '🟢 Flux P2P chiffré actif'
                : connectionStatus === 'connecting'
                ? '🟡 Négociation de la connexion...'
                : '🔴 Connexion interrompue'}
            </p>
            <span className="text-slate-600 text-xs">•</span>
            <p className={`text-xs font-medium italic transition-colors duration-500 ${theme.accentText}`}>
              {theme.tagline}
            </p>
          </div>
          {connectionWarning && (
            <p className="mt-1 max-w-xl text-xs text-amber-300" role="status">
              {connectionWarning}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Sélecteur d'ambiance en direct */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAmbiencePicker((prev) => !prev)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 transition-all hover:scale-105 shadow-md cursor-pointer ${theme.badgeBg}`}
              title="Changer l'ambiance en direct (synchronisé avec votre correspondant)"
            >
              <span>{theme.label}</span>
              <span className="text-[10px] opacity-70">▾</span>
            </button>

            {showAmbiencePicker && (
              <div className="absolute right-0 top-full mt-2 z-50 w-52 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-700 p-2 shadow-2xl space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
                  Ambiance en direct
                </p>
                {Object.values(AMBIENCE_THEMES).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      void handleSwitchAmbience(item.id);
                      setShowAmbiencePicker(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                      currentAmbience === item.id
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <span>{item.label}</span>
                    {currentAmbience === item.id && <span>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 animate-pulse">
            🔴 Session Active
          </span>
        </div>
      </div>

      {/* Onglets d'outils collaboratifs et Tarifs dans la salle */}
      <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2 overflow-x-auto text-xs">
        <button
          onClick={() => setActiveTab('video')}
          className={`px-4 py-2 rounded-xl font-semibold transition-all ${
            activeTab === 'video'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
          }`}
        >
          📹 Vidéo / Audio
        </button>

        {showPricingSetting && (
          <button
            onClick={() => setActiveTab('tarifs')}
            className={`px-4 py-2 rounded-xl font-semibold transition-all border ${
              activeTab === 'tarifs'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                : 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60 hover:bg-emerald-900/50'
            }`}
          >
            💳 Grille Tarifaire
          </button>
        )}

        <button
          onClick={handleOpenWhiteboard}
          disabled={outgoingWhiteboardRequestId !== null}
          className={`px-4 py-2 rounded-xl font-semibold transition-all ${
            activeTab === 'whiteboard'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
          } disabled:cursor-wait disabled:opacity-60`}
        >
          🎨 Tableau partagé
        </button>

        <button
          onClick={handleOpenFiles}
          disabled={outgoingFileShareRequestId !== null || (!isFileShareAuthorized && !isWhiteboardControlReady)}
          className={`px-4 py-2 rounded-xl font-semibold transition-all disabled:cursor-wait disabled:opacity-60 ${
            activeTab === 'files'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
          }`}
        >
          {outgoingFileShareRequestId
            ? '⏳ En attente d’accord…'
            : !isFileShareAuthorized && !isWhiteboardControlReady
              ? 'Connexion aux partages…'
              : '📁 Fichiers partagés'}
        </button>
      </div>

      {incomingWhiteboardRequest && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-800/70 bg-indigo-950/40 px-4 py-3" role="status">
          <p className="text-sm text-slate-200">
            {incomingWhiteboardRequest.senderEmail} vous propose d&apos;ouvrir le tableau partagé.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void respondToWhiteboardRequest(true)}
              className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              Accepter
            </button>
            <button
              type="button"
              onClick={() => void respondToWhiteboardRequest(false)}
              className="rounded-md border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              Refuser
            </button>
          </div>
        </div>
      )}

      {incomingFileShareRequest && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-800/70 bg-indigo-950/40 px-4 py-3" role="status">
          <p className="text-sm text-slate-200">
            {incomingFileShareRequest.senderEmail} demande votre accord pour ouvrir le partage de fichiers.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void respondToFileShareRequest(true)}
              className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              Accepter
            </button>
            <button
              type="button"
              onClick={() => void respondToFileShareRequest(false)}
              className="rounded-md border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              Refuser
            </button>
          </div>
        </div>
      )}

      {outgoingWhiteboardRequestId && (
        <p className="text-xs text-slate-400" role="status">
          Demande envoyée à votre correspondant, en attente de sa réponse.
        </p>
      )}
      {whiteboardRequestStatus && !outgoingWhiteboardRequestId && (
        <p className="text-xs text-slate-400" role="status">
          {whiteboardRequestStatus === 'accepted' && 'Votre correspondant a accepté la demande d’ouverture du tableau.'}
          {whiteboardRequestStatus === 'declined' && 'Votre correspondant a refusé l’ouverture du tableau.'}
          {whiteboardRequestStatus === 'unavailable' && 'La demande n’a pas pu être transmise. Vérifiez la connexion puis réessayez.'}
        </p>
      )}
      {outgoingFileShareRequestId && (
        <p className="text-xs text-slate-400" role="status">
          Demande de partage envoyée ; vos fichiers ne seront proposés qu&apos;après l&apos;accord de votre correspondant.
        </p>
      )}
      {fileShareRequestStatus && !outgoingFileShareRequestId && (
        <p className="text-xs text-slate-400" role="status">
          {fileShareRequestStatus === 'accepted' && 'Votre correspondant a accepté le partage de fichiers.'}
          {fileShareRequestStatus === 'declined' && 'Votre correspondant a refusé le partage de fichiers.'}
          {fileShareRequestStatus === 'unavailable' && 'Aucune réponse reçue. Vérifiez la connexion puis redemandez l’accès.'}
        </p>
      )}

      {/* Vue 1 : Grille des Caméras */}
      {activeTab === 'video' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Flux de l'interlocuteur distant */}
          <div className={`relative bg-slate-900/90 rounded-2xl overflow-hidden border ${theme.videoBorder} ${theme.videoGlow} h-52 sm:h-64 md:h-72 max-h-[46vh] flex items-center justify-center shadow-lg transition-all duration-700`}>
            {callType === 'video' && remoteVideoReceived && (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            )}
            {(callType !== 'video' || !remoteVideoReceived) && (
              <div className="text-center p-6 space-y-3">
                <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center text-2xl animate-pulse transition-all duration-700 ${theme.avatarBg}`}>
                  {callType === 'audio' && remoteAudioReceived ? theme.icon : '👤'}
                </div>
                <p className="text-sm font-semibold text-slate-300">{receiverEmail}</p>
                <p className="text-xs text-slate-500">
                  {callType === 'audio' && remoteAudioReceived
                    ? 'Audio du correspondant connecté.'
                    : callType === 'video' && remoteAudioReceived
                    ? 'Audio connecté, en attente de la vidéo...'
                    : 'En attente de connexion du correspondant...'}
                </p>
              </div>
            )}
            <span className="absolute top-3 left-3 text-[11px] font-semibold bg-slate-950/80 backdrop-blur px-2.5 py-1 rounded-full text-indigo-300 border border-slate-700">
              {receiverEmail}
            </span>

            {/* Indicateur de réception audio distante */}
            <div className="absolute top-3 right-3">
              <AudioLevelVisualizer
                stream={remoteAudioStream}
                isAvailable={remoteAudioReceived}
                label={remoteAudioReceived ? 'Audio distant' : 'Audio non reçu'}
                size="sm"
              />
            </div>
          </div>

          {/* Mon flux vidéo local */}
          <div className={`relative bg-slate-900/90 rounded-2xl overflow-hidden border ${theme.videoBorder} ${theme.videoGlow} h-52 sm:h-64 md:h-72 max-h-[46vh] flex items-center justify-center shadow-lg transition-all duration-700`}>
            {callType === 'video' && !camOff && hasLocalVideo ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
            ) : (
              <div className="text-center p-6 space-y-2">
                <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center text-xl transition-all duration-700 ${theme.avatarBg}`}>
                  {callType === 'audio' ? theme.icon : '🎙️'}
                </div>
                <p className="text-xs text-slate-400">
                  {callType === 'audio'
                    ? 'Mode Audio Uniquement'
                    : camOff
                    ? 'Caméra locale désactivée'
                    : 'Aucune piste vidéo locale'}
                </p>
              </div>
            )}
            <span className="absolute top-3 left-3 text-[11px] font-semibold bg-slate-950/80 backdrop-blur px-2.5 py-1 rounded-full text-slate-300 border border-slate-700">
              Vous ({callerEmail})
            </span>

            {/* VU-Mètre du micro local en temps réel */}
            <div className="absolute top-3 right-3">
              <AudioLevelVisualizer
                stream={stream}
                isMuted={micMuted}
                label="Votre micro"
                size="sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Vue 2 : Tarifs affichés dans la salle d'appel */}
      {activeTab === 'tarifs' && (
        <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 max-h-[50vh] overflow-y-auto">
          <PricingPlans />
        </div>
      )}

      {/* Vue 3 : Tableau partagé synchrone */}
      <div className={activeTab === 'whiteboard' ? 'block' : 'hidden'} aria-hidden={activeTab !== 'whiteboard'}>
        <Whiteboard roomId={roomId} isInitiator={isInitiator} />
      </div>

      {/* Vue 4 : Partage de fichiers & images */}
      {activeTab === 'files' && isFileShareAuthorized && (
        <FileShare roomId={roomId} receiverEmail={receiverEmail} />
      )}

      {/* Barre de contrôle ergonomique sticky */}
      <div className="sticky bottom-0 bg-slate-950/95 backdrop-blur-md py-3 px-4 rounded-2xl border border-slate-800 shadow-2xl flex flex-wrap items-center justify-center gap-3 z-30">
        <button
          type="button"
          onClick={toggleMic}
          className={`px-4 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all border shadow-md flex items-center gap-2 cursor-pointer ${
            micMuted
              ? 'bg-red-950 border-red-700 text-red-300'
              : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
          }`}
        >
          {micMuted ? '🔇 Micro Coupé' : '🎙️ Micro Actif'}
        </button>

        {callType === 'video' && (
          <button
            type="button"
            onClick={toggleCam}
            className={`px-4 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all border shadow-md flex items-center gap-2 cursor-pointer ${
              camOff
                ? 'bg-red-950 border-red-700 text-red-300'
                : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
            }`}
          >
            {camOff ? '📷 Caméra Désactivée' : '📹 Caméra Active'}
          </button>
        )}

        <button
          type="button"
          onClick={handleHangup}
          className="px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold text-xs sm:text-sm shadow-xl transition-all flex items-center gap-2 cursor-pointer"
        >
          <span>🔴</span>
          <span>Raccrocher</span>
        </button>
      </div>
    </div>
  );
}