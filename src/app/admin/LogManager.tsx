'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatIpDisplay } from '@/src/lib/ipPrivacy';

export type ConnectionLog = {
  id: string;
  email: string;
  ip_address: string;
  created_at: string;
  connected_at?: string | null;
  disconnected_at?: string | null;
  user_agent?: string | null;
};

interface LogManagerProps {
  initialLogs?: ConnectionLog[];
  initialError?: string | null;
}

async function loadLogs(): Promise<ConnectionLog[]> {
  const response = await fetch('/api/admin/logs');
  if (response.status === 401) {
    const err = new Error('Non autorisé');
    (err as unknown as { isAuthError: boolean }).isAuthError = true;
    throw err;
  }
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Impossible de charger les journaux.');
  }
  return Array.isArray(data.logs) ? data.logs : [];
}

export function LogManager({ initialLogs = [], initialError = null }: LogManagerProps) {
  const [logs, setLogs] = useState<ConnectionLog[]>(initialLogs);
  const [loading, setLoading] = useState(initialLogs.length === 0 && !initialError);
  const [purging, setPurging] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(initialError);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      setLogs(await loadLogs());
      setLoadError(null);
      setSessionExpired(false);
    } catch (e: unknown) {
      if (e instanceof Error && (e.message.includes('Non autorisé') || (e as unknown as { isAuthError: boolean }).isAuthError)) {
        setSessionExpired(true);
      } else {
        setLoadError(e instanceof Error ? e.message : 'Impossible de charger les journaux.');
        console.warn('Erreur chargement logs :', e);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const refreshLogs = async () => {
      try {
        const loadedLogs = await loadLogs();
        if (isMounted) {
          setLogs(loadedLogs);
          setLoadError(null);
          setSessionExpired(false);
        }
      } catch (error: unknown) {
        if (error instanceof Error && (error.message.includes('Non autorisé') || (error as unknown as { isAuthError: boolean }).isAuthError)) {
          if (isMounted) setSessionExpired(true);
          if (intervalId) window.clearInterval(intervalId);
          return;
        }
        if (isMounted) {
          setLoadError(error instanceof Error ? error.message : 'Impossible de charger les journaux.');
        }
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
      if (intervalId) window.clearInterval(intervalId);
    };
  }, []);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  // Purge totale : Vider tout l'historique d'un seul clic
  const handlePurgeAll = async () => {
    if (!confirm('⚠️ Confirmation requise : Voulez-vous vraiment supprimer TOUS les journaux de connexion ? Cette action est irréversible.')) {
      return;
    }

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

      showFeedback('✅ Tous les journaux de connexion ont été supprimés avec succès.');
      setLogs([]);
    } catch (error: unknown) {
      showFeedback(`Erreur : ${error instanceof Error ? error.message : 'Erreur inconnue'}`, 'error');
    } finally {
      setPurging(false);
    }
  };

  // Filtrage instantané des logs par email ou adresse IP
  const filteredLogs = logs.filter((log) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      log.email?.toLowerCase().includes(term) ||
      log.ip_address?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-4">
      {sessionExpired && (
        <div className="p-4 rounded-2xl bg-amber-950/70 border border-amber-800 text-amber-200 flex flex-wrap items-center justify-between gap-4 shadow-xl animate-in fade-in">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌅</span>
            <div>
              <p className="text-sm font-bold text-amber-100">Session administrateur expirée</p>
              <p className="text-xs text-amber-300/80">Votre session a pris fin suite à la période d&apos;inactivité ou à la maintenance quotidienne. Les requêtes en arrière-plan ont été suspendues.</p>
            </div>
          </div>
          <Link
            href="/login"
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all shadow shrink-0"
          >
            Se reconnecter
          </Link>
        </div>
      )}

      {/* Messages de confirmation temporaires */}
      {feedbackMsg && (
        <div
          className={`p-3.5 rounded-xl text-xs sm:text-sm font-semibold border transition-all animate-in fade-in ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80'
              : 'bg-red-950/80 text-red-300 border-red-700/80'
          }`}
        >
          {feedbackMsg.text}
        </div>
      )}
      {loadError && (
        <div role="alert" className="rounded-xl border border-amber-800/70 bg-amber-950/50 p-4 text-sm text-amber-200 flex flex-wrap items-center justify-between gap-3 shadow-lg animate-in fade-in">
          <div className="space-y-1">
            <p className="font-bold flex items-center gap-2 text-amber-100">
              <span>⚠️</span> Indisponibilité temporaire des journaux Supabase
            </p>
            <p className="text-xs text-amber-300/80 font-mono">
              {loadError}
            </p>
            <p className="text-[11px] text-slate-400">
              Une nouvelle tentative a lieu automatiquement en arrière-plan. Vos sessions directes Realtime restent actives.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            className="px-3.5 py-1.5 rounded-xl bg-amber-700/80 hover:bg-amber-600 text-white text-xs font-bold transition-all shadow shrink-0 cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Tentative en cours...' : '🔄 Réessayer maintenant'}
          </button>
        </div>
      )}

      {/* Barre d'actions & En-tête de section */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-xl backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h3 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>📋</span> Journaux des Connexions
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60">
                🛡️ Rétention max 48h active
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Les journaux de plus de 48 heures sont purgés automatiquement. L&apos;administrateur accède aux adresses IP à des fins de gestion et de statistiques.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={fetchLogs}
              disabled={loading}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Actualiser la liste"
            >
              <span className={loading ? 'animate-spin' : ''}>🔄</span> Actualiser
            </button>

            <button
              type="button"
              onClick={handlePurgeAll}
              disabled={purging || logs.length === 0}
              className="px-3.5 py-2 rounded-xl border border-red-500/40 bg-red-950/60 hover:bg-red-900/80 text-red-200 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
              title="Supprimer tous les journaux de connexion"
            >
              <span>🗑️</span> {purging ? 'Purge en cours...' : 'Tout supprimer'}
            </button>
          </div>
        </div>

        {/* Barre de recherche instantanée & Compteur */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400 font-medium">
            Affichage de <strong className="text-slate-200">{filteredLogs.length}</strong> log{filteredLogs.length > 1 ? 's' : ''} sur un total de <strong className="text-slate-200">{logs.length}</strong>
          </div>

          <div className="w-full sm:w-72">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="🔍 Filtrer par email ou adresse IP..."
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Tableau des logs */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 overflow-hidden shadow-xl backdrop-blur-sm">
        <div className="overflow-x-auto max-h-[460px]">
          <table className="w-full text-left text-xs sm:text-sm text-slate-300">
            <thead className="bg-slate-950/90 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800 sticky top-0 backdrop-blur-md z-10">
              <tr>
                <th className="px-5 py-3.5">Utilisateur</th>
                <th className="px-5 py-3.5">Adresse IP (Client)</th>
                <th className="px-5 py-3.5">Date & Heure de connexion</th>
                <th className="px-5 py-3.5">Navigateur / Appareil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-950/30">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-slate-500 italic">
                    <span className="inline-block animate-spin mr-2">⏳</span> Chargement des journaux de connexion...
                  </td>
                </tr>
              ) : filteredLogs.length > 0 ? (
                filteredLogs.map((log) => {
                  const timestamp = log.created_at || log.connected_at;
                  const displayIp = formatIpDisplay(log.ip_address);
                  const isLocal = displayIp.includes('Local');
                  return (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-indigo-300 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-400/80 inline-block"></span>
                        {log.email}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-block font-mono text-xs px-2.5 py-1 rounded-lg border ${
                          isLocal
                            ? 'bg-slate-800 text-slate-300 border-slate-700'
                            : 'bg-indigo-950/60 text-indigo-200 border-indigo-800/50'
                        }`}>
                          {displayIp}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-300">
                        {timestamp ? new Date(timestamp).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        }) : 'Date inconnue'}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-400 truncate max-w-xs" title={log.user_agent || ''}>
                        {log.user_agent ? (
                          log.user_agent.includes('Mobile') ? '📱 Mobile' :
                          log.user_agent.includes('Windows') ? '💻 PC Windows' :
                          log.user_agent.includes('Mac') ? '🍎 Mac' :
                          log.user_agent.includes('Linux') ? '🐧 Linux' : '🌐 Navigateur'
                        ) : '🌐 Navigateur Web'}
                      </td>
                    </tr>
                  );
                })
              ) : loadError && logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center bg-amber-950/20 text-amber-200">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span className="text-2xl">⚠️</span>
                      <p className="font-bold text-sm text-amber-100">
                        Journaux de connexion momentanément inaccessibles
                      </p>
                      <p className="text-xs text-amber-300/80 font-mono max-w-md">
                        {loadError}
                      </p>
                      <p className="text-[11px] text-slate-400 max-w-md">
                        Une erreur est survenue lors de la communication avec la base de données (ou la table n&apos;est pas encore disponible). Une nouvelle tentative automatique a lieu toutes les 15 secondes.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-slate-500 italic">
                    {searchTerm
                      ? 'Aucun journal ne correspond à votre recherche.'
                      : 'Aucune connexion enregistrée au cours des dernières 48 heures.'}
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
