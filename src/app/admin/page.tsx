import { createClient } from '@/src/lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { CallLauncher } from '@/src/components/call/CallLauncher';
import { VideoRoom } from '@/src/components/call/VideoRoom';
import { LogoutButton } from './LogoutButton';
import { BannerManager } from '@/src/app/admin/BannerManager';
import { PricingToggle } from '@/src/app/admin/PricingToggle';

export default async function AdminPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  let authEmail: string | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authEmail = user?.user_metadata?.email || user?.email || null;
  } catch {}

  const rawCookie = cookieStore.get('yam_user_email')?.value;
  const cookieEmail = rawCookie ? decodeURIComponent(rawCookie).toLowerCase().trim() : null;
  const userEmail = (authEmail || cookieEmail || '').toLowerCase().trim();

  // VERIFICATION STRICTE : Accès restreint au compte administrateur
  if (userEmail !== 'adiopasedikh@gmail.com') {
    redirect('/login');
  }

  // Récupération des logs de connexion
  const { data: logs } = await supabase
    .from('connection_logs')
    .select('*')
    .order('connected_at', { ascending: false });

  // Récupération des bannières
  const { data: banners } = await supabase
    .from('banners')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-10 text-slate-100">
      {/* En-tête de la page administrateur */}
      <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-indigo-400">Panneau Administrateur</h1>
          <p className="text-sm text-slate-400">
            Connecté en tant que <strong className="text-slate-200">{userEmail}</strong>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
          >
            ← Retour à l'espace utilisateur
          </a>
          <LogoutButton />
        </div>
      </div>

      {/* Section Paramètres Globaux du Système */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-slate-200">Paramètres de la Plateforme</h2>
        <PricingToggle />
      </section>

      {/* Section 0 : Lancement d'appel Administrateur */}
      <section className="space-y-6">
        <h2 className="text-xl font-bold text-slate-200">Espace d'appel Administrateur</h2>
        <div className="grid gap-6 lg:grid-cols-2 items-start">
          <CallLauncher />
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-300 text-center mb-4">
              Test rapide caméra / microphone
            </h3>
            <VideoRoom />
          </div>
        </div>
      </section>

      {/* Section 1 : Bannières publicitaires & Facturation */}
      <section className="space-y-6">
        <h2 className="text-xl font-bold text-slate-200">Gestion des Bannières & Factures</h2>
        <BannerManager />

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="text-sm font-semibold text-slate-300">Bannières enregistrées</h3>
          <div className="grid gap-4 md:grid-cols-3">
            {banners && banners.length > 0 ? (
              banners.map((banner) => (
                <div key={banner.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <img src={banner.image_url} alt={banner.title} className="w-full h-28 object-cover rounded-lg" />
                  <div>
                    <p className="font-semibold text-sm truncate">{banner.title}</p>
                    <p className="text-xs text-slate-400">Annonceur : {banner.advertiser_email}</p>
                    <p className="text-xs text-slate-400">
                      Durée : {banner.duration_value} {banner.duration_type}(s) — {banner.amount_due} €
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
                    <span className={`px-2 py-0.5 rounded-full border ${
                      banner.payment_status === 'paid'
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                        : 'bg-amber-950 text-amber-400 border-amber-800'
                    }`}>
                      {banner.payment_status === 'paid' ? 'Payé' : 'En attente'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full border ${
                      banner.active
                        ? 'bg-indigo-950 text-indigo-400 border-indigo-800'
                        : 'bg-slate-900 text-slate-500 border-slate-800'
                    }`}>
                      {banner.active ? 'En ligne' : 'Hors ligne'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 italic col-span-3">Aucune bannière enregistrée pour le moment.</p>
            )}
          </div>
        </div>
      </section>

      {/* Section 2 : Journaux de connexions */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-slate-200">Historique des connexions (Logs)</h2>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950 text-xs uppercase text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Utilisateur</th>
                  <th className="px-6 py-4">Adresse IP</th>
                  <th className="px-6 py-4">Début de connexion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {logs && logs.length > 0 ? (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 font-medium text-indigo-300">{log.email}</td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">{log.ip_address}</td>
                      <td className="px-6 py-4 text-xs text-slate-400">
                        {new Date(log.connected_at).toLocaleString('fr-FR')}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-slate-500">
                      Aucune connexion enregistrée.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}