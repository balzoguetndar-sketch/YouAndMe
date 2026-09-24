'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/clients';
import { ActiveCallRoom } from './ActiveCallRoom';
import { subscribeToPresence, subscribeToSignals, sendSignal, SignalData } from '@/src/lib/webrtc';

type Ambience = 'neutral' | 'love' | 'family' | 'couple' | 'friendship';
type CallType = 'video' | 'audio';

export function CallLauncher() {
  const [myEmail, setMyEmail] = useState('');
  const [peerEmail, setPeerEmail] = useState('');
  const [callType, setCallType] = useState<CallType>('video');
  const [ambience, setAmbience] = useState<Ambience>('neutral');
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // État de l'appel actif
  const [inCall, setInCall] = useState(false);
  const [isInitiator, setIsInitiator] = useState(true);

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
  }, [supabase]);

  // Suivi de présence en temps réel
  useEffect(() => {
    if (!myEmail) return;

    const unsubscribePresence = subscribeToPresence(myEmail, (users) => {
      setOnlineUsers(users);
    });

    const unsubscribeSignals = subscribeToSignals(myEmail, (signal: SignalData) => {
      if (signal.type === 'call-accepted') {
        setInCall(true);
      } else if (signal.type === 'call-rejected') {
        alert('Votre interlocuteur a décliné l’appel.');
        setInCall(false);
      }
    });

    return () => {
      unsubscribePresence();
      unsubscribeSignals();
    };
  }, [myEmail]);

  const cleanPeer = peerEmail.trim().toLowerCase();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanPeer);
  const isPeerOnline = isValidEmail && onlineUsers.has(cleanPeer);

  const handleStartCall = async () => {
    if (!cleanPeer || !myEmail) return;

    setIsInitiator(true);
    setInCall(true);

    // Envoi du signal d'appel
    await sendSignal(cleanPeer, {
      type: 'call-request',
      sender: myEmail,
      target: cleanPeer,
      callType,
      ambience,
    });
  };

  if (inCall && myEmail && cleanPeer) {
    return (
      <ActiveCallRoom
        callerEmail={myEmail}
        receiverEmail={cleanPeer}
        isInitiator={isInitiator}
        callType={callType}
        ambience={ambience}
        onEndCall={() => setInCall(false)}
      />
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl text-slate-100">
      <div className="space-y-1 text-center">
        <h2 className="text-xl font-bold">Lancer un appel direct Administrateur</h2>
        <p className="text-xs text-slate-400">
          Appelez n'importe quel utilisateur connecté en direct avec chiffrement WebRTC
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="peer-email" className="block text-xs font-semibold text-slate-300">
          E-mail de l'interlocuteur
        </label>
        <div className="relative">
          <input
            id="peer-email"
            type="email"
            value={peerEmail}
            onChange={(e) => setPeerEmail(e.target.value)}
            placeholder="utilisateur@exemple.com"
            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-3 text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
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
            🚀 Faire sonner & Démarrer l'appel ({ambience})
          </button>
        </div>
      )}
    </div>
  );
}