'use client';

import { useState } from 'react';
import { createClient } from '@/src/lib/supabase/clients';
import { logUserConnection } from '@/src/lib/logger';
import { BannerCarousel } from '@/src/components/banner/BannerCarousel';
import { PrivacyManifesto } from '@/src/components/layout/PrivacyManifesto';
import { validateEmail, ADMIN_EMAIL, verifyAdmin2FACode } from '@/src/lib/validation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [step, setStep] = useState<'email' | 'admin_2fa'>('email');
  const [error, setError] = useState<string | null>(null);
  const [suggestedEmail, setSuggestedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  // Étape 1 : Validation approfondie de l'e-mail (syntaxe immédiate + DNS MX)
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuggestedEmail(null);

    // 1. Validation syntaxique immédiate côté client
    const localValidation = validateEmail(email);
    if (!localValidation.isValid) {
      setError(localValidation.error || 'Format d’adresse e-mail invalide.');
      const trimmed = email.trim().toLowerCase();
      if (trimmed.includes('@') && !trimmed.includes('.')) {
        setSuggestedEmail(`${trimmed}.com`);
      }
      return;
    }

    setLoading(true);

    try {
      // 2. Vérification approfondie via l'API (DNS MX, domaines jetables, fautes d'hébergeur)
      const res = await fetch('/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: localValidation.cleanEmail }),
      });

      let data: Record<string, unknown> | null = null;
      try {
        data = await res.json() as Record<string, unknown>;
      } catch {
        // En cas d'erreur inattendue de réponse serveur
        data = { valid: true, cleanEmail: localValidation.cleanEmail };
      }

      if (!res.ok || !data?.valid) {
        setLoading(false);
        const dataError = typeof data?.error === 'string' ? data.error : 'Cette adresse e-mail n’a pas pu être validée.';
        setError(dataError);
        const suggested = typeof data?.suggestedEmail === 'string' ? data.suggestedEmail : null;
        if (suggested) {
          setSuggestedEmail(suggested);
        }
        return;
      }

      const cleanEmail = typeof data?.cleanEmail === 'string' ? data.cleanEmail : localValidation.cleanEmail;

      // Si c'est l'administrateur, passage immédiat à l'étape 2FA
      if (data.isAdmin || cleanEmail === ADMIN_EMAIL.toLowerCase()) {
        setLoading(false);
        setStep('admin_2fa');
        return;
      }

      // Pour tous les utilisateurs standards, connexion directe sécurisée
      document.cookie = `yam_user_email=${encodeURIComponent(cleanEmail)}; path=/; max-age=2592000; SameSite=Lax`;
      if (typeof window !== 'undefined') {
        localStorage.setItem('yam_user_email', cleanEmail);
        sessionStorage.setItem('yam_user_email', cleanEmail);
      }

      supabase.auth.signInAnonymously({
        options: {
          data: { email: cleanEmail },
        },
      }).catch((authErr) => {
        console.warn('Authentification anonyme :', authErr);
      });

      await logUserConnection(cleanEmail);

      window.location.href = '/';
    } catch (err: unknown) {
      setLoading(false);
      const message = err instanceof Error ? err.message : 'Veuillez vérifier votre connexion.';
      setError(`Vérification impossible : ${message}`);
    }
  };

  // Étape 2 (Admin uniquement) : Validation du 2FA
  const handleAdmin2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCode = adminCode.trim();
    if (!cleanCode) {
      setError('Veuillez renseigner le code de sécurité Administrateur à 6 chiffres.');
      return;
    }

    if (!verifyAdmin2FACode(cleanCode)) {
      setError('Code de vérification double facteur incorrect. Veuillez réessayer.');
      return;
    }

    setLoading(true);
    try {
      const cleanEmail = ADMIN_EMAIL.toLowerCase();

      // Cookies pour la session administrateur avec 2FA validé
      document.cookie = `yam_user_email=${encodeURIComponent(cleanEmail)}; path=/; max-age=2592000; SameSite=Lax`;
      document.cookie = `yam_admin_2fa=verified; path=/; max-age=86400; SameSite=Lax`;

      if (typeof window !== 'undefined') {
        localStorage.setItem('yam_user_email', cleanEmail);
        localStorage.setItem('yam_admin_2fa', 'verified');
        sessionStorage.setItem('yam_user_email', cleanEmail);
        sessionStorage.setItem('yam_admin_2fa', 'verified');
      }

      // Authentification Supabase
      supabase.auth.signInAnonymously({
        options: {
          data: { email: cleanEmail },
        },
      }).catch(() => {});

      // Journalisation
      await logUserConnection(cleanEmail);

      // Redirection vers le panneau administrateur
      window.location.href = '/admin';
    } catch (err: unknown) {
      setLoading(false);
      const message = err instanceof Error ? err.message : 'Erreur d’authentification';
      setError(`Erreur d&apos;authentification : ${message}`);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 bg-slate-950 text-slate-100 space-y-6">
      {/* 1. Carrousel publicitaire */}
      <div className="w-full max-w-md">
        <BannerCarousel />
      </div>

      {/* 2. Formulaire de connexion sécurisé */}
      <div className="w-full max-w-md space-y-6 bg-slate-900/90 p-6 sm:p-8 rounded-2xl shadow-2xl border border-slate-800 backdrop-blur-sm">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-indigo-400">You&Me</h1>
          <p className="text-xs sm:text-sm text-slate-400">
            {step === 'admin_2fa'
              ? 'Vérification de Sécurité Administrateur (2FA)'
              : 'Accès direct & sécurisé à votre espace de communication'}
          </p>
        </div>

        {/* Message d'erreur et suggestion de correction */}
        {error && (
          <div className="space-y-2">
            <div className="p-3 text-xs sm:text-sm text-red-300 bg-red-950/70 rounded-xl border border-red-700/80 leading-relaxed animate-in fade-in">
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

        {/* Étape 1 : Saisie de l'adresse e-mail */}
        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="block text-xs sm:text-sm font-medium text-slate-200 mb-1.5">
                Votre adresse e-mail
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
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
              disabled={loading || !email.trim()}
              className="w-full flex justify-center py-3.5 px-4 rounded-xl shadow-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-all cursor-pointer"
            >
              {loading ? 'Connexion en cours...' : 'Accéder à l’espace You&Me'}
            </button>
          </form>
        ) : (
          /* Étape 2 : Double Facteur (2FA Administrateur) */
          <form onSubmit={handleAdmin2FASubmit} className="space-y-5" noValidate>
            <div className="p-3.5 rounded-xl bg-indigo-950/60 border border-indigo-800 text-xs text-indigo-200 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <span>🔐</span> Compte Administrateur Détecté
              </p>
              <p className="text-[11px] text-indigo-300/80">
                Email : <strong className="text-white">{ADMIN_EMAIL}</strong>
              </p>
            </div>

            <div>
              <label htmlFor="adminCode" className="block text-xs sm:text-sm font-medium text-slate-200 mb-1.5">
                Code de sécurité 2FA à 6 chiffres
              </label>
              <input
                id="adminCode"
                type="password"
                maxLength={6}
                autoFocus
                required
                value={adminCode}
                onChange={(e) => {
                  setAdminCode(e.target.value);
                  if (error) setError(null);
                }}
                className="block w-full text-center tracking-widest text-lg font-mono rounded-xl bg-slate-950 border border-slate-800 px-4 py-3 text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="••••••"
              />
              <p className="text-[11px] text-slate-500 mt-1 text-center">
                Saisissez votre code de sécurité PIN administrateur
              </p>
            </div>

            <div className="space-y-2">
              <button
                type="submit"
                disabled={loading || !adminCode.trim()}
                className="w-full flex justify-center py-3.5 px-4 rounded-xl shadow-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-all cursor-pointer"
              >
                {loading ? 'Vérification 2FA...' : 'Déverrouiller le Panneau Admin'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setAdminCode('');
                  setError(null);
                }}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all cursor-pointer"
              >
                ← Utiliser une autre adresse e-mail
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 3. Manifeste de confidentialité */}
      <PrivacyManifesto />
    </main>
  );
}
