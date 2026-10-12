'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/src/lib/supabase/clients';
import { ActiveCallRoom } from './ActiveCallRoom';
import { IncomingCallModal } from './IncomingCallModal';
import { subscribeToPresence, subscribeToSignals, sendSignal, sendCallRequestUntilReceived, SignalData } from '@/src/lib/webrtc';
import { soundManager } from '@/src/lib/sound';

type Ambience = 'neutral' | 'love' | 'family' | 'couple' | 'friendship';
type CallType = 'video' | 'audio';

export function CallLauncher() {
  const [myEmail, setMyEmail] = useState('');
  const [peerEmail, setPeerEmail] = useState('');
  const [callType, setCallType] = useState<CallType>('video');
  const [ambience, setAmbience] = useState<Ambience>('neutral');
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // État de l'appel
  const [inCall, setInCall] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [isInitiator, setIsInitiator] = useState(true);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  // Clé de session : incrémentée après chaque appel pour forcer le remount complet d'ActiveCallRoom
  const [callSessionKey, setCallSessionKey] = useState(0);
  const activeCallIdRef = useRef<string | null>(null);
  const incomingCallIdRef = useRef<string | null>(null);
  const handledCallRequestIdsRef = useRef(new Set<string>());

  // Appel entrant reçu
  const [incomingCall, setIncomingCall] = useState<{
    callerEmail: string;
    callType: CallType;
    ambience: string;
    callId: string;
  } | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function loadUser() {
      let email: string | null = null;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        email = user?.user_metadata?.email || user?.email || null;
      } catch {}

      if (!email && typeof window !== 'undefined') {
        const cookieMatch = document.cookie.match(/yam_user_email=([^;]+)/);
        if (cookieMatch) {
          email = decodeURIComponent(cookieMatch[1]);
        } else {
          email = localStorage.getItem('yam_user_email');
        }
      }

      if (email) {
        setMyEmail(email.toLowerCase().trim());
      }
    }
    loadUser();

    const handleSelectPeer = (event: Event) => {
      const customEvent = event as CustomEvent<{ email?: string }>;
      if (customEvent?.detail?.email) {
        setPeerEmail(customEvent.detail.email);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('yam:select-call-peer', handleSelectPeer as EventListener);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('yam:select-call-peer', handleSelectPeer as EventListener);
      }
    };
  }, [supabase]);

  // Suivi de présence en temps réel et signaux d'appel
  useEffect(() => {
    if (!myEmail) return;

    const unsubscribePresence = subscribeToPresence(myEmail, (users) => {
      setOnlineUsers(users);
    });

    const unsubscribeSignals = subscribeToSignals(myEmail, (signal: SignalData) => {
      if (signal.type === 'call-request') {
        if (signal.target.toLowerCase() !== myEmail.toLowerCase() || !signal.callId) return;
        void sendSignal(signal.sender, {
          type: 'call-request-received',
          sender: myEmail,
          target: signal.sender,
          callId: signal.callId,
        });
        if (handledCallRequestIdsRef.current.has(signal.callId)) return;
        handledCallRequestIdsRef.current.add(signal.callId);
        // Un utilisateur appelle l'administrateur
        incomingCallIdRef.current = signal.callId;
        setIncomingCall({
          callerEmail: signal.sender,
          callType: signal.callType || 'video',
          ambience: signal.ambience || 'neutral',
          callId: signal.callId,
        });
      } else if (signal.type === 'call-accepted') {
        if (signal.callId !== activeCallIdRef.current) return;
        soundManager.stop();
        setIsCalling(false);
        setInCall(true);
      } else if (signal.type === 'call-rejected') {
        if (signal.callId !== activeCallIdRef.current) return;
        soundManager.stop();
        setIsCalling(false);
        setInCall(false);
        activeCallIdRef.current = null;
        setActiveCallId(null);
        alert('Votre interlocuteur a décliné l’appel.');
      } else if (signal.type === 'call-ended') {
        if (signal.callId !== activeCallIdRef.current && signal.callId !== incomingCallIdRef.current) return;
        soundManager.stop();
        setIsCalling(false);
        setInCall(false);
        setIncomingCall(null);
        activeCallIdRef.current = null;
        incomingCallIdRef.current = null;
        handledCallRequestIdsRef.current.clear();
        setActiveCallId(null);
        setCallSessionKey((prev) => prev + 1);
      }
    });

    return () => {
      unsubscribePresence();
      unsubscribeSignals();
      soundManager.stop();
    };
  }, [myEmail]);

  const cleanPeer = peerEmail.trim().toLowerCase();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanPeer);
  const isPeerOnline = isValidEmail && onlineUsers.has(cleanPeer);

  // Lancer un appel sortant
  const handleStartCall = async () => {
    if (!cleanPeer || !myEmail) return;

    setIsInitiator(true);
    setIsCalling(true);
    const callId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    activeCallIdRef.current = callId;
    setActiveCallId(callId);

    // Joue la sonnerie sortante d'attente
    soundManager.startOutgoingRingtone();

    // Envoi du signal d'appel
    const received = await sendCallRequestUntilReceived(cleanPeer, {
      type: 'call-request',
      sender: myEmail,
      target: cleanPeer,
      callId,
      callType,
      ambience,
    });

    if (!received) {
      soundManager.stop();
      setIsCalling(false);
      activeCallIdRef.current = null;
      setActiveCallId(null);
      alert('La réception de l’invitation n’a pas été confirmée après plusieurs tentatives. Vérifiez que votre correspondant est connecté puis réessayez.');
    }
  };

  // Annuler un appel sortant
  const handleCancelCall = async () => {
    soundManager.stop();
    setIsCalling(false);
    const callId = activeCallIdRef.current;
    activeCallIdRef.current = null;
    setActiveCallId(null);
    if (cleanPeer && myEmail) {
      await sendSignal(cleanPeer, {
        type: 'call-ended',
        sender: myEmail,
        target: cleanPeer,
        callId: callId || undefined,
      });
    }
  };

  // Accepter un appel entrant
  const handleAcceptIncomingCall = async () => {
    if (!incomingCall || !myEmail) return;

    soundManager.stop();
    setPeerEmail(incomingCall.callerEmail);
    setCallType(incomingCall.callType);
    setAmbience(incomingCall.ambience as Ambience);
    setIsInitiator(false);
    activeCallIdRef.current = incomingCall.callId;
    incomingCallIdRef.current = null;
    setActiveCallId(incomingCall.callId);
    setInCall(true);
    setIncomingCall(null);

    await sendSignal(incomingCall.callerEmail, {
      type: 'call-accepted',
      sender: myEmail,
      target: incomingCall.callerEmail,
      callId: incomingCall.callId,
    });
  };

  // Refuser un appel entrant
  const handleRejectIncomingCall = async () => {
    if (!incomingCall || !myEmail) return;

    soundManager.stop();
    const caller = incomingCall.callerEmail;
    const callId = incomingCall.callId;
    setIncomingCall(null);
    incomingCallIdRef.current = null;

    await sendSignal(caller, {
      type: 'call-rejected',
      sender: myEmail,
      target: caller,
      callId,
    });
  };

  const handleEndCall = useCallback(() => {
    soundManager.stop();
    setInCall(false);
    setIsCalling(false);
    setIncomingCall(null);
    activeCallIdRef.current = null;
    incomingCallIdRef.current = null;
    handledCallRequestIdsRef.current.clear();
    setActiveCallId(null);
    setCallSessionKey((prev) => prev + 1);
  }, []);

  if (inCall && myEmail && cleanPeer) {
    return (
      <ActiveCallRoom
        key={callSessionKey}
        callerEmail={myEmail}
        receiverEmail={cleanPeer}
        callId={activeCallId || ''}
        isInitiator={isInitiator}
        callType={callType}
        ambience={ambience}
        onEndCall={handleEndCall}
      />
    );
  }

  return (
    <>
      {/* Modal d'appel entrant avec sonnerie */}
      {incomingCall && (
        <IncomingCallModal
          callerEmail={incomingCall.callerEmail}
          callType={incomingCall.callType}
          ambience={incomingCall.ambience}
          onAccept={handleAcceptIncomingCall}
          onReject={handleRejectIncomingCall}
        />
      )}

      <div className="w-full max-w-2xl mx-auto space-y-6 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl text-slate-100">
        <div className="space-y-1 text-center">
          <h2 className="text-xl font-bold">Lancer un appel direct Administrateur</h2>
          <p className="text-xs text-slate-400">
            Appelez n&apos;importe quel utilisateur connecté en direct avec sonnerie & chiffrement WebRTC
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="peer-email" className="block text-xs font-semibold text-slate-300">
            E-mail de l&apos;interlocuteur
          </label>
          <div className="relative">
            <input
              id="peer-email"
              type="email"
              value={peerEmail}
              onChange={(e) => setPeerEmail(e.target.value)}
              placeholder="utilisateur@exemple.com"
              disabled={isCalling}
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-3 text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm disabled:opacity-60"
            />

            {isValidEmail && (
              <span
                className={`absolute right-3 top-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
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
            )}
          </div>
        </div>

        {isValidEmail && (
          <div className="space-y-5 animate-in fade-in duration-300 pt-2 border-t border-slate-800">
            {!isCalling ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCallType('video')}
                    className={`py-3 px-4 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
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
                    className={`py-3 px-4 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      callType === 'audio'
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    🎙️ Appel Audio seul
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-300">Ambiance de session</label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
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
                        className={`py-2 px-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
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
                  onClick={handleStartCall}
                  className="w-full py-3.5 px-4 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-all shadow-xl cursor-pointer text-sm"
                >
                  🚀 Faire sonner &amp; Démarrer l&apos;appel ({ambience})
                </button>
              </>
            ) : (
              /* Écran d'attente d'appel sortant avec sonnerie */
              <div className="p-5 rounded-2xl bg-indigo-950/60 border border-indigo-800 text-center space-y-4 animate-pulse">
                <div className="flex items-center justify-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                  <p className="text-sm font-bold text-indigo-200">
                    Sonnerie en cours chez <span className="text-white">{cleanPeer}</span>... 
                  </p>
                </div>
                <p className="text-xs text-slate-400">
                  En attente que votre interlocuteur d&apos;écroche. Sonnerie audio active 🔔
                </p>
                <button
                  type="button"
                  onClick={handleCancelCall}
                  className="py-2.5 px-6 rounded-xl font-bold text-xs text-white bg-red-600 hover:bg-red-500 transition-all shadow-lg cursor-pointer"
                >
                  🔴 Raccrocher / Annuler l&apos;appel
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}