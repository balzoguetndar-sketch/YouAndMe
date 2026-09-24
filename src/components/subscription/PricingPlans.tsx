'use client';

type Plan = {
  id: string;
  name: string;
  price: string;
  period: string;
  badge?: string;
  features: string[];
  recommended?: boolean;
};

const PLANS: Plan[] = [
  {
    id: 'ad_supported',
    name: 'Formule Standard',
    price: '7 €',
    period: '/ mois',
    features: [
      'Appels Vidéo & Audio illimités',
      'Tableau blanc partagé',
      'Envoi de messages différés (texte & audio)',
      'Contient des bannières publicitaires',
    ],
  },
  {
    id: 'no_ads',
    name: 'Formule Sans Publicité',
    price: '12 €',
    period: '/ mois',
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
    name: 'Formule Soutien',
    price: '50 €',
    period: '/ mois',
    badge: 'VIP / Mécène',
    features: [
      'Accès VIP intégral sans publicité',
      'Badge Membre Protecteur You&Me',
      'Contribution au développement du projet',
      'Accès direct à l’équipe support',
    ],
  },
];

export function PricingPlans() {
  const handleSubscribe = (planId: string) => {
    // Redirection vers le lien de paiement Stripe / Mobile Money
    alert(`Initiation du paiement par Carte / Mobile Money pour la formule : ${planId}`);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 py-8 text-slate-100">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-extrabold text-indigo-400">Choisissez votre formule</h2>
        <p className="text-sm text-slate-400">
          Paiement sécurisé disponible par **Carte Bancaire (Stripe)** et **Mobile Money** partout dans le monde.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3 items-stretch">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-2xl p-6 flex flex-col justify-between border transition-all ${
              plan.recommended
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
            </div>

            <button
              onClick={() => handleSubscribe(plan.id)}
              className={`mt-6 w-full py-3 rounded-xl font-bold text-xs shadow-lg transition-all ${
                plan.recommended
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
              }`}
            >
              Souscrire (Carte / Mobile Money)
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}