import { NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { ADMIN_EMAIL } from '@/src/lib/validation';

export async function POST() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const email = data.user?.email?.trim().toLowerCase();

  if (error || !email || !data.user.email_confirmed_at || email === ADMIN_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: 'Adresse e-mail non vérifiée.' }, { status: 401 });
  }

  const response = NextResponse.json({ email });
  response.cookies.set('yam_user_email', email, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}