'use client';

import { useState, useEffect } from 'react';

export type ConnectionLog = {
  id: string;
  email: string;
  ip_address: string;
  created_at: string;
  connected_at?: string | null;
  disconnected_at?: string | null;
};

interface LogManagerProps {
  initialLogs?: ConnectionLog[];
}

async function loadLogs(): Promise<ConnectionLog[]> {
  const response = await fetch('/api/admin/logs');
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Impossible de charger les journaux.');
  }
  return Array.isArray(data.logs) ? data.logs : [];
}

export function LogManager({ initialLogs = [] }: LogManagerProps) {
  const [logs, setLogs] = useState<ConnectionLog[]>(initialLogs);
  const [loading, setLoading] = useState(initialLogs.length === 0);
  const [purging, setPurging] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      setLogs(await loadLogs());
    } catch (e) {
      console.warn('Erreur chargement logs :', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const refreshLogs = async () => {
      try {
        const loadedLogs = await loadLogs();
        if (isMounted) setLogs(loadedLogs);
      } catch (error) {
        console.warn('Erreur chargement logs :', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void refreshLogs();

    const intervalId = window.setInterval(() => {
      void refreshLogs();
    }, 15000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  // 1. Purge des logs de plus de 24 heures
  const handlePurge24h = async () => {
    if (!confirm('Confirmez-vous la purge de tous les logs de connexion datant de plus de 24 heures ?')) return;

    setPurging(true);
    try {
      const res = await fetch('/api/admin/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'purge24h' }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la purge');
      }

      showFeedback('✅ Purge des logs > 24h effectuée avec succès.');
      fetchLogs();
    } catch (error: unknown) {
      showFeedback(`Erreur : ${error instanceof Error ? error.message : 'Erreur inconnue'}`, 'error');
    } finally {
      setPurging(false);
    }
  };

  // 2. Purge personnalisée par intervalle de dates
  const handlePurgeDateRange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      showFeedback('Veuillez sélectionner une date de début et une date de fin.', 'error');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      showFeedback('La date de début doit être antérieure à la date de fin.', 'error');
      return;
    }

    if (!confirm(`Confirmez-vous la suppression des logs enregistrés entre le ${startDate} et le ${endDate} ?`)) return;

    setPurging(true);
    try {
      const res = await fetch('/api/admin/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'purgeRange', startDate, endDate }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la purge');
      }

      showFeedback(`✅ Logs du ${startDate} au ${endDate} purgés avec succès.`);
      setStartDate('');
      setEndDate('');
      fetchLogs();
    } catch (error: unknown) {
      showFeedback(`Erreur : ${error instanceof Error ? error.message : 'Erreur inconnue'}`, 'error');
    } finally {
      setPurging(false);
    }
  };

  // 3. Purge totale (Vider tout l'historique)
  const handlePurgeAll = async () => {
    if (!confirm('⚠️ ATTENTION : Vous allez supprimer TOUT l’historique des connexions. Cette action est irréversible. Continuer ?')) return;

    setPurging(true);
    try {
      const res = await fetch('/api/admin/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'purgeAll' }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la purge');
      }

      showFeedback('✅ Historique complet vidé.');
      fetchLogs();
    } catch (error: unknown) {
      showFeedback(`Erreur : ${error instanceof Error ? error.message : 'Erreur inconnue'}`, 'error');
    } finally {
      setPurging(false);
    }
  };

  const handleDeleteOneLog = async (logId: string) => {
    if (!confirm('Supprimer ce log de connexion ?')) return;

    try {
      const res = await fetch('/api/admin/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteOne', id: logId }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la suppression');
      }

      showFeedback('✅ Log supprimé.');
      window.location.reload();
    } catch (error: unknown) {
      showFeedback(`Erreur : ${error instanceof Error ? error.message : 'Erreur inconnue'}`, 'error');
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
      <div className="rounded-2xl border border-slate-800 bg-[linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(15,23,42,0.88))] p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.05)] sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Historique</p>
            <h3 className="mt-1 text-sm font-bold text-slate-100 sm:text-base">Purge & rétention</h3>
          </div>

          <button
            type="button"
            onClick={handlePurge24h}
            disabled={purging}
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-200 transition-all hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Purger +24h
          </button>
        </div>

        <form onSubmit={handlePurgeDateRange} className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Date de début
            </label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Date de fin
            </label>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={purging || !startDate || !endDate}
              className="flex-1 rounded-xl bg-indigo-600 px-3 py-2.5 text-[11px] font-bold text-white transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {purging ? 'Purge...' : 'Période'}
            </button>

            <button
              type="button"
              onClick={handlePurgeAll}
              disabled={purging || logs.length === 0}
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[11px] font-bold text-red-200 transition-all hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              title="Vider tout l'historique"
            >
              Tout
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
              type="button"
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
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950/40">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-500 italic">
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
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteOneLog(log.id)}
                          className="rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-red-200 transition-all hover:bg-red-500/20"
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-500 italic">
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
