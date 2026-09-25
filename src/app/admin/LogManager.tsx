'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/clients';

type ConnectionLog = {
  id: string;
  email: string;
  ip_address: string;
  created_at: string;
  connected_at?: string | null;
  disconnected_at?: string | null;
};

export function LogManager() {
  const [logs, setLogs] = useState<ConnectionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const supabase = createClient();

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('connection_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setLogs(data);
      }
    } catch (e) {
      console.warn('Erreur chargement logs :', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();

    // Écoute des nouvelles connexions en temps réel
    const channel = supabase
      .channel('connection_logs_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'connection_logs' },
        (payload) => {
          if (payload.new) {
            setLogs((prev) => [payload.new as ConnectionLog, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  // 1. Purge des logs de plus de 24 heures
  const handlePurge24h = async () => {
    if (!confirm('Confirmez-vous la purge de tous les logs de connexion datant de plus de 24 heures ?')) return;

    setPurging(true);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('connection_logs')
      .delete()
      .lt('created_at', twentyFourHoursAgo);

    setPurging(false);

    if (error) {
      showFeedback(`Erreur lors de la purge : ${error.message}`, 'error');
    } else {
      showFeedback('✅ Purge des logs > 24h effectuée avec succès.');
      fetchLogs();
    }
  };

  // 2. Purge personnalisée par intervalle de dates
  const handlePurgeDateRange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      showFeedback('Veuillez sélectionner une date de début et une date de fin.', 'error');
      return;
    }

    const startISO = new Date(startDate + 'T00:00:00').toISOString();
    const endISO = new Date(endDate + 'T23:59:59').toISOString();

    if (new Date(startISO) > new Date(endISO)) {
      showFeedback('La date de début doit être antérieure à la date de fin.', 'error');
      return;
    }

    if (!confirm(`Confirmez-vous la suppression des logs enregistrés entre le ${startDate} et le ${endDate} ?`)) return;

    setPurging(true);

    const { error } = await supabase
      .from('connection_logs')
      .delete()
      .gte('created_at', startISO)
      .lte('created_at', endISO);

    setPurging(false);

    if (error) {
      showFeedback(`Erreur lors de la purge : ${error.message}`, 'error');
    } else {
      showFeedback(`✅ Logs du ${startDate} au ${endDate} purgés avec succès.`);
      setStartDate('');
      setEndDate('');
      fetchLogs();
    }
  };

  // 3. Purge totale (Vider tout l'historique)
  const handlePurgeAll = async () => {
    if (!confirm('⚠️ ATTENTION : Vous allez supprimer TOUT l’historique des connexions. Cette action est irréversible. Continuer ?')) return;

    setPurging(true);
    const { error } = await supabase
      .from('connection_logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Supprime tout

    setPurging(false);

    if (error) {
      showFeedback(`Erreur : ${error.message}`, 'error');
    } else {
      showFeedback('✅ Historique complet vidé.');
      fetchLogs();
    }
  };

  // Filtrage des logs
  const filteredLogs = logs.filter((log) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      log.email?.toLowerCase().includes(term) ||
      log.ip_address?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* Messages de confirmation */}
      {feedbackMsg && (
        <div
          className={`p-4 rounded-xl text-sm font-semibold border transition-all animate-in fade-in ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
              : 'bg-red-950/80 text-red-300 border-red-700'
          }`}
        >
          {feedbackMsg.text}
        </div>
      )}

      {/* 1. Panneau d'outils de Purge Administrateur */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
              <span>🧹</span> Outils de Purge & Nettoyage de l'Historique
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Gérez le cycle de rétention des données de connexion (purge 24h ou sélection de période).
            </p>
          </div>

          <button
            onClick={handlePurge24h}
            disabled={purging}
            className="px-4 py-2 rounded-xl text-xs font-bold text-amber-200 bg-amber-950/70 border border-amber-800 hover:bg-amber-900 transition-all cursor-pointer shadow-md disabled:opacity-50 flex items-center gap-1.5"
          >
            <span>⏱️</span> Purger les logs de plus de 24h
          </button>
        </div>

        {/* Formulaire de purge par plage de dates */}
        <form onSubmit={handlePurgeDateRange} className="grid gap-4 sm:grid-cols-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Date de début
            </label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Date de fin
            </label>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={purging || !startDate || !endDate}
              className="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              {purging ? 'Purge...' : 'Purger la période'}
            </button>

            <button
              type="button"
              onClick={handlePurgeAll}
              disabled={purging || logs.length === 0}
              className="py-2 px-3 rounded-xl text-xs font-bold text-red-300 bg-red-950/60 border border-red-800 hover:bg-red-900 transition-all cursor-pointer disabled:opacity-50"
              title="Vider tout l'historique"
            >
              Vider tout
            </button>
          </div>
        </form>
      </div>

      {/* 2. Tableau de Consultation des Logs avec Recherche */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm sm:text-base font-bold text-slate-100">
              Journaux Actifs ({filteredLogs.length} / {logs.length})
            </h3>
            <button
              onClick={fetchLogs}
              className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
            >
              🔄 Actualiser
            </button>
          </div>

          <div className="w-full sm:w-64">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrer par email ou IP..."
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-96 rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs sm:text-sm text-slate-300">
            <thead className="bg-slate-950 text-xs uppercase text-slate-400 border-b border-slate-800 sticky top-0">
              <tr>
                <th className="px-5 py-3">Utilisateur</th>
                <th className="px-5 py-3">Adresse IP</th>
                <th className="px-5 py-3">Date & Heure de connexion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950/40">
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-slate-500 italic">
                    Chargement des logs...
                  </td>
                </tr>
              ) : filteredLogs.length > 0 ? (
                filteredLogs.map((log) => {
                  const timestamp = log.created_at || log.connected_at;
                  return (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3 font-semibold text-indigo-300">{log.email}</td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-400">{log.ip_address}</td>
                      <td className="px-5 py-3 text-xs text-slate-400">
                        {timestamp ? new Date(timestamp).toLocaleString('fr-FR') : 'Date inconnue'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-slate-500 italic">
                    {searchTerm ? 'Aucun log ne correspond à votre recherche.' : 'Aucune connexion enregistrée.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
