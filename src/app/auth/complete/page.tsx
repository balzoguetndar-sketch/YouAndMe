'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSessionConnectionLog, logUserConnection } from '@/src/lib/logger';

export default function CompleteAuthPage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const completeSignIn = async () => {
      try {
        const response = await fetch('/api/auth/session', { method: 'POST', cache: 'no-store' });
        const data = await response.json() as { email?: string; error?: string };
        if (!response.ok || !data.email) {
          throw new Error(data.error || 'Le lien n’a pas permis de vérifier cette adresse.');
        }

        sessionStorage.setItem('yam_user_email', data.email);
        sessionStorage.setItem('yam_session_active', 'true');
        localStorage.removeItem('yam_user_email');
        clearSessionConnectionLog(data.email);
        await logUserConnection(data.email);
        router.replace('/');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Impossible de finaliser la connexion.');
      }
    };

    void completeSignIn();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100">
      <section className="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center shadow-2xl">
        <h1 className="text-xl font-bold text-white">Vérification de votre adresse</h1>
        {error ? (
          <>
            <p role="alert" className="text-sm text-red-300">{error}</p>
            <Link href="/login" className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
              Recommencer la connexion
            </Link>
          </>
        ) : (
          <p role="status" className="text-sm text-slate-300">Confirmation en cours…</p>
        )}
      </section>
    </main>
  );
}