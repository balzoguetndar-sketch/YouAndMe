'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/clients';
import { logUserConnection } from '@/src/lib/logger';
import { BannerCarousel } from '@/src/components/banner/BannerCarousel';
import { PrivacyManifesto } from '@/src/components/layout/PrivacyManifesto';
import { validateEmail, ADMIN_EMAIL } from '@/src/lib/validation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'admin_code'>('email');
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [suggestedEmail, setSuggestedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  // Étape 1 : Saisie de l'adresse e-mail
  const handleEmailSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setSuggestedEmail(null);

    const submittedEmail = new FormData(e.currentTarget).get('email');
    const emailToValidate = typeof submittedEmail === 'string' ? submittedEmail : email;

    // 1. Validation syntaxique
    const localValidation = validateEmail(emailToValidate);
    if (!localValidation.isValid) {
      setError("Cet e-mail n'existe pas ou comporte une erreur de saisie. Recommencez, s'il vous plaît.");
      return;
    }
    setEmail(localValidation.cleanEmail);

    setLoading(true);

    try {
      // 2. Contrôle de l'adresse e-mail
      const res = await fetch('/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: localValidation.cleanEmail }),
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

      const cleanEmail = typeof data?.cleanEmail === 'string' ? data.cleanEmail : localValidation.cleanEmail;

      // L'administrateur conserve son parcours de vérification dédié.
      if (data.isAdmin || cleanEmail === ADMIN_EMAIL.toLowerCase()) {
        setLoading(false);
        setStep('admin_code');
        setInfoMessage('Saisissez votre code de sécurité pour déverrouiller votre session.');
        return;
      }

      document.cookie = `yam_user_email=${encodeURIComponent(cleanEmail)}; path=/; SameSite=Lax`;
      localStorage.removeItem('yam_user_email');
      sessionStorage.setItem('yam_user_email', cleanEmail);
      sessionStorage.setItem('yam_session_active', 'true');

      supabase.auth
        .signInAnonymously({
          options: {
            data: { email: cleanEmail },
          },
        })
        .catch(() => {});

      await logUserConnection(cleanEmail);
      router.push('/');
    } catch (err: unknown) {
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
      const cleanEmail = email.trim().toLowerCase();
      const isAdmin = cleanEmail === ADMIN_EMAIL.toLowerCase();

      if (!isAdmin) {
        setLoading(false);
        setError('Ce code est réservé à l’administrateur.');
        return;
      }

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

      supabase.auth
        .signInAnonymously({
          options: {
            data: { email: cleanEmail },
          },
        })
        .catch(() => {});

      await logUserConnection(cleanEmail);
      router.push('/admin');
    } catch {
      setLoading(false);
      setError('Erreur lors de la validation du code.');
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
              {loading ? 'Vérification...' : 'Continuer vers You&Me'}
            </button>
          </form>
        )}

        {/* Saisie du code de sécurité administrateur */}
        {step === 'admin_code' && (
          <form onSubmit={handleCodeSubmit} className="space-y-5" noValidate>
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1">
              <p className="text-[11px] text-slate-400">
                Compte : <strong className="text-white">{email}</strong>
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
