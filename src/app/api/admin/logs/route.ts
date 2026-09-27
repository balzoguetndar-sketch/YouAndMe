import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { ADMIN_EMAIL } from '@/src/lib/validation';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xztfsvhssysmpqywmyul.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

async function verifyAdminAuth() {
  const cookieStore = await cookies();
  const rawCookie = cookieStore.get('yam_user_email')?.value;
  const cookieEmail = rawCookie ? decodeURIComponent(rawCookie).toLowerCase().trim() : '';
  const admin2FA = cookieStore.get('yam_admin_2fa')?.value;

  return cookieEmail === ADMIN_EMAIL.toLowerCase().trim() && admin2FA === 'verified';
}

export async function GET() {
  try {
    const isAuth = await verifyAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { data: logs, error } = await supabaseAdmin
      .from('connection_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ logs: logs || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const isAuth = await verifyAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const body = await request.json();
    const { action, startDate, endDate } = body;

    if (action === 'purge24h') {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabaseAdmin
        .from('connection_logs')
        .delete()
        .lt('created_at', twentyFourHoursAgo);

      if (error) throw error;
      return NextResponse.json({ success: true, message: 'Logs > 24h purgés avec succès' });
    }

    if (action === 'purgeRange') {
      if (!startDate || !endDate) {
        return NextResponse.json({ error: 'Dates requises' }, { status: 400 });
      }
      const startISO = new Date(startDate + 'T00:00:00').toISOString();
      const endISO = new Date(endDate + 'T23:59:59').toISOString();

      const { error } = await supabaseAdmin
        .from('connection_logs')
        .delete()
        .gte('created_at', startISO)
        .lte('created_at', endISO);

      if (error) throw error;
      return NextResponse.json({ success: true, message: 'Logs de la période purgés avec succès' });
    }

    if (action === 'purgeAll') {
      const { error } = await supabaseAdmin
        .from('connection_logs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) throw error;
      return NextResponse.json({ success: true, message: 'Historique complet vidé' });
    }

    return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
