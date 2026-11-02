 'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/src/lib/supabase/clients';
import { clearSessionConnectionLog, logUserConnection } from '@/src/lib/logger';

const MAGIC_HANDOFF_STORAGE_KEY = 'yam_magic_handoff';
const MAGIC_HANDOFF_TTL_MS = 15 * 60 * 1000;
const HANDOFF_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type HandoffCredential =
  | { type: 'token_hash'; value: string }
  | { type: 'code'; value: string }
  | { type: 'session'; accessToken: string; refreshToken: string };

type MagicHandoff = { id: string; email: string; createdAt: number };

function getMatchingPendingHandoff(handoffId: string): MagicHandoff | null {
  try {
    const stored = sessionStorage.getItem(MAGIC_HANDOFF_STORAGE_KEY);
    if (!stored) return null;
    const handoff: unknown = JSON.parse(stored);
    if (!handoff || typeof handoff !== 'object') return null;
    const candidate = handoff as Record<string, unknown>;
    if (
      typeof candidate.id !== 'string'
      || candidate.id !== handoffId
      || typeof candidate.email !== 'string'
      || typeof candidate.createdAt !== 'number'
      || Date.now() - candidate.createdAt < 0
      || Date.now() - candidate.createdAt >= MAGIC_HANDOFF_TTL_MS
    ) return null;
    return {
      id: candidate.id,
      email: candidate.email,
      createdAt: candidate.createdAt,
    };
  } catch {
    return null;
  }
}

export default function VerifyMagicLinkPage() {
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

        const requestedTarget = searchParams.get('next') || '/';
        const targetUrl = requestedTarget.startsWith('/') && !requestedTarget.startsWith('//')
          ? requestedTarget
          : '/';

        if (handoffId && !HANDOFF_ID_PATTERN.test(handoffId)) {
          throw new Error('Identifiant de transfert invalide.');
        }

        // Détection "même appareil" : sessionStorage (même onglet) OU localStorage (nouvel onglet, même navigateur)
        let pendingHandoff = handoffId ? getMatchingPendingHandoff(handoffId) : null;

        if (!pendingHandoff && handoffId) {
          // Vérification dans localStorage — partagé entre onglets du même navigateur.
          try {
            const lsValue = localStorage.getItem(MAGIC_HANDOFF_STORAGE_KEY);
            if (lsValue) {
              const parsed = JSON.parse(lsValue) as Record<string, unknown>;
              if (
                parsed.id === handoffId
                && typeof parsed.email === 'string'
                && typeof parsed.createdAt === 'number'
                && Date.now() - parsed.createdAt >= 0
                && Date.now() - parsed.createdAt < MAGIC_HANDOFF_TTL_MS
              ) {
                pendingHandoff = { id: handoffId, email: parsed.email, createdAt: parsed.createdAt };
                // Copier vers sessionStorage pour que le reste du flux fonctionne normalement.
                sessionStorage.setItem(MAGIC_HANDOFF_STORAGE_KEY, JSON.stringify(pendingHandoff));
              }
            }
          } catch { /* localStorage non disponible, on continue */ }
        }

        window.history.replaceState(null, '', '/verify');

        // A different browser or device relays the credential to the waiting login page.
        // On consomme le token ici pour obtenir les JWT et les déposer dans le handoff.
        // Ça fonctionne que le lien soit ouvert dans un nouvel onglet, un Custom Tab
        // ou un appareil complètement différent.
        if (handoffId && !pendingHandoff) {
          let credential: HandoffCredential | null = null;

          if (tokenHash) {
            credential = { type: 'token_hash', value: tokenHash };
          } else if (code) {
            credential = { type: 'code', value: code };
          } else if (accessToken && refreshToken) {
            credential = { type: 'session', accessToken, refreshToken };
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
            throw new Error(handoffData.error || "Impossible de transmettre le lien au navigateur d'origine.");
          }

          setStatus('success');
          setMessage(
            "Vérification reçue. Revenez dans le navigateur qui a demandé le lien ; la connexion s'y terminera automatiquement.",
          );
          return;
        }

        // The originating browser verifies the link directly, preserving same-browser login.
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

        if (pendingHandoff) {
          const { data, error } = await supabase.auth.getUser();
          const verifiedEmail = data.user?.email?.trim().toLowerCase();
          if (
            error
            || verifiedEmail !== pendingHandoff.email
            || !data.user?.email_confirmed_at
          ) {
            await supabase.auth.signOut({ scope: 'local' });
            throw new Error('Le lien reçu ne correspond pas à l’adresse demandée.');
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

        if (pendingHandoff) {
          localStorage.removeItem(MAGIC_HANDOFF_STORAGE_KEY);
          sessionStorage.removeItem(MAGIC_HANDOFF_STORAGE_KEY);
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
  }, [supabase]);

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