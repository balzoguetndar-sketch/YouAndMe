'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/clients';
import { ActiveCallRoom } from './ActiveCallRoom';

type Ambience = 'neutral' | 'love' | 'family' | 'couple' | 'friendship';
type CallType = 'video' | 'audio';

export function CallLauncher() {
  const [myEmail, setMyEmail] = useState('');
  const [peerEmail, setPeerEmail] = useState('');
  const [callType, setCallType] = useState<CallType>('video');
  const [ambience, setAmbience] = useState<Ambience>('neutral');
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  // État de l'appel actif
  const [inCall, setInCall] = useState(false);

  // Messages différés
  const [textMessage, setTextMessage] = useState('');
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [mediaSentMsg, setMediaSentMsg] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setMyEmail(user.user_metadata?.email || user.email || '');
      }
    }
    loadUser();
  }, [supabase]);

  const isValidEmail = (emailStr: string): boolean => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(emailStr);
  };

  useEffect(() => {
    const cleanEmail = peerEmail.trim().toLowerCase();

    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      setIsOnline(null);
      setChecking(false);
      return;
    }

    setChecking(true);

    const checkPresence = async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('connection_logs')
        .select('email')
        .eq('email', cleanEmail)
        .gte('connected_at', fiveMinutesAgo)
        .limit(1);

      if (error || !data || data.length === 0) {
        setIsOnline(false);
      } else {
        setIsOnline(true);
      }
      setChecking(false);
    };

    checkPresence();
    const interval = setInterval(checkPresence, 10000);
    return () => clearInterval(interval);
  }, [peerEmail, supabase]);

  const handleStartCall = () => {
    if (!peerEmail || isOnline !== true) return;
    setInCall(true);
  };

  if (inCall) {
    return (
      <ActiveCallRoom
        callerEmail={myEmail || 'Moi'}
        receiverEmail={peerEmail}
        callType={callType}
        ambience={ambience}
        onEndCall={() => setInCall(false)}
      />
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl text-slate-100">
      <h2 className="text-xl font-bold text-center">Lancer un appel ou laisser un message</h2>

      <div className="space-y-2">
        <label htmlFor="peer-email" className="block text-sm font-medium text-slate-300">
          E-mail de votre interlocuteur
        </label>
        <div className="relative">
          <input
            id="peer-email"
            type="email"
            value={peerEmail}
            onChange={(e) => setPeerEmail(e.target.value)}
            placeholder="interlocuteur@exemple.com"
            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-3 text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {checking && (
            <span className="absolute right-3 top-3.5 text-xs font-medium text-slate-400 animate-pulse">
              Vérification...
            </span>
          )}

          {!checking && isOnline !== null && (
            <span
              className={`absolute right-3 top-3.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                isOnline
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                  : 'bg-amber-950 text-amber-400 border-amber-800'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              {isOnline ? 'En ligne' : 'Hors ligne'}
            </span>
          )}
        </div>
      </div>

      {!checking && isOnline === true && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="p-4 bg-emerald-950/40 border border-emerald-800/50 rounded-xl space-y-4">
            <h3 className="text-xs font-bold uppercase text-emerald-400 tracking-wider">
              Option 1 : Appel direct en temps réel
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setCallType('video')}
                className={`py-3 px-4 rounded-xl border text-xs font-semibold transition-all ${
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
                className={`py-3 px-4 rounded-xl border text-xs font-semibold transition-all ${
                  callType === 'audio'
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                🎙️ Appel Audio seul
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">Choisir votre ambiance</label>
              <div className="grid grid-cols-3 gap-2">
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
                    className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                      ambience === item.id
                        ? 'bg-indigo-950 border-indigo-500 text-indigo-300 font-bold'
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
              className="w-full py-3.5 px-4 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-all shadow-lg cursor-pointer"
            >
              Démarrer l'appel {callType === 'video' ? 'Vidéo' : 'Audio'} ({ambience})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}