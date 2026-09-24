'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/clients';
import { useRouter } from 'next/navigation';
import { logUserConnection } from '@/src/lib/logger';
import { BannerCarousel } from '@/src/components/banner/BannerCarousel';
import { PrivacyManifesto } from '@/src/components/layout/PrivacyManifesto';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    setEmail('');
    setError(null);
  }, []);

  const handleDirectLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setError('Veuillez saisir une adresse e-mail valide (ex: utilisateur@domaine.com).');
      return;
    }

    setLoading(true);

    try {
      // 1. Enregistrer le cookie et le stockage local immédiatement
      document.cookie = `yam_user_email=${encodeURIComponent(cleanEmail)}; path=/; max-age=2592000; SameSite=Lax`;
      if (typeof window !== 'undefined') {
        localStorage.setItem('yam_user_email', cleanEmail);
        sessionStorage.setItem('yam_user_email', cleanEmail);
      }

      // 2. Tenter l'authentification anonyme Supabase en arrière-plan
      supabase.auth.signInAnonymously({
        options: {
          data: { email: cleanEmail },
        },
      }).catch((authErr) => {
        console.warn('Note authentification anonyme :', authErr);
      });

      // 3. Journaliser la connexion en arrière-plan sans bloquer la navigation
      logUserConnection(cleanEmail).catch(() => {});

      // 4. Redirection immédiate
      if (cleanEmail === 'adiopasedikh@gmail.com') {
        window.location.href = '/admin';
      } else {
        window.location.href = '/';
      }
    } catch (err: any) {
      setLoading(false);
      setError(`Erreur de connexion : ${err.message || 'Vérifiez votre réseau.'}`);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 bg-slate-950 text-slate-100 space-y-6">
      {/* 1. Carrousel fonctionnel sur la page de connexion */}
      <div className="w-full max-w-md">
        <BannerCarousel />
      </div>

      {/* 2. Formulaire de connexion sécurisé */}
      <div className="w-full max-w-md space-y-6 bg-slate-900/90 p-6 sm:p-8 rounded-2xl shadow-2xl border border-slate-800 backdrop-blur-sm">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-indigo-400">You&Me</h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Accès direct & sécurisé à votre espace de communication
          </p>
        </div>

        <form onSubmit={handleDirectLogin} className="space-y-5" noValidate>
          {error && (
            <div className="p-3 text-xs sm:text-sm text-red-300 bg-red-950/70 rounded-xl border border-red-700/80 leading-relaxed">
              {error}
            </div>
          )}

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
              onChange={(e) => setEmail(e.target.value)}
              className="block w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-3 text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
              placeholder="votre-email@exemple.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-3.5 px-4 rounded-xl shadow-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-all cursor-pointer"
          >
            {loading ? 'Connexion en cours...' : 'Accéder à l’espace You&Me'}
          </button>
        </form>
      </div>

      {/* 3. Manifeste de confidentialité */}
      <PrivacyManifesto />
    </main>
  );
}
