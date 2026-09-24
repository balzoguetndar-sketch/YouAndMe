'use client';

import { useState } from 'react';
import { createClient } from '@/src/lib/supabase/clients';

export function BannerManager() {
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [advertiserEmail, setAdvertiserEmail] = useState('');
  const [durationType, setDurationType] = useState<'day' | 'week' | 'month'>('week');
  const [durationValue, setDurationValue] = useState(1);
  const [amount, setAmount] = useState(50);
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  const handleCreateBannerAndInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.from('banners').insert([
      {
        title,
        image_url: imageUrl,
        target_url: targetUrl,
        advertiser_email: advertiserEmail,
        duration_type: durationType,
        duration_value: durationValue,
        amount_due: amount,
        payment_status: 'pending',
        active: false, // Inactif jusqu'à la validation de paiement par l'admin
      },
    ]);

    setLoading(false);

    if (error) {
      alert(`Erreur lors de la création : ${error.message}`);
    } else {
      alert(`Bannière et facture enregistrées. Lien de paiement simulé généré pour ${advertiserEmail}.`);
      setTitle('');
      setImageUrl('');
      setTargetUrl('');
      setAdvertiserEmail('');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      <h3 className="text-lg font-bold text-slate-100">
        Enregistrer une bannière & Émettre une facture
      </h3>

      <form onSubmit={handleCreateBannerAndInvoice} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-300">Titre de la campagne</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ex: Campagne Lancement Espace Tech"
              className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">E-mail de l'annonceur</label>
            <input
              type="email"
              required
              value={advertiserEmail}
              onChange={(e) => setAdvertiserEmail(e.target.value)}
              placeholder="annonceur@exemple.com"
              className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-300">URL de la bannière (Image / Stockage)</label>
            <input
              type="url"
              required
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">Lien de destination (Clic)</label>
            <input
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://site-annonceur.com"
              className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-slate-300">Unité de durée</label>
            <select
              value={durationType}
              onChange={(e) => setDurationType(e.target.value as any)}
              className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100"
            >
              <option value="day">Jour(s)</option>
              <option value="week">Semaine(s)</option>
              <option value="month">Mois</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">Nombre d'unités</label>
            <input
              type="number"
              min={1}
              value={durationValue}
              onChange={(e) => setDurationValue(parseInt(e.target.value) || 1)}
              className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">Montant de la facture (€)</label>
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all text-sm"
        >
          {loading ? 'Génération...' : 'Émettre la facture & Enregistrer la bannière'}
        </button>
      </form>
    </div>
  );
}