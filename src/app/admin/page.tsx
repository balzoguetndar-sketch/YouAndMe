import { createClient as createAdminClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/src/lib/adminAuth';
import { LiveUsersManager } from '@/src/app/admin/LiveUsersManager';
import { VideoRoom } from '@/src/components/call/VideoRoom';
import { BannerManager } from '@/src/app/admin/BannerManager';
import { PricingToggle } from '@/src/app/admin/PricingToggle';
import { LogManager } from './LogManager';

import { LogoutButton } from './LogoutButton';
import { CallLauncher } from '@/src/components/call/CallLauncher';

// Client administrateur avec typage TypeScript
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function AdminPage() {
  // ... le reste du code reste identique
  const cookieStore = await cookies();
  const userEmail = await verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  if (!userEmail) {
    redirect('/login');
  }

  // Récupération sécurisée de tous les logs via le client admin
  const { data: logs } = await supabaseAdmin
    .from('connection_logs')
    .select('*')
    .order('created_at', { ascending: false });

  // Récupération des bannières
  const { data: banners } = await supabaseAdmin
    .from('banners')
    .select('*')
    .order('created_at', { ascending: false });

  // Calcul des métriques clés avec typage explicite
  const totalLogs: number = logs?.length || 0;
  const uniqueUsers: number = new Set(logs?.map((l) => l.email?.toLowerCase().trim())).size;
  const activeBannersCount: number = banners?.filter((b) => b.active).length || 0;
  const totalRevenue: number =
    banners?.filter((b) => b.payment_status === 'paid').reduce((acc: number, b) => acc + (b.amount_due || 0), 0) || 0;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-8 text-slate-100">
      {/* En-tête de la page administrateur */}
      <div className="border-b border-slate-800 pb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-indigo-400">
              Panneau Administrateur You&Me
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
              Superadmin
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Session active vérifiée pour : <strong className="text-slate-200">{userEmail}</strong>
          </p>
        </div>

        {/* <div className="flex items-center gap-3">
          <a
            href="/"
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold border border-slate-800 transition-all flex items-center gap-1.5 shadow-md"
          >
            <span>📱</span> Basculer vers l'Espace Utilisateur
          </a>
          <LogoutButton />
        </div> */}
      </div>

      {/* Cartes Métriques KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-lg">
          <p className="text-xs text-slate-400 font-medium">Connexions Totales</p>
          <p className="text-2xl font-extrabold text-indigo-300">{totalLogs}</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-lg">
          <p className="text-xs text-slate-400 font-medium">Utilisateurs Uniques</p>
          <p className="text-2xl font-extrabold text-emerald-300">{uniqueUsers}</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-lg">
          <p className="text-xs text-slate-400 font-medium">Bannières En Ligne</p>
          <p className="text-2xl font-extrabold text-amber-300">{activeBannersCount}</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-lg">
          <p className="text-xs text-slate-400 font-medium">Revenus Encaissés</p>
          <p className="text-2xl font-extrabold text-purple-300">{totalRevenue} €</p>
        </div>
      </div>

      {/* Section 1 : Commutateur de la Grille Tarifaire */}
      <section className="space-y-3">
        <h2 className="text-base sm:text-lg font-bold text-slate-200 flex items-center gap-2">
          <span>⚙️</span> Paramètres Globaux
        </h2>
        <PricingToggle />
      </section>

      {/* Section 2 : Utilisateurs Connectés en Direct */}
      <section className="space-y-3">
        <LiveUsersManager adminEmail={userEmail} />
      </section>

      {/* Section 4 : Gestion Complète des Bannières Publicitaires & Factures */}
      <section className="space-y-4">
        <h2 className="text-base sm:text-lg font-bold text-slate-200 flex items-center gap-2">
          <span>📢</span> Gestion des Bannières Publicitaires & Factures
        </h2>
        <BannerManager />
      </section>

      {/* Section 5 : Gestion & Purge des Journaux de Connexions */}
      <section className="space-y-4">
        <h2 className="text-base sm:text-lg font-bold text-slate-200 flex items-center gap-2">
                  <span>📋</span> Gestion de l&apos;Historique & Purge des Logs
        </h2>
        <LogManager initialLogs={logs || []} />
      </section>
    </div>
  );
}