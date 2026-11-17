import { createClient as createAdminClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/src/lib/adminAuth';
import { AdminDashboard } from '@/src/app/admin/AdminDashboard';
import type { ConnectionLog } from '@/src/app/admin/LogManager';

export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Configuration Supabase serveur manquante');
  return createAdminClient(url, key);
}

export default async function AdminPage() {
  const cookieStore = await cookies();
  const userEmail = await verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  if (!userEmail) {
    redirect('/login');
  }

  const isPhp = Boolean(process.env.NEXT_PUBLIC_PHP_API_URL);
  let logs: ConnectionLog[] = [];
  let logsError: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let banners: any[] = [];

  if (isPhp) {
    try {
      const phpBase = process.env.NEXT_PUBLIC_PHP_API_URL!.replace(/\/+$/, '');
      const resLogs = await fetch(`${phpBase}/admin/logs?limit=200`, { cache: 'no-store' });
      if (resLogs.ok) {
        const jsonLogs = await resLogs.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logs = (jsonLogs.logs || []).map((l: any) => ({
          id: String(l.id),
          email: l.caller_email || l.email || 'inconnu',
          ip_address: l.ip_address || '127.0.0.1',
          created_at: l.created_at,
          connected_at: l.created_at,
        }));
      } else {
        logsError = 'Impossible de charger les logs depuis le serveur PHP local.';
      }

      const resBanners = await fetch(`${phpBase}/banners`, { cache: 'no-store' });
      if (resBanners.ok) {
        const jsonBanners = await resBanners.json();
        banners = jsonBanners.banners || [];
      }
    } catch (e) {
      logsError = e instanceof Error ? e.message : 'Erreur de connexion au serveur PHP.';
    }
  } else {
    const supabaseAdmin = getSupabaseAdmin();
    // Récupération sécurisée et purge automatique 48h via le client admin
    // eslint-disable-next-line react-hooks/purity -- This retention boundary must be calculated for each request.
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { error: purgeError } = await supabaseAdmin
      .from('connection_logs')
      .delete()
      .lt('created_at', fortyEightHoursAgo);
    const { data: sLogs, error: sLogsError } = purgeError
      ? { data: null, error: purgeError }
      : await supabaseAdmin
      .from('connection_logs')
      .select('*')
      .gte('created_at', fortyEightHoursAgo)
      .order('created_at', { ascending: false });

    if (sLogsError) {
      logsError = sLogsError.message;
    } else {
      logs = (sLogs as ConnectionLog[]) || [];
    }

    // Récupération des bannières
    const { data: sBanners } = await supabaseAdmin
      .from('banners')
      .select('*')
      .order('created_at', { ascending: false });
    banners = sBanners || [];
  }

  // Calcul des métriques clés avec typage explicite
  const totalLogs: number | null = logsError ? null : logs?.length ?? 0;
  const uniqueUsers: number | null = logsError
    ? null
    : new Set(logs?.map((l) => l.email?.toLowerCase().trim())).size;
  const activeBannersCount: number = banners?.filter((b) => b.active).length || 0;
  const paidBannersTotal: number =
    banners?.filter((b) => b.payment_status === 'paid').reduce((acc: number, b) => acc + (b.amount_due || 0), 0) || 0;

  return (
    <AdminDashboard
      userEmail={userEmail}
      totalLogs={totalLogs}
      uniqueUsers={uniqueUsers}
      activeBannersCount={activeBannersCount}
      paidBannersTotal={paidBannersTotal}
      initialLogs={(logs as ConnectionLog[]) || []}
      initialLogsError={logsError ? `Indisponibilité base de données : ${logsError}` : null}
    />
  );
}