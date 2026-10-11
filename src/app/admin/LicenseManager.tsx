'use client';

import { useState } from 'react';

type PlanType = '7euro' | '12euro' | '50euro';

export function LicenseManager() {
  const [targetEmail, setTargetEmail] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('7euro');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Attribution ou rectification de licence via l'API Admin
  const handleAssignLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = targetEmail.trim().toLowerCase();

    if (!cleanEmail) {
      setMessage({ type: 'error', text: 'Veuillez saisir une adresse e-mail valide.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          planType: selectedPlan,
          action: 'assign_license',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la mise à jour de la licence.');
      }

      setMessage({
        type: 'success',
        text: data.message || `Licence attribuée avec succès à ${cleanEmail}.`,
      });
      setTargetEmail('');
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erreur de communication avec le serveur.',
      });
    } finally {
      setLoading(false);
    }
  };

  // Réinitialisation simple du quota
  const handleResetQuotaOnly = async () => {
    const cleanEmail = targetEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setMessage({ type: 'error', text: 'Veuillez saisir une adresse e-mail.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          action: 'reset_quota',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la réinitialisation.');
      }

      setMessage({
        type: 'success',
        text: data.message || `Quota remis à zéro pour ${cleanEmail}.`,
      });
      setTargetEmail('');
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erreur lors de la réinitialisation.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
      <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
        <h2 className="text-base sm:text-lg font-bold text-slate-200 flex items-center gap-2">
          <span>🔑</span> Gestion & Rectification des Licences Utilisateurs
        </h2>
        <span className="text-xs text-indigo-400 font-medium">Mise à jour sécurisée via Service Role</span>
      </div>

      <form onSubmit={handleAssignLicense} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="admin-license-email" className="block text-xs font-semibold text-slate-300">
              Adresse e-mail de l&apos;utilisateur
            </label>
            <input
              id="admin-license-email"
              type="email"
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value)}
              placeholder="utilisateur@exemple.com"
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="admin-license-plan" className="block text-xs font-semibold text-slate-300">
              Formule / Type de licence à attribuer
            </label>
            <select
              id="admin-license-plan"
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value as PlanType)}
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            >
              <option value="7euro">7 € / an — Licence Annuelle (avec publicité)</option>
              <option value="12euro">12 € / an — Licence Annuelle (sans publicité)</option>
              <option value="50euro">50 € + — Licence à Vie VIP (sans publicité)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={loading || !targetEmail.trim()}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition-all shadow-md cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Enregistrement…' : '✅ Attribuer / Rectifier la Licence'}
          </button>

          <button
            type="button"
            onClick={handleResetQuotaOnly}
            disabled={loading || !targetEmail.trim()}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 transition-all cursor-pointer disabled:opacity-50"
          >
            🔄 Réinitialiser le Quota seul (0 / 10)
          </button>
        </div>
      </form>

      {message && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold ${
            message.type === 'success'
              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
              : 'bg-red-950/80 text-red-300 border border-red-800'
          }`}
        >
          {message.text}
        </div>
      )}
    </section>
  );
}