'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/clients';
import { logUserConnection, clearSessionConnectionLog } from '@/src/lib/logger';
import { BannerCarousel } from '@/src/components/banner/BannerCarousel';
import { PrivacyManifesto } from '@/src/components/layout/PrivacyManifesto';
import { validateEmail, ADMIN_EMAIL } from '@/src/lib/validation';
import { broadcastSessionChange } from '@/src/lib/tabCoordinator';

const MAGIC_HANDOFF_STORAGE_KEY = 'yam_magic_handoff';
const MAGIC_HANDOFF_TTL_MS = 15 * 60 * 1000;
const HANDOFF_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MagicHandoff = { id: string; email: string; createdAt: number };

type HandoffCredential =
  | { type: 'token_hash'; value: string }
  | { type: 'code'; value: string }
  | { type: 'session'; accessToken: string; refreshToken: string };

function generateMagicHandoffId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return Array.from(bytes, (byte, index) => {
    const hex = byte.toString(16).padStart(2, '0');
    return [4, 6, 8, 10].includes(index) ? `-${hex}` : hex;
  }).join('');
}

function parseMagicHandoff(value: string | null): MagicHandoff | null {
  if (!value) return null;
  try {
    const handoff: unknown = JSON.parse(value);
    if (!handoff || typeof handoff !== 'object') return null;
    const candidate = handoff as Record<string, unknown>;
    if (
      typeof candidate.id !== 'string'
      || !HANDOFF_ID_PATTERN.test(candidate.id)
      || typeof candidate.email !== 'string'
      || typeof candidate.createdAt !== 'number'
      || Date.now() - candidate.createdAt < 0
      || Date.now() - candidate.createdAt >= MAGIC_HANDOFF_TTL_MS
    ) return null;
    return { id: candidate.id, email: candidate.email, createdAt: candidate.createdAt };
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'admin_code'>('email');
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [suggestedEmail, setSuggestedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingHandoff, setPendingHandoff] = useState<MagicHandoff | null>(null);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const savedEmail = localStorage.getItem('yam_user_email');
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const userEmail = data.user?.email?.trim().toLowerCase();
      const remembered = userEmail && data.user?.email_confirmed_at && userEmail !== ADMIN_EMAIL.toLowerCase()
        ? userEmail
        : savedEmail;
      if (remembered) {
        setEmail((prev) => (prev ? prev : remembered));
      }
      if (userEmail && data.user?.email_confirmed_at && userEmail !== ADMIN_EMAIL.toLowerCase()) {
        localStorage.setItem('yam_user_email', userEmail);
      }
    });

    return () => { active = false; };
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const handoff = parseMagicHandoff(localStorage.getItem(MAGIC_HANDOFF_STORAGE_KEY));
      if (handoff) {
        sessionStorage.setItem(MAGIC_HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
        setPendingHandoff(handoff);
        setEmail(handoff.email);
        setInfoMessage('Lien magique envoyé. Ouvrez-le dans votre e-mail ; cette page terminera la connexion automatiquement.');
      } else {
        localStorage.removeItem(MAGIC_HANDOFF_STORAGE_KEY);
        sessionStorage.removeItem(MAGIC_HANDOFF_STORAGE_KEY);
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const reason = params.get('reason');
          if (reason === 'maintenance' || reason === 'expired' || reason === 'morning') {
            setInfoMessage('🌅 Bonjour ! Pour garantir la sécurité et la fluidité optimale de vos appels, notre maintenance quotidienne a renouvelé votre session ce matin. Votre e-mail est mémorisé, cliquez pour vous reconnecter.');
          }
        }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!pendingHandoff) return;

    let stopped = false;
    let timer: number | undefined;

    const clearPendingHandoff = (message: string) => {
      const stored = parseMagicHandoff(localStorage.getItem(MAGIC_HANDOFF_STORAGE_KEY));
      if (stored?.id === pendingHandoff.id) {
        localStorage.removeItem(MAGIC_HANDOFF_STORAGE_KEY);
      }
      const tabHandoff = parseMagicHandoff(sessionStorage.getItem(MAGIC_HANDOFF_STORAGE_KEY));
      if (tabHandoff?.id === pendingHandoff.id) {
        sessionStorage.removeItem(MAGIC_HANDOFF_STORAGE_KEY);
      }
      setPendingHandoff(null);
      setInfoMessage(message);
    };

    const schedulePoll = () => {
      if (!stopped) timer = window.setTimeout(() => void poll(), 3000);
    };

    const finishHandoff = async (credential: HandoffCredential) => {
      const { data: existingUser } = await supabase.auth.getUser();
      const existingEmail = existingUser.user?.email?.trim().toLowerCase();

      if (existingEmail !== pendingHandoff.email) {
        if (credential.type === 'token_hash') {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: credential.value,
            type: 'magiclink',
          });
          if (verifyError) throw verifyError;
        } else if (credential.type === 'code') {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(credential.value);
          if (exchangeError) throw exchangeError;
        } else {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: credential.accessToken,
            refresh_token: credential.refreshToken,
          });
          if (setSessionError) throw setSessionError;
        }
      }

      const { data: verifiedUser } = await supabase.auth.getUser();
      const verifiedEmail = verifiedUser.user?.email?.trim().toLowerCase();
      if (verifiedEmail !== pendingHandoff.email || !verifiedUser.user?.email_confirmed_at) {
        await supabase.auth.signOut({ scope: 'local' });
        throw new Error('Le lien reçu ne correspond pas à l’adresse demandée.');
      }

      const response = await fetch('/api/auth/session', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'x-yam-session-action': 'activate' },
      });
      const sessionData = await response.json() as { email?: string; error?: string };
      if (!response.ok || sessionData.email !== pendingHandoff.email) {
        throw new Error(sessionData.error || 'Impossible de finaliser la connexion dans ce navigateur.');
      }

      const acknowledgeResponse = await fetch('/api/auth/magic-link/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handoffId: pendingHandoff.id, acknowledge: true }),
      });
      if (!acknowledgeResponse.ok) {
        const acknowledgeData = await acknowledgeResponse.json() as { error?: string };
        throw new Error(acknowledgeData.error || 'Impossible de terminer le transfert du lien.');
      }

      clearPendingHandoff('');
      sessionStorage.setItem('yam_user_email', sessionData.email);
      sessionStorage.setItem('yam_session_active', 'true');
      localStorage.setItem('yam_user_email', sessionData.email);
      clearSessionConnectionLog(sessionData.email);
      await logUserConnection(sessionData.email);
      router.replace('/');
    };

    const poll = async () => {
      if (stopped) return;
      if (Date.now() - pendingHandoff.createdAt >= MAGIC_HANDOFF_TTL_MS) {
        clearPendingHandoff('');
        setError('Le délai de connexion est dépassé. Demandez un nouveau lien magique.');
        return;
      }

      try {
        const response = await fetch(
          `/api/auth/magic-link/handoff?id=${encodeURIComponent(pendingHandoff.id)}`,
          { cache: 'no-store' },
        );
        if (response.status === 202) {
          schedulePoll();
          return;
        }
        if (response.status === 410) {
          clearPendingHandoff('');
          setError('Le lien magique a expiré. Demandez-en un nouveau.');
          return;
        }

        const data = await response.json() as {
          ready?: boolean;
          error?: string;
          credential?: HandoffCredential;
        };
        if (!response.ok || !data.ready || !data.credential) {
          throw new Error(data.error || 'En attente de validation du lien...');
        }
        await finishHandoff(data.credential);
      } catch (handoffError) {
        if (stopped) return;
        const errMsg = handoffError instanceof Error ? handoffError.message : '';

        if (errMsg.includes('ne correspond pas')) {
          clearPendingHandoff('');
          setError(errMsg);
          setInfoMessage(null);
          return;
        }

        if (errMsg.includes('invalid or has expired') || errMsg.includes('invalide ou a expiré')) {
          clearPendingHandoff('');
          setError('Ce lien magique est invalide ou a déjà expiré. Veuillez demander un nouveau lien.');
          setInfoMessage(null);
          return;
        }

        // Pendant l'attente et les micro-coupures réseau, ne pas afficher d'alerte rouge anxiogène
        console.warn('[Handoff poll retry]', handoffError);
        setError(null);
        setInfoMessage('Connexion en cours… Dès que vous cliquez sur le lien dans votre e-mail, cette page se connectera automatiquement.');
        schedulePoll();
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === MAGIC_HANDOFF_STORAGE_KEY && event.newValue === null) {
        setPendingHandoff(null);
        setInfoMessage('Le lien a été ouvert dans ce navigateur. La vérification continue dans son onglet.');
      }
    };

    window.addEventListener('storage', handleStorage);
    void poll();
    return () => {
      stopped = true;
      window.removeEventListener('storage', handleStorage);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [pendingHandoff, router, supabase]);

  // Étape 1 : Saisie de l'adresse e-mail
  const handleEmailSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setSuggestedEmail(null);
    setPendingHandoff(null);
    localStorage.removeItem(MAGIC_HANDOFF_STORAGE_KEY);
    sessionStorage.removeItem(MAGIC_HANDOFF_STORAGE_KEY);

    const submittedEmail = new FormData(e.currentTarget).get('email');
    const emailToValidate = typeof submittedEmail === 'string' ? submittedEmail : email;

    // 1. Validation syntaxique
    const localValidation = validateEmail(emailToValidate);
    if (!localValidation.isValid) {
      setError("Cet e-mail n'existe pas ou comporte une erreur de saisie. Recommencez, s'il vous plaît.");
      return;
    }
    const cleanEmail = localValidation.cleanEmail;
    setEmail(cleanEmail);

    setLoading(true);

    try {
      // Priorité Administrateur : accès direct et immédiat à la saisie du code PIN
      if (cleanEmail === ADMIN_EMAIL.toLowerCase()) {
        setEmail(ADMIN_EMAIL.toLowerCase());
        setLoading(false);
        setStep('admin_code');
        setInfoMessage('Saisissez votre code de sécurité pour déverrouiller votre session.');
        return;
      }

      // 2. Contrôle de l'adresse e-mail
      const res = await fetch('/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });

      let data: Record<string, unknown> | null = null;
      try {
        data = (await res.json()) as Record<string, unknown>;
      } catch {
        data = { valid: false, error: "Cet e-mail n'existe pas ou comporte une erreur de saisie. Recommencez, s'il vous plaît." };
      }

      if (!res.ok || !data?.valid) {
        setLoading(false);
        const dataError =
          typeof data?.error === 'string'
            ? data.error
            : "Cet e-mail n'existe pas ou comporte une erreur de saisie. Recommencez, s'il vous plaît.";
        setError(dataError);
        const suggested = typeof data?.suggestedEmail === 'string' ? data.suggestedEmail : null;
        if (suggested) {
          setSuggestedEmail(suggested);
        }
        return;
      }

      const verifiedEmail = typeof data?.cleanEmail === 'string' ? data.cleanEmail : cleanEmail;

      // L'administrateur conserve son parcours de vérification dédié.
      if (data.isAdmin || verifiedEmail === ADMIN_EMAIL.toLowerCase()) {
        setEmail(ADMIN_EMAIL.toLowerCase());
        setLoading(false);
        setStep('admin_code');
        setInfoMessage('Saisissez votre code de sécurité pour déverrouiller votre session.');
        return;
      }

      const handoffId = generateMagicHandoffId();
      const handoff: MagicHandoff = {
        id: handoffId,
        email: cleanEmail,
        createdAt: Date.now(),
      };
      localStorage.setItem(MAGIC_HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
      sessionStorage.setItem(MAGIC_HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
      setPendingHandoff(handoff);

      const magicLinkResponse = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, handoffId }),
      });
      const magicLinkData = await magicLinkResponse.json() as {
        error?: string;
        message?: string;
      };

      if (!magicLinkResponse.ok) {
        localStorage.removeItem(MAGIC_HANDOFF_STORAGE_KEY);
        sessionStorage.removeItem(MAGIC_HANDOFF_STORAGE_KEY);
        setPendingHandoff(null);
        setLoading(false);
        setError(magicLinkData.error || 'Impossible d’envoyer le lien magique.');
        return;
      }

      setLoading(false);
      setStep('email');
      setInfoMessage('Lien magique envoyé. Ouvrez-le dans votre e-mail ; cette page terminera la connexion automatiquement.');
    } catch (err: unknown) {
      localStorage.removeItem(MAGIC_HANDOFF_STORAGE_KEY);
      sessionStorage.removeItem(MAGIC_HANDOFF_STORAGE_KEY);
      setPendingHandoff(null);
      setLoading(false);
      const message = err instanceof Error ? err.message : 'Vérifiez votre connexion internet.';
      setError(`Erreur de connexion : ${message}`);
    }
  };

  // Vérification réservée à l'administrateur
  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCode = code.trim();
    if (!cleanCode) {
      setError('Veuillez saisir votre code de sécurité.');
      return;
    }

    setLoading(true);

    try {
      const cleanEmail = ADMIN_EMAIL.toLowerCase();

      const adminResponse = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, code: cleanCode }),
      });
      const adminData = await adminResponse.json();
      if (!adminResponse.ok || !adminData.success) {
        setLoading(false);
        setError(adminData.error || 'Code de sécurité incorrect. Veuillez réessayer.');
        return;
      }

      document.cookie = `yam_user_email=${encodeURIComponent(cleanEmail)}; path=/; SameSite=Lax`;
      document.cookie = 'yam_admin_2fa=; path=/; max-age=0;';
      localStorage.removeItem('yam_user_email');
      sessionStorage.setItem('yam_user_email', cleanEmail);
      sessionStorage.setItem('yam_session_active', 'true');
      clearSessionConnectionLog(cleanEmail);

      broadcastSessionChange(cleanEmail);

      void logUserConnection(cleanEmail);
      router.push('/admin');
    } catch (err: unknown) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : 'Erreur lors de la validation du code.';
      setError(msg);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 bg-slate-950 text-slate-100 space-y-6">
      {/* 1. Carrousel publicitaire */}
      <div className="w-full max-w-md">
        <BannerCarousel />
      </div>

      {/* 2. Formulaire de connexion discret et sécurisé */}
      <div className="w-full max-w-md space-y-6 bg-slate-900/90 p-6 sm:p-8 rounded-2xl shadow-2xl border border-slate-800 backdrop-blur-sm">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-indigo-400">You&Me</h1>
          <p className="text-xs sm:text-sm text-slate-400">
            {step === 'admin_code'
              ? 'Accès sécurisé à votre espace'
              : 'Accès direct & sécurisé à votre espace de communication'}
          </p>
        </div>

        {/* Message d'erreur et suggestion de correction */}
        {error && (
          <div className="space-y-2">
            <div className="p-3.5 text-xs sm:text-sm text-red-300 bg-red-950/80 rounded-xl border border-red-700/80 leading-relaxed animate-in fade-in">
              ⚠️ {error}
            </div>
            {suggestedEmail && (
              <button
                type="button"
                onClick={() => {
                  setEmail(suggestedEmail);
                  setSuggestedEmail(null);
                  setError(null);
                }}
                className="w-full py-2 px-3 rounded-xl bg-indigo-950/80 border border-indigo-700 text-xs font-semibold text-indigo-300 hover:bg-indigo-900 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>💡 Corriger automatiquement en :</span>
                <strong className="text-white underline">{suggestedEmail}</strong>
              </button>
            )}
          </div>
        )}

        {/* Message d'information */}
        {infoMessage && (
          <div className="p-3 text-xs sm:text-sm text-emerald-300 bg-emerald-950/80 rounded-xl border border-emerald-700/80 leading-relaxed animate-in fade-in">
            {infoMessage}
          </div>
        )}

        {/* ÉTAPE 1 : Saisie de l'adresse e-mail */}
        {step === 'email' && (
          <form onSubmit={handleEmailSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="block text-xs sm:text-sm font-medium text-slate-200 mb-1.5">
                Votre adresse e-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                className="block w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-3 text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                placeholder="votre-email@domaine.com"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Format obligatoire : utilisateur@domaine.ext (ex: .com, .fr, .net)
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3.5 px-4 rounded-xl shadow-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-all cursor-pointer"
            >
              {loading ? 'Vérification et envoi du lien magique…' : 'Continuer vers You&Me'}
            </button>
          </form>
        )}

        {/* Saisie du code de sécurité administrateur */}
        {step === 'admin_code' && (
          <form onSubmit={handleCodeSubmit} className="space-y-5" noValidate>
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1">
              <p className="text-[11px] text-slate-400">
                Compte : <strong className="text-white">{ADMIN_EMAIL.toLowerCase()}</strong>
              </p>
            </div>

            <div>
              <label htmlFor="securityCode" className="block text-xs sm:text-sm font-medium text-slate-200 mb-1.5">
                Code administrateur
              </label>
              <input
                id="securityCode"
                type="password"
                autoFocus
                required
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (error) setError(null);
                }}
                className="block w-full text-center tracking-widest text-lg font-mono rounded-xl bg-slate-950 border border-slate-800 px-4 py-3 text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="••••••"
              />
              <p className="text-[11px] text-slate-500 mt-1 text-center">
                Saisissez votre code pour accéder à l’administration
              </p>
            </div>

            <div className="space-y-2">
              <button
                type="submit"
                disabled={loading || !code.trim()}
                className="w-full flex justify-center py-3.5 px-4 rounded-xl shadow-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-all cursor-pointer"
              >
                {loading ? 'Validation...' : 'Valider et accéder à l’administration'}
              </button>

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setEmail('');
                    setCode('');
                    setError(null);
                    setInfoMessage(null);
                  }}
                  className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  ← Changer d&apos;e-mail
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* 3. Manifeste de confidentialité */}
      <PrivacyManifesto />
    </main>
  );
}
