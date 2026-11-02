'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LiveUsersManager } from '@/src/app/admin/LiveUsersManager';
import { BannerManager } from '@/src/app/admin/BannerManager';
import { PricingToggle } from '@/src/app/admin/PricingToggle';
import { LogManager, type ConnectionLog } from './LogManager';
import { LicenseManager } from './LicenseManager';

interface AdminDashboardProps {
  userEmail: string;
  totalLogs: number | null;
  uniqueUsers: number | null;
  activeBannersCount: number;
  paidBannersTotal: number;
  initialLogs: ConnectionLog[];
  initialLogsError: string | null;
}

type TabType = 'logs' | 'users' | 'licenses' | 'banners' | 'all';

export function AdminDashboard({
  userEmail,
  totalLogs,
  uniqueUsers,
  activeBannersCount,
  paidBannersTotal,
  initialLogs,
  initialLogsError,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('logs');

  const tabs: { id: TabType; label: string; icon: string; count?: number | string }[] = [
    { id: 'logs', label: 'Journaux (48h)', icon: '📋', count: totalLogs ?? 'Erreur' },
    { id: 'users', label: 'En direct & Appels', icon: '👥' },
    { id: 'licenses', label: 'Licences & Tarifs', icon: '🛡️' },
    { id: 'banners', label: 'Bannières Publicitaires', icon: '📢', count: activeBannersCount },
    { id: 'all', label: 'Vue Complète', icon: '👁️' },
  ];

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6 text-slate-100">
      {/* En-tête Pro & Navigation rapide */}
      <header className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-2xl backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">⚡</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-300 to-indigo-200 bg-clip-text text-transparent">
                Panneau Administrateur You&Me
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-700/60 shadow-sm">
                Superadmin
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Serveur You&Me Opérationnel
              </span>
              <span className="text-slate-600">•</span>
              <span>
                Session sécurisée pour : <strong className="text-slate-200 font-semibold">{userEmail}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all flex items-center gap-2 shadow-md hover:scale-[1.02]"
            >
              <span>📱</span> Espace Utilisateur
            </Link>
          </div>
        </div>
      </header>

      {/* Cartes Métriques KPIs Modernisées */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 : Connexions 48h */}
        <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 space-y-2 shadow-lg backdrop-blur-sm relative overflow-hidden group hover:border-indigo-500/50 transition-all">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 font-medium">Connexions (48h max)</p>
            <span className="text-lg">⚡</span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-indigo-300">{totalLogs ?? '—'}</p>
          <div className="text-[10px] text-slate-500 flex items-center gap-1">
            <span>🛡️ Rétention automatique 48h</span>
          </div>
        </div>

        {/* KPI 2 : Utilisateurs Uniques */}
        <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 space-y-2 shadow-lg backdrop-blur-sm relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 font-medium">Utilisateurs Uniques</p>
            <span className="text-lg">👥</span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-emerald-300">{uniqueUsers ?? '—'}</p>
          <div className="text-[10px] text-emerald-500/80 font-medium">
            <span>Comptes distincts connectés</span>
          </div>
        </div>

        {/* KPI 3 : Bannières Actives */}
        <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 space-y-2 shadow-lg backdrop-blur-sm relative overflow-hidden group hover:border-amber-500/50 transition-all">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 font-medium">Bannières En Ligne</p>
            <span className="text-lg">📢</span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-amber-300">{activeBannersCount}</p>
          <div className="text-[10px] text-amber-500/80 font-medium">
            <span>Campagnes actives</span>
          </div>
        </div>

        {/* KPI 4 : Revenus Publicitaires */}
        <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 space-y-2 shadow-lg backdrop-blur-sm relative overflow-hidden group hover:border-purple-500/50 transition-all">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 font-medium">Revenus Bannières</p>
            <span className="text-lg">💎</span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-purple-300">{paidBannersTotal} €</p>
          <div className="text-[10px] text-purple-400/80 font-medium">
            <span>Total des paiements validés</span>
          </div>
        </div>
      </div>

      {/* Barre d'Onglets Moderne */}
      <nav className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                    isActive ? 'bg-indigo-900/80 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Contenu selon l'onglet actif */}
      <main className="space-y-8 animate-in fade-in duration-200">
        {/* Onglet 1 : Journaux de Connexion */}
        {(activeTab === 'logs' || activeTab === 'all') && (
          <section className="space-y-3">
            {activeTab === 'all' && (
              <h2 className="text-base sm:text-lg font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-2">
                <span>📋</span> Gestion de l&apos;Historique & Purge des Logs (48h max)
              </h2>
            )}
            <LogManager initialLogs={initialLogs} initialError={initialLogsError} />
          </section>
        )}

        {/* Onglet 2 : Utilisateurs en direct (Reste monté en continu pour garantir la stabilité de la présence WebSocket et des appels entrants) */}
        <section className={`space-y-3 ${activeTab === 'users' || activeTab === 'all' ? 'block' : 'hidden'}`}>
          {activeTab === 'all' && (
            <h2 className="text-base sm:text-lg font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-2">
              <span>👥</span> Utilisateurs Connectés en Direct & Appels
            </h2>
          )}
          <LiveUsersManager adminEmail={userEmail} />
        </section>

        {/* Onglet 3 : Licences & Réglages Tarifaires */}
        {(activeTab === 'licenses' || activeTab === 'all') && (
          <section className="space-y-6">
            {activeTab === 'all' && (
              <h2 className="text-base sm:text-lg font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-2">
                <span>🛡️</span> Gestion des Licences & Grille Tarifaire
              </h2>
            )}
            <LicenseManager />

            <div className="space-y-3">
              <h3 className="text-sm sm:text-base font-bold text-slate-200 flex items-center gap-2">
                <span>⚙️</span> Paramètres Globaux
              </h3>
              <PricingToggle />
            </div>
          </section>
        )}

        {/* Onglet 4 : Bannières Publicitaires */}
        {(activeTab === 'banners' || activeTab === 'all') && (
          <section className="space-y-3">
            {activeTab === 'all' && (
              <h2 className="text-base sm:text-lg font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-2">
                <span>📢</span> Gestion des Bannières Publicitaires & Factures
              </h2>
            )}
            <BannerManager />
          </section>
        )}
      </main>
    </div>
  );
}
