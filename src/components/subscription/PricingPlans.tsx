'use client';

import { useState } from 'react';

type Plan = {
  id: string;
  priceId?: string;
  name: string;
  price: string;
  period: string;
  flexibleSupport?: boolean;
  badge?: string;
  features: string[];
  recommended?: boolean;
};

interface PricingPlansProps {
  compact?: boolean;
}

const PLANS: Plan[] = [
  {
    id: 'ad_supported',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_YOU_5_AN,
    name: 'Avec publicité',
    price: '7 €',
    period: '/ an',
    features: [
      'Appels Vidéo & Audio illimités',
      'Tableau blanc partagé',
      'Envoi de messages différés (texte & audio)',
      'Contient des bannières publicitaires',
    ],
  },
  {
    id: 'no_ads',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_YOU_12_AN,
    name: 'Sans publicité',
    price: '12 €',
    period: '/ an',
    badge: 'Populaire',
    recommended: true,
    features: [
      'Toutes les fonctionnalités Standard',
      'Expérience 100% Sans Publicité',
      'Priorité sur le réseau de signalisation',
      'Support prioritaire',
    ],
  },
  {
    id: 'supporter',
    name: 'Soutien au projet',
    price: 'Dès 50 €',
    period: 'paiement unique',
    flexibleSupport: true,
    badge: 'VIP / Mécène',
    features: [
      'Accès VIP intégral sans publicité',
      'Badge Membre Protecteur You&Me',
      'Contribution au développement du projet',
      'Accès direct à l’équipe support',
    ],
  },
];

export function PricingPlans({ compact = false }: PricingPlansProps) {
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [supportAmount, setSupportAmount] = useState('50');

  const handleSubscribe = async (plan: Plan) => {
    const amount = Number(supportAmount);
    if (plan.flexibleSupport && (!Number.isInteger(amount) || amount < 50 || amount > 999999)) {
      alert('Le soutien doit être un montant entier compris entre 50 € et 999 999 €.');
      return;
    }

    if (!plan.priceId && !plan.flexibleSupport) {
      alert(`Clé de prix Stripe non configurée dans .env.local pour : ${plan.name}`);
      return;
    }

    setLoadingPlanId(plan.id);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: plan.priceId,
          supportAmount: plan.flexibleSupport ? amount : undefined,
          email: sessionStorage.getItem('yam_user_email') || undefined,
        }),
      });

      const data: { url?: string; error?: string } = await response.json();

      if (data.url) {
        // Redirection directe vers la page sécurisée Stripe Checkout
        window.location.assign(data.url);
      } else {
        alert(data.error || 'Erreur lors de la redirection vers Stripe.');
      }
    } catch (err) {
      console.error(err);
      alert('Impossible de contacter le serveur.');
    } finally {
      setLoadingPlanId(null);
    }
  };

  return (
    <div className={`w-full text-slate-100 ${compact ? 'space-y-4' : 'max-w-5xl mx-auto space-y-8 py-8'}`}>
      {!compact && (
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-extrabold text-indigo-400">Choisissez votre formule</h2>
          <p className="text-sm text-slate-400">Paiement sécurisé par carte bancaire avec Stripe.</p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3 items-stretch">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-2xl ${compact ? 'p-4 sm:p-5' : 'p-6'} flex flex-col justify-between border transition-all ${plan.recommended
              ? 'bg-slate-900 border-indigo-500 shadow-2xl scale-105'
              : 'bg-slate-950 border-slate-800 shadow-xl'
              }`}
          >
            <div className="space-y-4">
              {plan.badge && (
                <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-indigo-950 text-indigo-400 border border-indigo-800">
                  {plan.badge}
                </span>
              )}
              <h3 className="text-xl font-bold">{plan.name}</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-white">{plan.price}</span>
                <span className="text-xs text-slate-400">{plan.period}</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-300 pt-4 border-t border-slate-800">
                {plan.features.map((feat, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold">✓</span> {feat}
                  </li>
                ))}
              </ul>
              {plan.flexibleSupport && (
                <label className="block space-y-1.5 pt-2 text-xs font-semibold text-slate-300">
                  Votre contribution (minimum 50 €)
                  <input
                    type="number"
                    min="50"
                    max="999999"
                    step="1"
                    value={supportAmount}
                    onChange={(event) => setSupportAmount(event.target.value)}
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </label>
              )}
            </div>

            <button
              onClick={() => handleSubscribe(plan)}
              disabled={loadingPlanId === plan.id}
              className={`mt-6 w-full py-3 rounded-xl font-bold text-xs shadow-lg transition-all disabled:opacity-50 ${plan.recommended
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
                }`}
            >
              {loadingPlanId === plan.id
                ? 'Redirection vers Stripe...'
                : plan.flexibleSupport
                  ? `Soutenir avec ${supportAmount || '0'} €`
                  : 'Choisir cette formule'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}