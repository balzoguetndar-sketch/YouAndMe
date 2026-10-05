'use client';

import { useState } from 'react';
import { activateLicenseKey, UserUsageInfo } from '@/src/lib/usage';

interface UsageLimitModalProps {
  userUsage: UserUsageInfo;
  onLicenseActivated: () => void;
  onClose?: () => void;
}

export function UsageLimitModal({
  userUsage,
  onLicenseActivated,
  onClose,
}: UsageLimitModalProps) {
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const handleActivateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    setLoading(true);

    try {
      const res = await activateLicenseKey(userUsage.email, licenseKey);
      if (res.success) {
        setStatusMessage({ type: 'success', text: res.message });
        setTimeout(() => {
          onLicenseActivated();
        }, 1500);
      } else {
        setStatusMessage({ type: 'error', text: res.message });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Erreur lors de l’activation de la clé.' });
    } finally {
      setLoading(false);
    }
  };

  const handleStripeCheckout = async () => {
    const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_YOU_S || process.env.NEXT_PUBLIC_STRIPE_PRICE_YOU_12_AN;
    if (!priceId) {
      alert('Module de paiement Stripe en cours de finalisation.');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.assign(data.url);
      } else {
        alert(data.error || 'Erreur lors de la redirection vers Stripe.');
      }
    } catch {
      alert('Impossible d’initialiser le paiement.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
      <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-indigo-500/50 p-6 sm:p-8 shadow-2xl space-y-6 text-slate-100">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-3xl">
            🔒
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">
            Limite des 10 Utilisations Atteinte
          </h2>
          <p className="text-xs sm:text-sm text-slate-300">
            Vous avez atteint votre quota de <strong className="text-amber-400">10 utilisations gratuites</strong> sur You&Me.
          </p>
        </div>

        {/* Message d'explication */}
        <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-800/60 text-xs text-slate-300 space-y-2">
          <p className="font-semibold text-indigo-200">
            ⭐ Pour continuer à communiquer en privé sans aucune limite, activez votre Licence :
          </p>
          <ul className="space-y-1 text-slate-300 pl-4 list-disc">
            <li>Appels Vidéo & Audio HD illimités à vie</li>
            <li>Tableau blanc et partage de fichiers sans restriction</li>
            <li>Zéro publicité & Sécurité maximale</li>
          </ul>
        </div>

        {/* Option 1 : Achat direct de la Licence à Vie */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Formule Soutien À VIE</p>
              <p className="text-[11px] text-slate-400">Paiement unique — Accès illimité permanent</p>
            </div>
            <span className="text-xl font-extrabold text-indigo-400">50 €</span>
          </div>

          <button
            onClick={handleStripeCheckout}
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50"
          >
            💳 Acheter la Licence à Vie (Stripe / CB)
          </button>
        </div>

        {/* Option 2 : Activation par Clé de Licence */}
        <form onSubmit={handleActivateKey} className="space-y-3 pt-2 border-t border-slate-800">
          <label htmlFor="license-key" className="block text-xs font-semibold text-slate-300">
            🔑 Vous possédez déjà une Clé de Licence ?
          </label>
          <div className="flex gap-2">
            <input
              id="license-key"
              type="text"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
              placeholder="Ex: YAM-LIFE-2026-VIP"
              className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
            />
            <button
              type="submit"
              disabled={loading || !licenseKey.trim()}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition-all cursor-pointer disabled:opacity-50"
            >
              Activer
            </button>
          </div>
        </form>

        {statusMessage && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold text-center ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700'
                : 'bg-red-950/80 text-red-300 border border-red-700'
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            ✕ Fermer et consulter les tarifs
          </button>
        )}
      </div>
    </div>
  );
}
