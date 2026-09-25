import { NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = body?.email;

    if (!email) {
      return NextResponse.json({ success: false, error: 'Email required' }, { status: 400 });
    }

    // Récupération de l'adresse IP réelle depuis les en-têtes
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : (realIp || '127.0.0.1');

    const supabase = await createClient();

    const { error } = await supabase.from('connection_logs').insert([
      {
        email: email.toLowerCase().trim(),
        ip_address: clientIp,
        created_at: new Date().toISOString(),
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
