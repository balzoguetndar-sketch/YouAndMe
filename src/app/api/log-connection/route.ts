import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/src/lib/adminAuth';
import { isActiveStandardSession } from '@/src/lib/standardSession';
import { createClient as createSupabaseServerClient } from '@/src/lib/supabase/server';
import { getPrivacySafeIp } from '@/src/lib/ipPrivacy';
import { ADMIN_EMAIL } from '@/src/lib/validation';

const LOG_DEDUPE_WINDOW_MS = 30000;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const requestedEmail = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : '';

    if (!requestedEmail) {
      return NextResponse.json({ success: false, error: 'Email required' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const adminEmail = await verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
    let email: string;

    if (adminEmail) {
      email = adminEmail.toLowerCase().trim();
    } else {
      const supabase = await createSupabaseServerClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user?.email || user.email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase()) {
        return NextResponse.json({ success: false, error: 'Session utilisateur non authentifiée.' }, { status: 401 });
      }

      if (!(await isActiveStandardSession(user.id))) {
        return NextResponse.json({ success: false, error: 'Session utilisateur inactive.' }, { status: 401 });
      }

      email = user.email.toLowerCase().trim();
    }

    if (requestedEmail !== email) {
      return NextResponse.json({ success: false, error: 'L’adresse ne correspond pas à la session authentifiée.' }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Journalisation indisponible : configuration Supabase serveur incomplète.');
      return NextResponse.json({ success: false, error: 'Configuration Supabase serveur incomplète.' }, { status: 503 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const clientIp = getPrivacySafeIp(request);
    const userAgent = request.headers.get('user-agent') || 'Navigateur Web';
    const since = new Date(Date.now() - LOG_DEDUPE_WINDOW_MS).toISOString();

    const existing = await supabaseAdmin
      .from('connection_logs')
      .select('id')
      .eq('email', email)
      .eq('ip_address', clientIp)
      .eq('user_agent', userAgent)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existing.error) {
      console.error('Erreur lecture connection_logs pour déduplication :', existing.error.message);
      return NextResponse.json(
        { success: false, error: `Indisponibilité base de données : ${existing.error.message}`, temporary: true },
        { status: 503 }
      );
    } else if ((existing.data?.length ?? 0) > 0) {
      return NextResponse.json({ success: true, deduplicated: true });
    }

    const nowISO = new Date().toISOString();

    // Insertion via le client administrateur avec tous les champs requis par le schéma Supabase
    const { error } = await supabaseAdmin.from('connection_logs').insert([
      {
        email,
        ip_address: clientIp,
        user_agent: userAgent,
        started_at: nowISO,
        ended_at: nowISO,
        created_at: nowISO,
        location: 'En ligne',
      },
    ]);

    if (error) {
      console.error('Erreur insertion connection_logs :', error.message);
      return NextResponse.json(
        { success: false, error: `Échec d’écriture Supabase : ${error.message}`, temporary: true },
        { status: 503 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ success: false, error: message, temporary: true }, { status: 503 });
  }
}