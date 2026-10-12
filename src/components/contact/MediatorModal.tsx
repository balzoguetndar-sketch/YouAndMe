'use client';

import { useState } from 'react';
import type { LicenseTier } from '@/src/lib/license';

interface MediatorModalProps {
  userEmail: string;
  licenseTier?: LicenseTier | null;
  planType?: string | null;
  onClose: () => void;
}

export function MediatorModal({ userEmail, licenseTier, planType, onClose }: MediatorModalProps) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const resolvedTier = licenseTier ?? (
    planType === '7euro' ? 'ad_supported'
      : planType === '12euro' ? 'no_ads'
        : planType === '50euro' ? 'supporter'
          : planType === 'free' ? 'free'
            : null
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch('/api/contact/mediator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail,
          licenseTier: resolvedTier,
          planType,
          message,
          submittedAt: new Date().toISOString(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de l’envoi de votre saisine.');
      }

      setStatus({
        type: 'success',
        text: '✅ Votre saisine a bien été transmise à l’administrateur. Une réponse vous sera apportée sous 48 heures maximum.',
      });
      setMessage('');
      setTimeout(() => {
        onClose();
      }, 3500);
    } catch (err) {
      setStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erreur de communication.',
      });
    } finally {
      setLoading(false);
    }
  };

  const getPlanLabel = () => {
    if (resolvedTier === 'ad_supported') return '⭐ 7 € / an (Annuelle avec pub)';
    if (resolvedTier === 'no_ads') return '💎 12 € / an (Annuelle sans pub)';
    if (resolvedTier === 'supporter') return '👑 Soutien à vie (sans pub)';
    if (resolvedTier === 'legacy') return 'Licence active (formule historique)';
    if (resolvedTier === 'free') return '🌱 Formule Gratuite';
    return 'Vérification de la formule…';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-indigo-500/50 p-6 shadow-2xl space-y-5 text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span>⚖️</span> Saisir l&apos;Administrateur / Médiateur
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded-lg bg-slate-800"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 text-xs bg-slate-950 p-3.5 rounded-xl border border-slate-800">
          <div className="flex justify-between text-slate-300">
            <span className="font-semibold text-slate-400">Expéditeur :</span>
            <span className="font-mono text-indigo-300">{userEmail}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="font-semibold text-slate-400">Formule actuelle :</span>
            <span className="font-semibold text-emerald-400">{getPlanLabel()}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="font-semibold text-slate-400">Garantie :</span>
            <span className="font-bold text-amber-400">⏱️ Réponse sous 48h max</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="mediator-message" className="block text-xs font-semibold text-slate-300">
              Expliquez la raison de votre saisine / conflit :
            </label>
            <textarea
              id="mediator-message"
              rows={5}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Décrivez précisément votre situation ou le litige rencontré..."
              className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-all cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || !message.trim() || !resolvedTier}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Transmissions…' : '✉️ Transmettre au Médiateur'}
            </button>
          </div>
        </form>

        {status && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold text-center ${
              status.type === 'success'
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                : 'bg-red-950/80 text-red-300 border border-red-800'
            }`}
          >
            {status.text}
          </div>
        )}
      </div>
    </div>
  );
}