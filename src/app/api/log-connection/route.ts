import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialisation du client admin (outrepasse les politiques RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xztfsvhssysmpqywmyul.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = body?.email;

    if (!email) {
      return NextResponse.json({ success: false, error: 'Email required' }, { status: 400 });
    }

    // Récupération de l'adresse IP et User-Agent réels
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : (realIp || '127.0.0.1');
    const userAgent = request.headers.get('user-agent') || 'Navigateur Web';
    const nowISO = new Date().toISOString();

    // Insertion via le client administrateur avec tous les champs requis par le schéma Supabase
    const { error } = await supabaseAdmin.from('connection_logs').insert([
      {
        email: email.toLowerCase().trim(),
        ip_address: clientIp,
        user_agent: userAgent,
        started_at: nowISO,
        ended_at: nowISO,
        created_at: nowISO,
        location: clientIp === '127.0.0.1' ? 'Local' : 'En ligne',
      },
    ]);

    if (error) {
      console.warn('Erreur insertion connection_logs :', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}