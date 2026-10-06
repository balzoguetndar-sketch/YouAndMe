'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/clients';

export function PricingToggle() {
  const [showPricing, setShowPricing] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    const saved = localStorage.getItem('yam_show_pricing_in_room');
    return saved === null ? true : saved === 'true';
  });
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    // 2. Écouter les changements en temps réel via le canal Supabase
    const channel = supabase.channel('yam_admin_settings');
    channel
      .on('broadcast', { event: 'pricing_toggle' }, (payload) => {
        if (payload?.payload?.showPricing !== undefined) {
          setShowPricing(Boolean(payload.payload.showPricing));
          if (typeof window !== 'undefined') {
            localStorage.setItem('yam_show_pricing_in_room', String(payload.payload.showPricing));
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const handleToggle = async () => {
    setLoading(true);
    const newValue = !showPricing;
    setShowPricing(newValue);

    if (typeof window !== 'undefined') {
      localStorage.setItem('yam_show_pricing_in_room', String(newValue));
      document.cookie = `yam_show_pricing_in_room=${newValue}; path=/; max-age=2592000; SameSite=Lax`;
    }

    try {
      // Diffuser le changement en temps réel à toutes les salles d'appel actives
      const channel = supabase.channel('yam_admin_settings');
      await channel.subscribe();
      await channel.send({
        type: 'broadcast',
        event: 'pricing_toggle',
        payload: { showPricing: newValue },
      });
    } catch (e) {
      console.warn('Erreur diffusion broadcast réglage :', e);
    }

    setLoading(false);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h4 className="text-sm sm:text-base font-bold text-slate-100">
            Affichage de la Grille Tarifaire en salle d&apos;appel
          </h4>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
              showPricing
                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                : 'bg-rose-950 text-rose-300 border-rose-800'
            }`}
          >
            {showPricing ? 'Actif' : 'Masqué'}
          </span>
        </div>
        <p className="text-xs text-slate-400">
          Contrôle la visibilité de l&apos;onglet et des plans d&apos;abonnement pour les participants lors des appels.
        </p>
      </div>

      <button
        onClick={handleToggle}
        disabled={loading}
        className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-lg cursor-pointer border flex items-center gap-2 ${
          showPricing
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500'
            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
        }`}
      >
        {loading ? (
          'Mise à jour...'
        ) : showPricing ? (
          <>
            <span>👁️</span> Tarifs Visibles (Cliquez pour masquer)
          </>
        ) : (
          <>
            <span>🙈</span> Tarifs Masqués (Cliquez pour afficher)
          </>
        )}
      </button>
    </div>
  );
}