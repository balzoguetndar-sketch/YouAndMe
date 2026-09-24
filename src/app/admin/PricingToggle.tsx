'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/clients';

export function PricingToggle() {
  const [showPricing, setShowPricing] = useState(true);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    const fetchSetting = async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'show_pricing_in_room')
        .single();

      if (data) {
        setShowPricing(data.value === 'true');
      }
    };
    fetchSetting();
  }, [supabase]);

  const handleToggle = async () => {
    setLoading(true);
    const newValue = !showPricing;

    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: 'show_pricing_in_room', value: String(newValue) });

    if (!error) {
      setShowPricing(newValue);
    } else {
      alert(`Erreur : ${error.message}`);
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl">
      <div>
        <h4 className="text-sm font-semibold text-slate-200">Affichage des Tarifs dans la salle d'appel</h4>
        <p className="text-xs text-slate-400">Permet aux participants de voir la grille tarifaire dès leur entrée.</p>
      </div>
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
          showPricing
            ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
            : 'bg-red-950 text-red-400 border-red-800'
        }`}
      >
        {showPricing ? 'Tarifs ACTIFS (Visible)' : 'Tarifs MASQUÉS'}
      </button>
    </div>
  );
}