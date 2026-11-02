import { createClient as createAdminClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/src/lib/adminAuth';
import { AdminDashboard } from '@/src/app/admin/AdminDashboard';
import type { ConnectionLog } from '@/src/app/admin/LogManager';

// Client administrateur avec typage TypeScript
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function AdminPage() {
  const cookieStore = await cookies();
  const userEmail = await verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  if (!userEmail) {
    redirect('/login');
  }

  // Récupération sécurisée et purge automatique 48h via le client admin
  // eslint-disable-next-line react-hooks/purity -- This retention boundary must be calculated for each request.
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { error: purgeError } = await supabaseAdmin
    .from('connection_logs')
    .delete()
    .lt('created_at', fortyEightHoursAgo);
  const { data: logs, error: logsError } = purgeError
    ? { data: null, error: purgeError }
    : await supabaseAdmin
    .from('connection_logs')
    .select('*')
    .gte('created_at', fortyEightHoursAgo)
    .order('created_at', { ascending: false });

  if (logsError) {
    console.error('Impossible de charger connection_logs pour le panneau admin:', logsError.message);
  }

  // Récupération des bannières
  const { data: banners } = await supabaseAdmin
    .from('banners')
    .select('*')
    .order('created_at', { ascending: false });

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
      initialLogsError={logsError ? `Indisponibilité base de données : ${logsError.message}` : null}
    />
  );
}