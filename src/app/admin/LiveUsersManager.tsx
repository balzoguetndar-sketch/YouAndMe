'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/clients';
import { subscribeToPresence, subscribeToSignals, sendSignal, SignalData } from '@/src/lib/webrtc';
import { soundManager } from '@/src/lib/sound';
import { logUserConnection } from '@/src/lib/logger';
import { ActiveCallRoom } from '@/src/components/call/ActiveCallRoom';
import { IncomingCallModal } from '@/src/components/call/IncomingCallModal';

interface LiveUsersManagerProps {
  adminEmail?: string;
}

export function LiveUsersManager({ adminEmail }: LiveUsersManagerProps) {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [myEmail, setMyEmail] = useState(() => adminEmail?.toLowerCase().trim() ?? '');
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Gestion des appels directs pour l'administrateur
  const [activeCallPeer, setActiveCallPeer] = useState<string | null>(null);
  const [callType, setCallType] = useState<'video' | 'audio'>('video');
  const [isInitiator, setIsInitiator] = useState(true);
  const [incomingCall, setIncomingCall] = useState<{
    callerEmail: string;
    callType: 'video' | 'audio';
    ambience: string;
  } | null>(null);

  const supabase = createClient();

  useEffect(() => {
    if (adminEmail) {
      return;
    }

    async function fetchUser() {
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

    void fetchUser();
  }, [adminEmail, supabase]);

  // Suivi de présence et écoute des signaux d'appel
  useEffect(() => {
    if (!myEmail) return;

    // Déverrouillage audio interactif
    const handleUnlock = () => soundManager.unlock();
    window.addEventListener('click', handleUnlock, { once: true });
    window.addEventListener('touchstart', handleUnlock, { once: true });

    // Suivi de présence
    const unsubscribePresence = subscribeToPresence(myEmail, (usersSet) => {
      setOnlineUsers(new Set(usersSet));
      // Auto-journalisation des utilisateurs connectés
      usersSet.forEach((u) => {
        if (u) logUserConnection(u).catch(() => {});
      });
    });

    // Écoute des signaux WebRTC
    const unsubscribeSignals = subscribeToSignals(myEmail, (signal: SignalData) => {
      if (signal.type === 'call-request') {
        setIncomingCall({
          callerEmail: signal.sender,
          callType: signal.callType || 'video',
          ambience: signal.ambience || 'neutral',
        });
      } else if (signal.type === 'call-accepted') {
        soundManager.stop();
        // L'interlocuteur a accepté
      } else if (signal.type === 'call-rejected') {
        soundManager.stop();
        alert(`${activeCallPeer || 'L’utilisateur'} a décliné l'appel.`);
        setActiveCallPeer(null);
      } else if (signal.type === 'call-ended') {
        soundManager.stop();
        setActiveCallPeer(null);
        setIncomingCall(null);
      }
    });

    return () => {
      window.removeEventListener('click', handleUnlock);
      window.removeEventListener('touchstart', handleUnlock);
      unsubscribePresence();
      unsubscribeSignals();
      soundManager.stop();
    };
  }, [myEmail, activeCallPeer]);

  const handleCopy = (email: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(email);
      setCopiedEmail(email);
      setTimeout(() => setCopiedEmail(null), 2500);
    }
  };

  // Lancer un appel direct vers un utilisateur en ligne
  const handleStartCall = async (peerEmail: string, type: 'video' | 'audio' = 'video') => {
    if (!peerEmail || !myEmail) return;

    const cleanPeer = peerEmail.toLowerCase().trim();
    setCallType(type);
    setIsInitiator(true);
    setActiveCallPeer(cleanPeer);

    // Déclenche la tonalité d'attente sortante pour l'administrateur
    soundManager.startOutgoingRingtone();

    // Envoi du signal d'appel
    await sendSignal(cleanPeer, {
      type: 'call-request',
      sender: myEmail,
      target: cleanPeer,
      callType: type,
      ambience: 'neutral',
    });
  };

  // Accepter un appel entrant
  const handleAcceptIncomingCall = async () => {
    if (!incomingCall || !myEmail) return;

    soundManager.stop();
    const caller = incomingCall.callerEmail;
    setCallType(incomingCall.callType);
    setIsInitiator(false);
    setActiveCallPeer(caller);
    setIncomingCall(null);

    await sendSignal(caller, {
      type: 'call-accepted',
      sender: myEmail,
      target: caller,
    });
  };

  // Refuser un appel entrant
  const handleRejectIncomingCall = async () => {
    if (!incomingCall || !myEmail) return;

    soundManager.stop();
    const caller = incomingCall.callerEmail;
    setIncomingCall(null);

    await sendSignal(caller, {
      type: 'call-rejected',
      sender: myEmail,
      target: caller,
    });
  };

  const handleEndCall = () => {
    soundManager.stop();
    if (activeCallPeer && myEmail) {
      sendSignal(activeCallPeer, {
        type: 'call-ended',
        sender: myEmail,
        target: activeCallPeer,
      }).catch(() => {});
    }
    setActiveCallPeer(null);
  };

  const allUsersList = Array.from(onlineUsers);
  const filteredUsers = allUsersList.filter((email) => {
    if (!searchFilter) return true;
    return email.toLowerCase().includes(searchFilter.toLowerCase());
  });

  const otherUsersCount = allUsersList.filter(
    (email) => email.toLowerCase() !== myEmail.toLowerCase()
  ).length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5 relative">
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

      {/* Salle d'appel actif en surimpression fluide */}
      {activeCallPeer && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md p-2 sm:p-4 md:p-6 flex flex-col items-center justify-center animate-in fade-in duration-200 overflow-y-auto">
          <div className="w-full max-w-5xl my-auto bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[96vh] overflow-y-auto">
            <ActiveCallRoom
              callerEmail={myEmail}
              receiverEmail={activeCallPeer}
              isInitiator={isInitiator}
              callType={callType}
              ambience="neutral"
              onEndCall={handleEndCall}
            />
          </div>
        </div>
      )}

      {/* En-tête avec compteur temps réel */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>👥</span> Utilisateurs Connectés en Temps Réel
            </h3>
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-extrabold bg-emerald-950 text-emerald-300 border border-emerald-700 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              {allUsersList.length} en direct
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Détection instantanée via Supabase Realtime • Cliquez sur <strong>Appeler</strong> pour lancer la communication immédiate
          </p>
        </div>

        {allUsersList.length > 0 && (
          <div className="w-full sm:w-64">
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Rechercher parmi les connectés..."
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        )}
      </div>

      {/* Liste des utilisateurs connectés */}
      {filteredUsers.length === 0 ? (
        <div className="text-center py-10 px-4 bg-slate-950/50 rounded-xl border border-dashed border-slate-800 space-y-2">
          <div className="text-3xl">📡</div>
          <p className="text-sm font-semibold text-slate-300">
            {searchFilter ? 'Aucun utilisateur connecté ne correspond à ce filtre.' : 'En attente d’utilisateurs en ligne'}
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Dès qu&apos;un visiteur ou utilisateur ouvre l&apos;application You&Me, son adresse e-mail apparaîtra ici instantanément.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredUsers.map((email) => {
            const isMe = email.toLowerCase() === myEmail.toLowerCase();
            const initial = email.charAt(0).toUpperCase();

            return (
              <div
                key={email}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                  isMe
                    ? 'bg-indigo-950/30 border-indigo-800/60 shadow-md'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 shadow-md'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-500 flex items-center justify-center font-bold text-white text-sm shadow shrink-0">
                      {initial}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-slate-100 truncate" title={email}>
                        {email}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-[11px] font-medium text-emerald-400">
                          {isMe ? 'Votre session (Admin)' : 'En ligne maintenant'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions rapides */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                  {!isMe && (
                    <div className="flex-1 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleStartCall(email, 'video')}
                        className="flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all flex items-center justify-center gap-1 shadow cursor-pointer"
                        title="Démarrer un appel vidéo"
                      >
                        <span>📹</span> Appeler
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartCall(email, 'audio')}
                        className="py-1.5 px-2.5 rounded-lg text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 transition-all flex items-center justify-center gap-1 shadow cursor-pointer"
                        title="Démarrer un appel audio seul"
                      >
                        <span>🎙️</span>
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleCopy(email)}
                    className="py-1.5 px-3 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 transition-all flex items-center justify-center gap-1 cursor-pointer"
                    title="Copier l'adresse email"
                  >
                    <span>{copiedEmail === email ? '✅' : '📋'}</span>
                    <span>{copiedEmail === email ? 'Copié' : 'Copier'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Résumé d'état */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
        <span>
          {otherUsersCount > 0
            ? `🟢 ${otherUsersCount} autre(s) utilisateur(s) actif(s) en ce moment.`
            : 'Aucun autre utilisateur actif pour le moment.'}
        </span>
        <span className="text-slate-600">Canal : yam_presence_room</span>
      </div>
    </div>
  );
}
