 'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/clients';
import { clearSessionConnectionLog, logUserConnection } from '@/src/lib/logger';

export default function VerifyMagicLinkPage() {
  const router = useRouter();
  const supabase = createClient();
  const started = useRef(false);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Vérification du lien magique…');

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const verify = async () => {
      try {
        // Extraction explicite depuis window.location pour éviter que Supabase ne consomme le paramètre
        const url = new URL(window.location.href);
        const searchParams = url.searchParams;
        const hashParams = new URLSearchParams(window.location.hash.slice(1));

        const code = searchParams.get('code');
        const tokenHash = searchParams.get('token_hash') ?? searchParams.get('token');
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const handoffId = searchParams.get('handoff');

        const targetUrl = searchParams.get('next') || '/';

        // CAS A : Connexion initiée depuis un autre navigateur (ex: Edge) -> Transmettre la credential
        if (handoffId) {
          let credential:
            | { type: 'token_hash'; value: string }
            | { type: 'code'; value: string }
            | { type: 'session'; accessToken: string; refreshToken: string }
            | null = null;

          if (tokenHash) {
            credential = { type: 'token_hash', value: tokenHash };
          } else if (code) {
            credential = { type: 'code', value: code };
          } else if (accessToken && refreshToken) {
            credential = { type: 'session', accessToken, refreshToken };
          } else {
            // En dernier recours uniquement, lire la session
            const { data } = await supabase.auth.getSession();
            if (data?.session) {
              credential = {
                type: 'session',
                accessToken: data.session.access_token,
                refreshToken: data.session.refresh_token,
              };
            }
          }

          if (!credential) {
            throw new Error('Le lien magique ne contient pas de jeton valide à transmettre.');
          }

          const handoffResponse = await fetch('/api/auth/magic-link/handoff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handoffId, credential }),
          });

          const handoffData = (await handoffResponse.json()) as { error?: string };
          if (!handoffResponse.ok) {
            throw new Error(handoffData.error || 'Impossible de transmettre le lien au navigateur d’origine.');
          }

          // Déconnexion locale pour libérer Firefox et s'assurer que la session n'est ouverte QUE sur Edge
          await supabase.auth.signOut({ scope: 'local' });

          setStatus('success');
          setMessage(
            'Lien confirmé. Vous pouvez fermer cet onglet et revenir dans votre navigateur d’origine (ex: Edge) ; la connexion s’y terminera automatiquement.'
          );
          return;
        }

        // CAS B : Connexion directe sur le même navigateur
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw new Error(error.message);
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
          if (error) throw new Error(error.message);
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw new Error(error.message);
        } else {
          const { data, error } = await supabase.auth.getSession();
          if (error || !data.session) {
            throw new Error(error?.message || 'Le lien magique est incomplet.');
          }
        }

        // Activer la session côté serveur
        const sessionResponse = await fetch('/api/auth/session', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'x-yam-session-action': 'activate' },
        });

        const sessionData = (await sessionResponse.json()) as { email?: string; error?: string };
        if (!sessionResponse.ok || !sessionData.email) {
          throw new Error(sessionData.error || 'La session n’a pas pu être créée.');
        }

        sessionStorage.setItem('yam_user_email', sessionData.email);
        sessionStorage.setItem('yam_session_active', 'true');
        localStorage.setItem('yam_user_email', sessionData.email);

        clearSessionConnectionLog(sessionData.email);
        await logUserConnection(sessionData.email);

        setStatus('success');
        setMessage('Connexion validée. Entrée dans l’application…');

        window.location.href = targetUrl;
      } catch (error) {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Le lien est invalide ou expiré.');
      }
    };

    void verify();
  }, [router, supabase]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100">
      <section className="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center shadow-2xl">
        <h1 className="text-xl font-bold text-white">Vérification de votre adresse</h1>
        {status === 'error' ? (
          <>
            <p role="alert" className="text-sm text-red-300">
              {message}
            </p>
            <Link
              href="/login"
              className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Recommencer la connexion
            </Link>
          </>
        ) : (
          <p role="status" className="text-sm text-emerald-300">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}