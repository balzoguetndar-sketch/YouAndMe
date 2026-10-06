'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/src/lib/supabase/clients';
import { ICE_SERVERS, sendSignal, subscribeToSignals, SignalData } from '@/src/lib/webrtc';
import { soundManager } from '@/src/lib/sound';
import { PricingPlans } from '@/src/components/subscription/PricingPlans';
import { Whiteboard } from '@/src/components/collaboration/Whiteboard';
import { FileShare } from '@/src/components/collaboration/FileShare';
import { AudioLevelVisualizer } from '@/src/components/call/AudioLevelVisualizer';

type ActiveCallRoomProps = {
  callerEmail: string;
  receiverEmail: string;
  isInitiator?: boolean;
  callType: 'video' | 'audio';
  ambience: string;
  onEndCall: () => void;
};

export function ActiveCallRoom({
  callerEmail,
  receiverEmail,
  isInitiator = true,
  callType,
  ambience,
  onEndCall,
}: ActiveCallRoomProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [remoteAudioStream, setRemoteAudioStream] = useState<MediaStream | null>(null);
  const [remoteAudioReceived, setRemoteAudioReceived] = useState(false);
  const [remoteVideoReceived, setRemoteVideoReceived] = useState(false);
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const [mediaWarning, setMediaWarning] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [activeTab, setActiveTab] = useState<'video' | 'tarifs' | 'whiteboard' | 'files'>('video');
  const [showPricingSetting, setShowPricingSetting] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    const saved = localStorage.getItem('yam_show_pricing_in_room');
    return saved === null ? true : saved === 'true';
  });

  const supabase = createClient();
  const roomId = [callerEmail, receiverEmail].sort().join('__').replace(/[^a-zA-Z0-9_-]/g, '_');

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

  // 2. Initialisation WebRTC complète avec file d'attente ICE Candidate sécurisée
  useEffect(() => {
    let isMounted = true;
    let localVideoElement = localVideoRef.current;
    let remoteVideoElement = remoteVideoRef.current;
    let remoteAudioElement = remoteAudioRef.current;
    const pendingIceCandidates: RTCIceCandidateInit[] = [];
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Stream distant accumulé
    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;

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
        videoElement.srcObject = remoteStream;
        videoElement.play().catch((error: unknown) => {
          console.warn('Lecture vidéo distante impossible :', error);
        });
      }

      soundManager.stop();
      if (isMounted) {
        if (event.track.kind === 'audio') setRemoteAudioReceived(true);
        if (event.track.kind === 'video') setRemoteVideoReceived(true);
        setConnectionStatus('connected');
      }
    };

    // Gestion des changements d'état de connexion ICE
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        if (isMounted) setConnectionStatus('connected');
      } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
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
          payload: event.candidate.toJSON(),
        });
      }
    };

    let resolveMediaReady: () => void;
    const mediaReadyPromise = new Promise<void>((resolve) => {
      resolveMediaReady = resolve;
    });

    // Démarrage des médias locaux et signalisation
    async function initCall() {
      let mediaStream: MediaStream | null = null;
      try {
        if (navigator?.mediaDevices?.getUserMedia) {
          const audioConstraints: MediaTrackConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: { ideal: 48000 },
            channelCount: { ideal: 2, min: 1 },
          };

          const videoConstraints: MediaTrackConstraints = {
            facingMode: 'user',
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 },
            frameRate: { ideal: 30, min: 15 },
          };

          try {
            // Tentative 1 : Qualité optimisée HD + Audio DSP anti-écho/anti-bruit
            mediaStream = await navigator.mediaDevices.getUserMedia({
              audio: audioConstraints,
              video: callType === 'video' ? videoConstraints : false,
            });
          } catch (e1) {
            console.warn('Tentative haute résolution échouée, tentative standard avec DSP...', e1);
            try {
              // Tentative 2 : Standard avec DSP audio
              mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
                video: callType === 'video',
              });
            } catch (e2) {
              console.warn('Tentative vidéo standard échouée, tentative audio seul...', e2);
              try {
                // Tentative 3 : Audio seul
                mediaStream = await navigator.mediaDevices.getUserMedia({
                  audio: { echoCancellation: true, noiseSuppression: true },
                });
                if (callType === 'video') {
                  setMediaWarning('Caméra indisponible ou occupée : l’appel continue en audio haute qualité.');
                }
              } catch (e3) {
                console.error('Périphériques audio/vidéo inaccessibles :', e3);
                setMediaWarning('Microphone ou caméra inaccessibles. Veuillez vérifier les autorisations dans votre navigateur ou application.');
              }
            }
          }
        }

        if (!isMounted) {
          if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        if (mediaStream) {
          localStreamRef.current = mediaStream;
          setStream(mediaStream);

            if (callType === 'video' && mediaStream.getVideoTracks().length === 0) {
              setMediaWarning('Caméra indisponible : l’appel continue sans votre vidéo.');
            }

          const videoElement = localVideoRef.current;
          if (videoElement) {
            localVideoElement = videoElement;
            videoElement.srcObject = mediaStream;
          }

          // Ajout des pistes au PeerConnection
          mediaStream.getTracks().forEach((track) => {
            pc.addTrack(track, mediaStream!);
          });
        }
      } catch (err) {
        console.error('Erreur accès média / WebRTC :', err);
      } finally {
        resolveMediaReady();
      }

      // Si l'utilisateur est l'appelant, il crée l'offre WebRTC
      if (isInitiator) {
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
            payload: offer,
            callType,
            ambience,
          });
        } catch (offerErr) {
          console.error('Erreur création offer :', offerErr);
        }
      }
    }

    initCall();

    // Écoute des signaux WebRTC distants
    const unsubscribeSignals = subscribeToSignals(callerEmail, async (signal: SignalData) => {
      if (!isMounted || !pcRef.current) return;
      const currentPc = pcRef.current;

      try {
        if (signal.type === 'offer' && !isInitiator) {
          // Attendre impérativement que les pistes locales soient capturées et ajoutées au PC avant de générer la réponse
          await mediaReadyPromise;

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
            payload: answer,
          });
        } else if (signal.type === 'answer' && isInitiator) {
          await currentPc.setRemoteDescription(
            new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit)
          );
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
          onEndCall();
        }
      } catch (signalErr) {
        console.error('Erreur traitement signal WebRTC :', signalErr);
      }
    });

    return () => {
      isMounted = false;
      soundManager.stop();
      unsubscribeSignals();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      if (localVideoElement) {
        localVideoElement.srcObject = null;
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
    };
  }, [callerEmail, receiverEmail, isInitiator, callType, ambience, onEndCall]);

  useEffect(() => {
    if (activeTab !== 'video') return;
    const remoteStream = remoteStreamRef.current;
    if (!remoteStream || !remoteVideoRef.current) return;

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

  const handleHangup = async () => {
    try {
      await sendSignal(receiverEmail, {
        type: 'call-ended',
        sender: callerEmail,
        target: receiverEmail,
      });
    } catch {}

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (pcRef.current) {
      pcRef.current.close();
    }
    onEndCall();
  };

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

  const getAmbianceBadge = (amb: string) => {
    switch (amb) {
      case 'love':
        return { label: '❤️ Ambiance Amoureuse', bg: 'bg-rose-950 text-rose-300 border-rose-800' };
      case 'family':
        return { label: '🏡 Ambiance Famille', bg: 'bg-amber-950 text-amber-300 border-amber-800' };
      case 'couple':
        return { label: '💍 Ambiance Couple', bg: 'bg-purple-950 text-purple-300 border-purple-800' };
      case 'friendship':
        return { label: '🤝 Ambiance Amitié', bg: 'bg-blue-950 text-blue-300 border-blue-800' };
      default:
        return { label: '⚪ Ambiance Neutre', bg: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  const badge = getAmbianceBadge(ambience);

  return (
    <div className="w-full max-w-5xl mx-auto bg-slate-950 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-6 text-slate-100 animate-in fade-in">
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-white">
              Communication en direct : <span className="text-indigo-400">{receiverEmail}</span>
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {connectionStatus === 'connected'
              ? '🟢 Flux P2P chiffré actif'
              : connectionStatus === 'connecting'
              ? '🟡 Négociation de la connexion...'
              : '🔴 Connexion interrompue'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${badge.bg}`}>
            {badge.label}
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 animate-pulse">
            🔴 Session Active
          </span>
          <button
            type="button"
            onClick={handleHangup}
            className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg transition-all flex items-center gap-1.5 cursor-pointer ml-1"
          >
            <span>🔴</span>
            <span>Raccrocher</span>
          </button>
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
          onClick={() => setActiveTab('whiteboard')}
          className={`px-4 py-2 rounded-xl font-semibold transition-all ${
            activeTab === 'whiteboard'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
          }`}
        >
          🎨 Tableau partagé
        </button>

        <button
          onClick={() => setActiveTab('files')}
          className={`px-4 py-2 rounded-xl font-semibold transition-all ${
            activeTab === 'files'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
          }`}
        >
          📁 Fichiers partagés
        </button>
      </div>

      {/* Vue 1 : Grille des Caméras */}
      {activeTab === 'video' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Flux de l'interlocuteur distant */}
          <div className="relative bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 h-52 sm:h-64 md:h-72 max-h-[46vh] flex items-center justify-center shadow-lg">
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
                <div className="w-16 h-16 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-2xl animate-pulse text-indigo-400">
                  {callType === 'audio' && remoteAudioReceived ? '🎙️' : '👤'}
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
                isMuted={!remoteAudioReceived}
                label="Audio distant"
                size="sm"
              />
            </div>
          </div>

          {/* Mon flux vidéo local */}
          <div className="relative bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 h-52 sm:h-64 md:h-72 max-h-[46vh] flex items-center justify-center shadow-lg">
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
                <div className="w-14 h-14 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-xl text-slate-400">
                  🎙️
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
      {activeTab === 'whiteboard' && <Whiteboard roomId={roomId} />}

      {/* Vue 4 : Partage de fichiers & images */}
      {activeTab === 'files' && <FileShare />}

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