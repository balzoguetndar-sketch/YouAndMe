'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/clients';

type Banner = {
  id: string;
  title: string;
  image_url: string;
  target_url?: string;
  advertiser_email: string;
  duration_type: 'day' | 'week' | 'month';
  duration_value: number;
  amount_due: number;
  payment_status: 'paid' | 'pending';
  active: boolean;
  created_at: string;
};

export function BannerManager() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // Formulaire d'émission
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [advertiserEmail, setAdvertiserEmail] = useState('');
  const [durationType, setDurationType] = useState<'day' | 'week' | 'month'>('week');
  const [durationValue, setDurationValue] = useState(1);
  const [amount, setAmount] = useState(50);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const supabase = createClient();

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Veuillez sélectionner une image de moins de 2 Mo.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImageUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const fetchBanners = async () => {
    try {
      const { data, error } = await supabase
        .from('banners')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setBanners(data);
      }
    } catch (err) {
      console.warn('Erreur chargement bannières :', err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchBanners();
  }, [supabase]);

  const handleCreateBannerAndInvoice = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!imageUrl || imageUrl.startsWith('C:\\') || imageUrl.startsWith('/')) {
      alert('Veuillez sélectionner un fichier image ou saisir une URL web valide (https://...).');
      return;
    }

    setLoadingSubmit(true);

    const { error } = await supabase.from('banners').insert([
      {
        title,
        image_url: imageUrl,
        target_url: targetUrl || '#',
        advertiser_email: advertiserEmail,
        duration_type: durationType,
        duration_value: durationValue,
        amount_due: amount,
        payment_status: 'pending',
        active: false, // Inactif jusqu'à validation de paiement
      },
    ]);

    setLoadingSubmit(false);

    if (error) {
      alert(`Erreur lors de la création : ${error.message}\n\nNote : Vérifiez que la règle RLS sur la table "banners" autorise l'insertion dans Supabase.`);
    } else {
      alert(`✅ Bannière et facture enregistrées avec succès pour ${advertiserEmail}.`);
      setTitle('');
      setImageUrl('');
      setTargetUrl('');
      setAdvertiserEmail('');
      fetchBanners();
    }
  };

  const handleToggleActive = async (banner: Banner) => {
    setActionLoadingId(banner.id);
    const newActive = !banner.active;
    const { error } = await supabase
      .from('banners')
      .update({ active: newActive })
      .eq('id', banner.id);

    if (!error) {
      setBanners((prev) =>
        prev.map((b) => (b.id === banner.id ? { ...b, active: newActive } : b))
      );
    } else {
      alert(`Erreur : ${error.message}`);
    }
    setActionLoadingId(null);
  };

  const handleTogglePayment = async (banner: Banner) => {
    setActionLoadingId(banner.id);
    const newStatus = banner.payment_status === 'paid' ? 'pending' : 'paid';
    const { error } = await supabase
      .from('banners')
      .update({ payment_status: newStatus })
      .eq('id', banner.id);

    if (!error) {
      setBanners((prev) =>
        prev.map((b) => (b.id === banner.id ? { ...b, payment_status: newStatus } : b))
      );
    } else {
      alert(`Erreur : ${error.message}`);
    }
    setActionLoadingId(null);
  };

  const handleDeleteBanner = async (id: string) => {
    if (!confirm('Êtes-vous certain de vouloir supprimer cette bannière ?')) return;

    setActionLoadingId(id);
    const { error } = await supabase.from('banners').delete().eq('id', id);

    if (!error) {
      setBanners((prev) => prev.filter((b) => b.id !== id));
    } else {
      alert(`Erreur : ${error.message}`);
    }
    setActionLoadingId(null);
  };

  return (
    <div className="space-y-6">
      {/* 1. Formulaire d'enregistrement */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
          <span>➕</span> Enregistrer une nouvelle bannière & Émettre une facture
        </h3>

        <form onSubmit={handleCreateBannerAndInvoice} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-300">Titre de la campagne</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ex: Offre Promo Lancement"
                className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">E-mail de l'annonceur</label>
              <input
                type="email"
                required
                value={advertiserEmail}
                onChange={(e) => setAdvertiserEmail(e.target.value)}
                placeholder="annonceur@exemple.com"
                className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Image de la bannière (Fichier local ou URL Web)
              </label>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://... ou choisissez un fichier ci-contre"
                  className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />

                <label className="px-3 py-2.5 rounded-xl bg-indigo-950 text-indigo-300 border border-indigo-800 hover:bg-indigo-900 text-xs font-bold cursor-pointer transition-all flex items-center gap-1">
                  <span>📁</span> Parcourir
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              {imageUrl && (
                <div className="relative h-20 w-full rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                  <img src={imageUrl} alt="Aperçu" className="w-full h-full object-cover" />
                  <span className="absolute bottom-1 right-1 px-2 py-0.5 rounded text-[10px] bg-slate-900/90 text-slate-300 border border-slate-700">
                    Aperçu
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">Lien cible (Clic)</label>
              <input
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://youandme.cloud"
                className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300">Unité de durée</label>
              <select
                value={durationType}
                onChange={(e) => setDurationType(e.target.value as any)}
                className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="day">Jour(s)</option>
                <option value="week">Semaine(s)</option>
                <option value="month">Mois</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">Durée</label>
              <input
                type="number"
                min={1}
                value={durationValue}
                onChange={(e) => setDurationValue(parseInt(e.target.value) || 1)}
                className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">Montant (€)</label>
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loadingSubmit}
            className="w-full py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg transition-all text-sm cursor-pointer disabled:opacity-50"
          >
            {loadingSubmit ? 'Enregistrement en cours...' : '💾 Émettre la facture & Créer la bannière'}
          </button>
        </form>
      </div>

      {/* 2. Liste interactive des bannières */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-100">
            Bannières Enregistrées ({banners.length})
          </h3>
          <button
            onClick={fetchBanners}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
          >
            🔄 Actualiser
          </button>
        </div>

        {loadingList ? (
          <p className="text-xs text-slate-500 italic">Chargement des bannières...</p>
        ) : banners.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {banners.map((banner) => (
              <div
                key={banner.id}
                className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col justify-between shadow-md hover:border-slate-700 transition-all"
              >
                <div className="space-y-2">
                  <div className="relative h-28 w-full rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
                    <img
                      src={banner.image_url}
                      alt={banner.title}
                      className="w-full h-full object-cover"
                    />
                    <span
                      className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        banner.active
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                          : 'bg-slate-900 text-slate-400 border-slate-700'
                      }`}
                    >
                      {banner.active ? '🟢 En ligne' : '⚪ Hors ligne'}
                    </span>
                  </div>

                  <div>
                    <h4 className="font-bold text-sm text-slate-100 truncate">{banner.title}</h4>
                    <p className="text-xs text-slate-400 truncate">📧 {banner.advertiser_email}</p>
                    <p className="text-xs text-slate-400">
                      ⏱️ {banner.duration_value} {banner.duration_type}(s) —{' '}
                      <strong className="text-indigo-300">{banner.amount_due} €</strong>
                    </p>
                  </div>
                </div>

                <div className="space-y-2 pt-3 border-t border-slate-800/80 text-xs">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => handleTogglePayment(banner)}
                      disabled={actionLoadingId === banner.id}
                      className={`px-2.5 py-1 rounded-lg font-bold border transition-all cursor-pointer ${
                        banner.payment_status === 'paid'
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-800 hover:bg-emerald-900'
                          : 'bg-amber-950 text-amber-300 border-amber-800 hover:bg-amber-900'
                      }`}
                    >
                      {banner.payment_status === 'paid' ? '✅ Payé' : '⏳ En attente'}
                    </button>

                    <button
                      onClick={() => handleToggleActive(banner)}
                      disabled={actionLoadingId === banner.id}
                      className={`px-2.5 py-1 rounded-lg font-bold border transition-all cursor-pointer ${
                        banner.active
                          ? 'bg-rose-950 text-rose-300 border-rose-800 hover:bg-rose-900'
                          : 'bg-indigo-950 text-indigo-300 border-indigo-800 hover:bg-indigo-900'
                      }`}
                    >
                      {banner.active ? 'Désactiver' : 'Activer'}
                    </button>

                    <button
                      onClick={() => handleDeleteBanner(banner.id)}
                      disabled={actionLoadingId === banner.id}
                      className="p-1.5 rounded-lg bg-red-950 text-red-400 border border-red-800 hover:bg-red-900 transition-all cursor-pointer"
                      title="Supprimer la bannière"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic py-6 text-center">
            Aucune bannière enregistrée pour le moment.
          </p>
        )}
      </div>
    </div>
  );
}