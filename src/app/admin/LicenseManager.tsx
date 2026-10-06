'use client';

import { useState } from 'react';

export function LicenseManager() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleUnlock = async () => {
    if (!email.trim()) {
      setFeedback({ type: 'error', text: 'Saisis l’email de l’utilisateur à débloquer.' });
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          action: 'reset_quota',
        }),
      });

      const result: { error?: string; message?: string } = await response.json();

      if (!response.ok) {
        setFeedback({ type: 'error', text: result.error || 'Impossible de débloquer cet utilisateur.' });
        return;
      }

      setFeedback({ type: 'success', text: result.message || 'Quota remis à zéro.' });
      setEmail('');
    } catch {
      setFeedback({ type: 'error', text: 'Erreur de connexion au serveur.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-indigo-500/20 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.14),_transparent_45%)] p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.06)] sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-indigo-300/80">Gestion accès</p>
          <h2 className="mt-1 text-base font-bold text-slate-100">Déblocage manuel du quota</h2>
        </div>
        <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
          Safe mode
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <label htmlFor="unlock-email" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Email de l’utilisateur
          </label>
          <input
            id="unlock-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="utilisateur@exemple.com"
            className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <button
          type="button"
          onClick={handleUnlock}
          disabled={loading || !email.trim()}
          className="rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Déblocage…' : 'Remettre à zéro'}
        </button>
      </div>

      {feedback && (
        <p
          role="status"
          className={`mt-4 rounded-xl border px-3 py-2.5 text-sm ${feedback.type === 'success'
            ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-300'
            : 'border-red-700/60 bg-red-950/40 text-red-300'
            }`}
        >
          {feedback.text}
        </p>
      )}
    </section>
  );
}
