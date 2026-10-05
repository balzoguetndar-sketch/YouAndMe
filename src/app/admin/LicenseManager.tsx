'use client';

import { useState } from 'react';

type LicensePlan = 'ad_supported' | 'no_ads' | 'supporter';

export function LicenseManager() {
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<LicensePlan>('ad_supported');
  const [amount, setAmount] = useState('7');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handlePlanChange = (value: LicensePlan) => {
    setPlan(value);
    setAmount(value === 'ad_supported' ? '7' : value === 'no_ads' ? '12' : '50');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          plan,
          amount: Number(amount),
          paymentReference,
          paymentConfirmed,
        }),
      });
      const result: { error?: string; message?: string } = await response.json();

      if (!response.ok) {
        setFeedback({ type: 'error', text: result.error || 'Impossible d’activer la licence.' });
        return;
      }

      setFeedback({ type: 'success', text: result.message || 'Licence activée.' });
      setPaymentReference('');
      setPaymentConfirmed(false);
    } catch {
      setFeedback({ type: 'error', text: 'Erreur de connexion au serveur.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6">
      <div>
        <h2 className="text-base sm:text-lg font-bold text-slate-100">Activation manuelle après paiement</h2>
        <p className="mt-1 text-xs text-slate-400">Vérifie le paiement dans Stripe avant d’activer l’accès.</p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="license-email" className="block text-xs font-semibold text-slate-300">Email du compte</label>
          <input
            id="license-email"
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="license-plan" className="block text-xs font-semibold text-slate-300">Formule payée</label>
          <select
            id="license-plan"
            value={plan}
            onChange={(event) => handlePlanChange(event.target.value as LicensePlan)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="ad_supported">7 € / an, avec publicité</option>
            <option value="no_ads">12 € / an, sans publicité</option>
            <option value="supporter">Soutien permanent, 50 € ou plus</option>
          </select>
        </div>

        <div>
          <label htmlFor="license-amount" className="block text-xs font-semibold text-slate-300">Montant payé (EUR)</label>
          <input
            id="license-amount"
            type="number"
            required
            min={plan === 'supporter' ? 50 : plan === 'no_ads' ? 12 : 7}
            max={plan === 'supporter' ? 999999 : plan === 'no_ads' ? 12 : 7}
            step="1"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="license-reference" className="block text-xs font-semibold text-slate-300">Référence Stripe</label>
          <input
            id="license-reference"
            type="text"
            required
            minLength={8}
            maxLength={255}
            value={paymentReference}
            onChange={(event) => setPaymentReference(event.target.value.trim())}
            placeholder="cs_test_… ou pi_…"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <label className="flex items-start gap-2 text-xs text-slate-300 md:col-span-2">
          <input
            type="checkbox"
            required
            checked={paymentConfirmed}
            onChange={(event) => setPaymentConfirmed(event.target.checked)}
            className="mt-0.5 accent-indigo-500"
          />
          Paiement vérifié et reçu dans Stripe
        </label>

        <button
          type="submit"
          disabled={loading || !paymentConfirmed}
          className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2"
        >
          {loading ? 'Activation…' : 'Activer la formule'}
        </button>
      </form>

      {feedback && (
        <p
          role="status"
          className={`rounded-lg border p-3 text-sm ${feedback.type === 'success'
            ? 'border-emerald-700 bg-emerald-950/60 text-emerald-300'
            : 'border-red-700 bg-red-950/60 text-red-300'
            }`}
        >
          {feedback.text}
        </p>
      )}
    </section>
  );
}
