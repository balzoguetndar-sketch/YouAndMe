'use client';

import { useState } from 'react';
import { activateLicenseKey, UserUsageInfo } from '@/src/lib/usage';
import { PricingPlans } from '@/src/components/subscription/PricingPlans';

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-900 border border-indigo-500/50 p-5 sm:p-7 shadow-2xl space-y-5 text-slate-100">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black tracking-tight text-white">
            Vos appels gratuits sont épuisés
          </h2>
          <p className="text-xs sm:text-sm text-slate-300">
            Vous avez utilisé {userUsage.usageCount} appel{userUsage.usageCount > 1 ? 's' : ''} gratuit{userUsage.usageCount > 1 ? 's' : ''}. Choisissez une formule pour continuer.
          </p>
        </div>

        <PricingPlans compact />

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
            ✕ Fermer
          </button>
        )}
      </div>
    </div>
  );
}
