'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/clients';
import { BannerCarousel } from '@/src/components/banner/BannerCarousel';
import { ActiveCallRoom } from '@/src/components/call/ActiveCallRoom';
import { VideoRoom } from '@/src/components/call/VideoRoom';
import { IncomingCallModal } from '@/src/components/call/IncomingCallModal';
import {
  subscribeToPresence,
  subscribeToSignals,
  sendSignal,
  sendCallRequestUntilReceived,
  SignalData,
} from '@/src/lib/webrtc';
import { soundManager } from '@/src/lib/sound';
import { logUserConnection } from '@/src/lib/logger';
import { PricingPlans } from '@/src/components/subscription/PricingPlans';
import { getUserUsage, incrementUserUsage, UserUsageInfo } from '@/src/lib/usage';
import { UsageLimitModal } from '@/src/components/subscription/UsageLimitModal';
import { ContactList } from '@/src/components/contact/ContactList';
import { useHeaderActions } from '@/src/components/layout/HeaderActionsContext';
import { ADMIN_EMAIL } from '@/src/lib/validation';
import { MediatorModal } from '@/src/components/contact/MediatorModal';

type Ambience = 'neutral' | 'love' | 'family' | 'couple' | 'friendship';
type CallType = 'video' | 'audio';

// Interface étendue pour inclure hideAds et planType sans erreur TypeScript
type ExtendedUserUsage = UserUsageInfo & {
  hideAds?: boolean;
  planType?: string | null;
};

export default function HomePage() {
  const router = useRouter();
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [authCheckError, setAuthCheckError] = useState<string | null>(null);
  const [userUsage, setUserUsage] = useState<ExtendedUserUsage | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [showMediatorModal, setShowMediatorModal] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [targetEmail, setTargetEmail] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showPricing, setShowPricing] = useState(false);
  const { setHeaderActions } = useHeaderActions();

  // État de l'appel
  const [isInCall, setIsInCall] = useState(false);
  const [isInitiator, setIsInitiator] = useState(true);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const incomingCallIdRef = useRef<string | null>(null);
  const handledCallRequestIdsRef = useRef(new Set<string>());
  const [callType, setCallType] = useState<CallType>('video');
  const [ambience, setAmbience] = useState<Ambience>('neutral');

  // Modal d'appel entrant
  const [incomingCall, setIncomingCall] = useState<{
    callerEmail: string;
    callType: CallType;
    ambience: string;
    callId: string;
  } | null>(null);

  // Section Test Local
  const [showLocalTest, setShowLocalTest] = useState(false);

  const supabase = createClient();

  // 1. Déverrouillage Audio automatique
  useEffect(() => {
    const handleUnlock = () => {
      soundManager.unlock();
    };
    window.addEventListener('click', handleUnlock, { once: true });
    window.addEventListener('touchstart', handleUnlock, { once: true });
    return () => {
      window.removeEventListener('click', handleUnlock);
      window.removeEventListener('touchstart', handleUnlock);
    };
  }, []);

  // 2. Vérification de session
  useEffect(() => {
    const initAuth = async () => {
      let email: string | null = null;

      if (typeof window !== 'undefined') {
        let response: Response;
        let sessionData: { email?: string; error?: string };
        try {
          response = await fetch('/api/auth/session', { method: 'POST', cache: 'no-store' });
          sessionData = (await response.json()) as { email?: string; error?: string };
        } catch {
          setAuthCheckError('Le service de connexion est momentanément indisponible.');
          setLoading(false);
          return;
        }

        if (response.status === 401 || response.status === 409) {
          try {
            await supabase.auth.signOut({ scope: 'local' });
          } catch {}
          await fetch('/api/auth/admin/logout', { method: 'POST' }).catch(() => {});
          sessionStorage.removeItem('yam_user_email');
          sessionStorage.removeItem('yam_session_active');
          router.replace('/login');
          return;
        }
        if (!response.ok || !sessionData.email) {
          setAuthCheckError(sessionData.error || 'Impossible de vérifier la session.');
          setLoading(false);
          return;
        }

        email = sessionData.email;
        setAuthCheckError(null);
        sessionStorage.setItem('yam_user_email', email);
        sessionStorage.setItem('yam_session_active', 'true');
        localStorage.setItem('yam_user_email', email);
        window.dispatchEvent(new Event('yam-session-restored'));
      }

      if (!email) {
        router.replace('/login');
        return;
      }

      const formattedEmail = email.toLowerCase().trim();
      setCurrentUserEmail(formattedEmail);

      try {
        const adminSession = await fetch('/api/auth/admin/session', { cache: 'no-store' });
        setIsAdminUser(formattedEmail === ADMIN_EMAIL.toLowerCase() && adminSession.ok);
      } catch {
        setIsAdminUser(false);
      }

      try {
        const usage = (await getUserUsage(formattedEmail)) as ExtendedUserUsage;
        setUserUsage(usage);
        setUsageError(null);
        if (usage.isLocked) {
          setShowUsageModal(true);
        }
      } catch (error) {
        setUserUsage(null);
        setUsageError(error instanceof Error ? error.message : 'Erreur de vérification du quota.');
      }

      setLoading(false);
      logUserConnection(formattedEmail).catch(() => {});
    };

    initAuth();
  }, [router, supabase]);

  // 3. Écoute Realtime des changements de licence/quota
  useEffect(() => {
    if (!currentUserEmail) return;

    const channel = supabase
      .channel(`user-usage-${currentUserEmail}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_usage',
          filter: `email=eq.${currentUserEmail}`,
        },
        async () => {
          try {
            const updatedUsage = (await getUserUsage(currentUserEmail)) as ExtendedUserUsage;
            setUserUsage(updatedUsage);
            if (!updatedUsage.isLocked) {
              setShowUsageModal(false);
              setUsageError(null);
            }
          } catch {}
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserEmail, supabase]);

  // 4. Actions complémentaires dans l'en-tête (Badge géré dynamiquement par HeaderNav.tsx)
  useEffect(() => {
    if (!currentUserEmail) {
      setHeaderActions(null);
      return;
    }

    setHeaderActions(
      <div className="flex flex-wrap items-center gap-2">
        {usageError ? (
          <span role="alert" className="text-xs font-semibold text-red-300">
            Erreur quota : {usageError}
          </span>
        ) : !userUsage?.hasLicense ? (
          !userUsage ? (
            <span role="status" className="text-xs font-semibold text-slate-400">
              Vérification du quota…
            </span>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-2 py-1.5 sm:px-3">
              <span className="text-xs font-semibold text-slate-300">
                🎯 <strong className={userUsage.remaining <= 2 ? 'text-red-400' : 'text-indigo-400'}>
                  {userUsage.remaining} / 10
                </strong> gratuits restants
              </span>
            </div>
          )
        ) : null}

        {isAdminUser && (
          <button
            onClick={() => setShowPricing(true)}
            className="text-[11px] font-bold text-amber-400 underline hover:text-amber-300"
          >
            Gérer les tarifs
          </button>
        )}
        <button
          onClick={() => setShowLocalTest((visible) => !visible)}
          className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-700"
        >
          {showLocalTest ? '✕ Masquer' : '🎥 Test'}
        </button>
      </div>
    );
  }, [currentUserEmail, isAdminUser, setHeaderActions, showLocalTest, usageError, userUsage]);

  useEffect(() => () => setHeaderActions(null), [setHeaderActions]);

  // 5. Signalisation & Présence WebRTC
  useEffect(() => {
    if (!currentUserEmail) return;

    const unsubscribePresence = subscribeToPresence(currentUserEmail, (onlineSet) => {
      setOnlineUsers(onlineSet);
    });

    const unsubscribeSignals = subscribeToSignals(currentUserEmail, (signal: SignalData) => {
      if (signal.type === 'call-request') {
        if (signal.target.toLowerCase() !== currentUserEmail.toLowerCase() || !signal.callId) return;
        void sendSignal(signal.sender, {
          type: 'call-request-received',
          sender: currentUserEmail,
          target: signal.sender,
          callId: signal.callId,
        });
        if (handledCallRequestIdsRef.current.has(signal.callId)) return;
        handledCallRequestIdsRef.current.add(signal.callId);
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
        setIsInCall(true);
      } else if (signal.type === 'call-rejected') {
        if (signal.callId !== activeCallIdRef.current) return;
        soundManager.stop();
        alert(`${targetEmail || 'Votre interlocuteur'} a décliné l'appel.`);
        setIsInCall(false);
        activeCallIdRef.current = null;
        setActiveCallId(null);
      } else if (signal.type === 'call-ended') {
        if (signal.callId !== activeCallIdRef.current && signal.callId !== incomingCallIdRef.current) return;
        soundManager.stop();
        setIsInCall(false);
        setIncomingCall(null);
        activeCallIdRef.current = null;
        incomingCallIdRef.current = null;
        setActiveCallId(null);
      }
    });

    return () => {
      unsubscribePresence();
      unsubscribeSignals();
      soundManager.stop();
    };
  }, [currentUserEmail, targetEmail]);

  const cleanTargetEmail = targetEmail.trim().toLowerCase();
  const isValidTargetEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanTargetEmail);
  const isPeerOnline = isValidTargetEmail && onlineUsers.has(cleanTargetEmail);

  const handleLaunchCall = async () => {
    if (!isValidTargetEmail || !currentUserEmail) return;

    setUsageError(null);
    setCallError(null);

    try {
      const latestUsage = (await getUserUsage(currentUserEmail)) as ExtendedUserUsage;
      setUserUsage(latestUsage);

      const result = await incrementUserUsage(currentUserEmail);
      setUserUsage(result.usage as ExtendedUserUsage);

      if (!result.allowed) {
        setShowUsageModal(true);
        return;
      }

      setShowUsageModal(false);
      setUsageError(null);

      soundManager.startOutgoingRingtone();
      setIsInitiator(true);
      setIsInCall(true);
      const callId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      activeCallIdRef.current = callId;
      setActiveCallId(callId);

      const received = await sendCallRequestUntilReceived(cleanTargetEmail, {
        type: 'call-request',
        sender: currentUserEmail,
        target: cleanTargetEmail,
        callId,
        callType,
        ambience,
      });

      if (!received) {
        soundManager.stop();
        activeCallIdRef.current = null;
        setActiveCallId(null);
        setIsInCall(false);
        setCallError('L’interlocuteur est en ligne mais n’a pas répondu à la poignée de main réseau. Réessayez.');
      }
    } catch (error) {
      setUsageError(error instanceof Error ? error.message : 'Erreur lors de la vérification du quota.');
    }
  };

  const handleAcceptIncomingCall = async () => {
    if (!incomingCall || !currentUserEmail) return;

    setUsageError(null);
    setCallError(null);
    try {
      const latestUsage = (await getUserUsage(currentUserEmail)) as ExtendedUserUsage;
      setUserUsage(latestUsage);

      const result = await incrementUserUsage(currentUserEmail);
      setUserUsage(result.usage as ExtendedUserUsage);

      if (!result.allowed) {
        setShowUsageModal(true);
        return;
      }

      setShowUsageModal(false);
      setUsageError(null);

      soundManager.stop();
      setTargetEmail(incomingCall.callerEmail);
      setCallType(incomingCall.callType);
      setAmbience(incomingCall.ambience as Ambience);
      setIsInitiator(false);
      activeCallIdRef.current = incomingCall.callId;
      incomingCallIdRef.current = null;
      setActiveCallId(incomingCall.callId);
      setIsInCall(true);

      await sendSignal(incomingCall.callerEmail, {
        type: 'call-accepted',
        sender: currentUserEmail,
        target: incomingCall.callerEmail,
        callId: incomingCall.callId,
      });

      setIncomingCall(null);
    } catch (error) {
      setUsageError(error instanceof Error ? error.message : 'Erreur de vérification du quota.');
    }
  };

  const handleRejectIncomingCall = async () => {
    if (!incomingCall || !currentUserEmail) return;

    soundManager.stop();
    const caller = incomingCall.callerEmail;
    const callId = incomingCall.callId;
    setIncomingCall(null);
    incomingCallIdRef.current = null;

    await sendSignal(caller, {
      type: 'call-rejected',
      sender: currentUserEmail,
      target: caller,
      callId,
    });
  };

  const handleSelectContact = (contactEmail: string, selectedCallType: CallType) => {
    setTargetEmail(contactEmail);
    setCallType(selectedCallType);
    window.scrollTo({ top: document.getElementById('contact-form')?.offsetTop ?? 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100 p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400">Chargement de You&Me...</p>
        </div>
      </main>
    );
  }

  if (authCheckError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100">
        <section className="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
          <h1 className="text-lg font-bold text-white">Connexion temporairement indisponible</h1>
          <p role="alert" className="text-sm text-red-300">{authCheckError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Réessayer
          </button>
        </section>
      </main>
    );
  }

  if (isInCall && currentUserEmail) {
    return (
      <main className="min-h-screen bg-slate-950 p-4 sm:p-6 flex flex-col justify-center">
        <ActiveCallRoom
          callerEmail={currentUserEmail}
          receiverEmail={cleanTargetEmail}
          callId={activeCallId || ''}
          isInitiator={isInitiator}
          callType={callType}
          ambience={ambience}
          onEndCall={() => {
            soundManager.stop();
            if (currentUserEmail && cleanTargetEmail) {
              sendSignal(cleanTargetEmail, {
                type: 'call-ended',
                sender: currentUserEmail,
                target: cleanTargetEmail,
                callId: activeCallId || undefined,
              }).catch(() => {});
            }
            activeCallIdRef.current = null;
            setActiveCallId(null);
            setIsInCall(false);
          }}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col bg-slate-950 text-slate-100 pb-12">
      {showUsageModal && userUsage && (
        <UsageLimitModal
          userUsage={userUsage}
          onLicenseActivated={async () => {
            if (currentUserEmail) {
              const updated = (await getUserUsage(currentUserEmail)) as ExtendedUserUsage;
              setUserUsage(updated);
            }
            setShowUsageModal(false);
          }}
          onClose={() => setShowUsageModal(false)}
        />
      )}

      {incomingCall && (
        <IncomingCallModal
          callerEmail={incomingCall.callerEmail}
          callType={incomingCall.callType}
          ambience={incomingCall.ambience}
          onAccept={handleAcceptIncomingCall}
          onReject={handleRejectIncomingCall}
        />
      )}

      {/* Encadré d'appel au soutien */}
      {!userUsage?.hideAds && (
        <div className="w-full bg-gradient-to-r from-indigo-950 via-purple-950 to-indigo-950 border-b border-indigo-500/40 py-2.5 px-4 shadow-lg">
          <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2 text-indigo-200 font-medium">
              <span className="text-base">⭐</span>
              <span>Aidez nous à poursuivre notre action en achetant une licence</span>
            </div>
            <button
              onClick={() => setShowPricing(!showPricing)}
              className="px-3.5 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white shadow-md transition-all cursor-pointer"
            >
              {showPricing ? '✕ Fermer les tarifs' : '💎 7 € avec pub, 12 € sans pub, soutien sans pub 50 € +'}
            </button>
          </div>
        </div>
      )}

      {/* Bannière de pub */}
      {!userUsage?.hideAds && (
        <div className="w-full bg-slate-900/60 border-b border-slate-800/80 py-3 px-4">
          <div className="max-w-4xl mx-auto">
            <BannerCarousel />
          </div>
        </div>
      )}

      {/* Section des Tarifs */}
      {showPricing && (
        <div className="w-full bg-slate-900/95 border-b border-indigo-500/30 p-4 sm:p-6 animate-in fade-in">
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-base font-bold text-indigo-400">💎 Tarifs des Licences You&Me</h3>
              <button
                onClick={() => setShowPricing(false)}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800"
              >
                ✕ Fermer
              </button>
            </div>
            <PricingPlans />
          </div>
        </div>
      )}

      <div className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6 flex-1">
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

        <ContactList
          currentUserEmail={currentUserEmail ?? ''}
          onlineUsers={onlineUsers}
          onSelectContact={handleSelectContact}
        />

        <div id="contact-form" className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-extrabold text-white">
              Contacter un interlocuteur
            </h2>
            <p className="text-xs text-slate-400">
              Saisissez l&apos;adresse e-mail de votre correspondant pour vérifier sa présence en temps réel.
            </p>
          </div>

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

          {callError && (
            <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-700/60 text-xs font-semibold text-amber-200">
              ⚠️ {callError}
            </div>
          )}

          {isValidTargetEmail && isPeerOnline && (
            <div className="space-y-6 pt-4 border-t border-slate-800 animate-in fade-in">
              <div className="p-5 bg-emerald-950/30 border border-emerald-800/60 rounded-2xl space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    🟢 Option 1 : Appel direct en temps réel
                  </h3>
                  <span className="text-[11px] text-emerald-300">Connexion instantanée P2P</span>
                </div>

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

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Choisir l&apos;ambiance de l&apos;appel
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
                  🚀 Lancer l&apos;appel {callType === 'video' ? 'Vidéo' : 'Audio'} ({ambience})
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pied de page avec lien pour saisir le médiateur */}
      <footer className="mt-8 text-center border-t border-slate-800/80 pt-6 pb-2 px-4">
        <button
          onClick={() => setShowMediatorModal(true)}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-indigo-400 transition-colors underline cursor-pointer"
        >
          <span>⚖️</span> Un litige ou une question ? Saisir le Médiateur / Administrateur (Réponse garantie sous 48h)
        </button>

        {showMediatorModal && currentUserEmail && (
          <MediatorModal
            userEmail={currentUserEmail}
            planType={userUsage?.planType}
            onClose={() => setShowMediatorModal(false)}
          />
        )}
      </footer>
    </main>
  );
}