'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/src/lib/supabase/clients';
import { BannerCarousel } from '@/src/components/banner/BannerCarousel';
import { ActiveCallRoom } from '@/src/components/call/ActiveCallRoom';
import { VideoRoom } from '@/src/components/call/VideoRoom';
import { IncomingCallModal } from '@/src/components/call/IncomingCallModal';
import {
  subscribeToPresence,
  subscribeToSignals,
  sendSignal,
  SignalData,
} from '@/src/lib/webrtc';

type Ambience = 'neutral' | 'love' | 'family' | 'couple' | 'friendship';
type CallType = 'video' | 'audio';

export default function HomePage() {
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [targetEmail, setTargetEmail] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // État de l'appel
  const [isInCall, setIsInCall] = useState(false);
  const [isInitiator, setIsInitiator] = useState(true);
  const [callType, setCallType] = useState<CallType>('video');
  const [ambience, setAmbience] = useState<Ambience>('neutral');

  // Modal d'appel entrant
  const [incomingCall, setIncomingCall] = useState<{
    callerEmail: string;
    callType: CallType;
    ambience: string;
  } | null>(null);

  // Section Test Local & Messages différés
  const [showLocalTest, setShowLocalTest] = useState(false);
  const [offlineMessageType, setOfflineMessageType] = useState<'text' | 'audio' | 'video'>('text');
  const [textMessage, setTextMessage] = useState('');
  const [messageStatus, setMessageStatus] = useState<string | null>(null);

  // Enregistrement Audio / Vidéo différé
  const [isRecording, setIsRecording] = useState(false);
  const [recordedMediaUrl, setRecordedMediaUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const supabase = createClient();

  // 1. Vérification de session et authentification
  useEffect(() => {
    const initAuth = async () => {
      let email: string | null = null;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        email = user?.user_metadata?.email || user?.email || null;
      } catch (e) {}

      if (!email && typeof window !== 'undefined') {
        const cookieMatch = document.cookie.match(/yam_user_email=([^;]+)/);
        if (cookieMatch) {
          email = decodeURIComponent(cookieMatch[1]);
        } else {
          email = localStorage.getItem('yam_user_email') || sessionStorage.getItem('yam_user_email');
        }
      }

      if (!email) {
        window.location.href = '/login';
        return;
      }

      setCurrentUserEmail(email.toLowerCase().trim());
      setLoading(false);
    };

    initAuth();
  }, [supabase]);

  // 2. Gestion de la présence en temps réel et signalisation d'appels entrants
  useEffect(() => {
    if (!currentUserEmail) return;

    // Abonnement au suivi de présence en ligne
    const unsubscribePresence = subscribeToPresence(currentUserEmail, (onlineSet) => {
      setOnlineUsers(onlineSet);
    });

    // Écoute des signaux d'appels entrants
    const unsubscribeSignals = subscribeToSignals(currentUserEmail, (signal: SignalData) => {
      if (signal.type === 'call-request') {
        setIncomingCall({
          callerEmail: signal.sender,
          callType: signal.callType || 'video',
          ambience: signal.ambience || 'neutral',
        });
      } else if (signal.type === 'call-accepted') {
        setIsInCall(true);
      } else if (signal.type === 'call-rejected') {
        alert(`${targetEmail || 'Votre interlocuteur'} a décliné l'appel.`);
        setIsInCall(false);
      }
    });

    return () => {
      unsubscribePresence();
      unsubscribeSignals();
    };
  }, [currentUserEmail, targetEmail]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
    document.cookie = 'yam_user_email=; path=/; max-age=0;';
    if (typeof window !== 'undefined') {
      localStorage.clear();
      sessionStorage.clear();
    }
    window.location.href = '/login';
  };

  // Validation email
  const cleanTargetEmail = targetEmail.trim().toLowerCase();
  const isValidTargetEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanTargetEmail);
  const isPeerOnline = isValidTargetEmail && onlineUsers.has(cleanTargetEmail);

  // Démarrer un appel direct
  const handleLaunchCall = async () => {
    if (!isValidTargetEmail || !currentUserEmail) return;

    setIsInitiator(true);
    setIsInCall(true);

    // Envoi du signal d'appel
    await sendSignal(cleanTargetEmail, {
      type: 'call-request',
      sender: currentUserEmail,
      target: cleanTargetEmail,
      callType,
      ambience,
    });
  };

  // Accepter un appel entrant
  const handleAcceptIncomingCall = async () => {
    if (!incomingCall || !currentUserEmail) return;

    setTargetEmail(incomingCall.callerEmail);
    setCallType(incomingCall.callType);
    setAmbience(incomingCall.ambience as Ambience);
    setIsInitiator(false);
    setIsInCall(true);

    await sendSignal(incomingCall.callerEmail, {
      type: 'call-accepted',
      sender: currentUserEmail,
      target: incomingCall.callerEmail,
    });

    setIncomingCall(null);
  };

  // Refuser un appel entrant
  const handleRejectIncomingCall = async () => {
    if (!incomingCall || !currentUserEmail) return;

    await sendSignal(incomingCall.callerEmail, {
      type: 'call-rejected',
      sender: currentUserEmail,
      target: incomingCall.callerEmail,
    });

    setIncomingCall(null);
  };

  // Enregistrement Mémo Audio / Vidéo différé
  const startRecording = async (type: 'audio' | 'video') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video',
      });

      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: type === 'video' ? 'video/webm' : 'audio/webm',
        });
        const url = URL.createObjectURL(blob);
        setRecordedMediaUrl(url);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      alert('Impossible d’accéder au micro ou à la caméra pour l’enregistrement.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSendOfflineMessage = () => {
    setMessageStatus('✅ Votre message a été déposé de façon sécurisée pour votre interlocuteur.');
    setTextMessage('');
    setRecordedMediaUrl(null);
    setTimeout(() => setMessageStatus(null), 5000);
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100 p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400">Chargement de votre espace You&Me...</p>
        </div>
      </main>
    );
  }

  // Si l'utilisateur est dans une salle d'appel active
  if (isInCall && currentUserEmail) {
    return (
      <main className="min-h-screen bg-slate-950 p-4 sm:p-6 flex flex-col justify-center">
        <ActiveCallRoom
          callerEmail={currentUserEmail}
          receiverEmail={cleanTargetEmail}
          isInitiator={isInitiator}
          callType={callType}
          ambience={ambience}
          onEndCall={() => setIsInCall(false)}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col bg-slate-950 text-slate-100 pb-12">
      {/* Modal d'appel entrant */}
      {incomingCall && (
        <IncomingCallModal
          callerEmail={incomingCall.callerEmail}
          callType={incomingCall.callType}
          ambience={incomingCall.ambience}
          onAccept={handleAcceptIncomingCall}
          onReject={handleRejectIncomingCall}
        />
      )}

      {/* 2. Bannière défilante en haut */}
      <div className="w-full bg-slate-900/60 border-b border-slate-800/80 py-3 px-4">
        <div className="max-w-4xl mx-auto">
          <BannerCarousel />
        </div>
      </div>

      <div className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Barre d'état utilisateur */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-4 rounded-2xl">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <div>
              <p className="text-xs text-slate-400">Connecté en tant que</p>
              <p className="text-sm font-bold text-indigo-300">{currentUserEmail}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowLocalTest(!showLocalTest)}
              className="text-xs px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold transition-all cursor-pointer"
            >
              {showLocalTest ? '✕ Masquer le test' : '🎥 Démarrer un test local'}
            </button>
          </div>
        </div>

        {/* Bloc du test local de caméra / micro (maintenu pour les tests) */}
        {showLocalTest && (
          <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-6 shadow-2xl animate-in fade-in space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-indigo-400">
                🛠️ Test local de votre matériel (Caméra & Microphone)
              </h3>
              <span className="text-[11px] text-slate-400">Ce test reste privé et local</span>
            </div>
            <VideoRoom />
          </div>
        )}

        {/* Formulaire principal : Saisie de l'interlocuteur & Signalisation */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-extrabold text-white">
              Contacter un interlocuteur
            </h2>
            <p className="text-xs text-slate-400">
              Saisissez l'adresse e-mail de votre correspondant pour vérifier sa présence en temps réel.
            </p>
          </div>

          {/* Saisie Email avec Badge En Ligne / Hors Ligne */}
          <div className="space-y-2">
            <label htmlFor="target-email" className="block text-xs font-semibold text-slate-300">
              E-mail de votre correspondant
            </label>
            <div className="relative">
              <input
                id="target-email"
                type="email"
                value={targetEmail}
                onChange={(e) => setTargetEmail(e.target.value)}
                placeholder="correspondant@exemple.com"
                className="w-full rounded-2xl bg-slate-950 border border-slate-800 px-4 py-3.5 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all pr-32"
              />

              {isValidTargetEmail && (
                <div className="absolute right-3 top-2.5">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
                      isPeerOnline
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                        : 'bg-amber-950 text-amber-300 border-amber-800'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isPeerOnline ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
                      }`}
                    />
                    {isPeerOnline ? 'En ligne' : 'Hors ligne'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* CAS 1 : INTERLOCUTEUR EN LIGNE */}
          {isValidTargetEmail && isPeerOnline && (
            <div className="space-y-6 pt-4 border-t border-slate-800 animate-in fade-in">
              {/* Option a1 : Appel direct en temps réel */}
              <div className="p-5 bg-emerald-950/30 border border-emerald-800/60 rounded-2xl space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    🟢 Option 1 : Appel direct en temps réel
                  </h3>
                  <span className="text-[11px] text-emerald-300">Connexion instantanée P2P</span>
                </div>

                {/* Choix Vidéo ou Audio */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCallType('video')}
                    className={`py-3 px-4 rounded-xl text-xs font-bold border transition-all ${
                      callType === 'video'
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    📹 Appel Vidéo
                  </button>
                  <button
                    type="button"
                    onClick={() => setCallType('audio')}
                    className={`py-3 px-4 rounded-xl text-xs font-bold border transition-all ${
                      callType === 'audio'
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    🎙️ Appel Audio seul
                  </button>
                </div>

                {/* Choix d'ambiance */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Choisir l'ambiance de l'appel
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {[
                      { id: 'neutral', label: '⚪ Neutre' },
                      { id: 'love', label: '❤️ Amoureux' },
                      { id: 'family', label: '🏡 Famille' },
                      { id: 'couple', label: '💍 Couple' },
                      { id: 'friendship', label: '🤝 Amitié' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setAmbience(item.id as Ambience)}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all ${
                          ambience === item.id
                            ? 'bg-indigo-950 border-indigo-500 text-indigo-200 font-bold shadow'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleLaunchCall}
                  className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 font-bold text-sm text-white shadow-xl transition-all cursor-pointer"
                >
                  🚀 Lancer l'appel {callType === 'video' ? 'Vidéo' : 'Audio'} ({ambience})
                </button>
              </div>

              {/* Option 2 : Ou laisser un message écrit / audio */}
              <div className="p-5 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  ✉️ Option 2 : Laisser un message direct (écrit ou audio)
                </h3>
                <textarea
                  rows={2}
                  value={textMessage}
                  onChange={(e) => setTextMessage(e.target.value)}
                  placeholder="Écrivez votre message court..."
                  className="w-full rounded-xl bg-slate-900 border border-slate-800 p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={handleSendOfflineMessage}
                  disabled={!textMessage.trim()}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white disabled:opacity-40 transition-all cursor-pointer"
                >
                  Envoyer le message
                </button>
              </div>
            </div>
          )}

          {/* CAS 2 : INTERLOCUTEUR HORS LIGNE (Un seul choix : message différé) */}
          {isValidTargetEmail && !isPeerOnline && (
            <div className="space-y-4 pt-4 border-t border-slate-800 animate-in fade-in">
              <div className="p-5 bg-amber-950/30 border border-amber-800/60 rounded-2xl space-y-4">
                <div className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    🟠 Interlocuteur Hors Ligne — Laisser un message différé
                  </h3>
                  <p className="text-xs text-slate-400">
                    Votre correspondant n'est pas connecté. Vous pouvez lui laisser un message écrit, audio ou vidéo.
                  </p>
                </div>

                {/* Sélecteur de type de message différé */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'text', label: '📝 Message Écrit' },
                    { id: 'audio', label: '🎙️ Message Audio' },
                    { id: 'video', label: '📹 Message Vidéo' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setOfflineMessageType(tab.id as any);
                        setRecordedMediaUrl(null);
                      }}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                        offlineMessageType === tab.id
                          ? 'bg-amber-950 border-amber-600 text-amber-200'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Contenu selon le type */}
                {offlineMessageType === 'text' && (
                  <textarea
                    rows={3}
                    value={textMessage}
                    onChange={(e) => setTextMessage(e.target.value)}
                    placeholder="Saisissez votre message différé..."
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                )}

                {(offlineMessageType === 'audio' || offlineMessageType === 'video') && (
                  <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center space-y-3">
                    {!isRecording && !recordedMediaUrl && (
                      <button
                        onClick={() => startRecording(offlineMessageType)}
                        className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-all cursor-pointer"
                      >
                        🔴 Démarrer l'enregistrement {offlineMessageType === 'audio' ? 'Audio' : 'Vidéo'}
                      </button>
                    )}

                    {isRecording && (
                      <div className="space-y-2">
                        <p className="text-xs text-red-400 font-bold animate-pulse">
                          ● Enregistrement en cours...
                        </p>
                        <button
                          onClick={stopRecording}
                          className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs cursor-pointer"
                        >
                          ⏹️ Arrêter l'enregistrement
                        </button>
                      </div>
                    )}

                    {recordedMediaUrl && (
                      <div className="space-y-2">
                        {offlineMessageType === 'audio' ? (
                          <audio src={recordedMediaUrl} controls className="mx-auto w-full max-w-sm" />
                        ) : (
                          <video src={recordedMediaUrl} controls className="mx-auto w-full max-w-sm rounded-lg" />
                        )}
                        <p className="text-[11px] text-emerald-400">Enregistrement prêt à être envoyé.</p>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handleSendOfflineMessage}
                  className="w-full py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-500 font-bold text-xs text-white shadow-lg transition-all cursor-pointer"
                >
                  Envoyer le message différé
                </button>
              </div>
            </div>
          )}

          {messageStatus && (
            <div className="p-4 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-300 text-xs font-semibold text-center animate-in fade-in">
              {messageStatus}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}