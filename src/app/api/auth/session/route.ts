import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createStandardSessionAdminClient, hashStandardSessionToken, STANDARD_SESSION_COOKIE } from '@/src/lib/standardSession';
import { createClient } from '@/src/lib/supabase/server';
import { ADMIN_EMAIL } from '@/src/lib/validation';

const USER_EMAIL_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const authStartedAt = Date.now();
    const { data: { user }, error } = await supabase.auth.getUser();
    console.info('[Auth Session] Vérification Auth', { durationMs: Date.now() - authStartedAt });

    if (error) {
      const isInvalidAuthResponse = error.status === 400
        || error.status === 401
        || error.status === 403;

      if (!isInvalidAuthResponse) {
        console.warn('[Auth Session] Service Auth temporairement indisponible.', {
          status: error.status,
          errorName: error.name,
        });
        return NextResponse.json(
          { error: 'Le service de connexion est momentanément indisponible.' },
          { status: 503 }
        );
      }
    }

    const email = user?.email?.trim().toLowerCase();

    if (!email || !user?.email_confirmed_at || email === ADMIN_EMAIL.toLowerCase()) {
      return NextResponse.json({ error: 'Adresse e-mail non vérifiée.' }, { status: 401 });
    }

    const sessionAdmin = createStandardSessionAdminClient();
    if (!sessionAdmin) {
      return NextResponse.json({ error: 'Configuration Supabase serveur incomplète.' }, { status: 503 });
    }

    const cookieStore = await cookies();
    const existingToken = cookieStore.get(STANDARD_SESSION_COOKIE)?.value;
    const lookupStartedAt = Date.now();
    const { data: activeSession, error: lookupError } = await sessionAdmin
      .from('active_standard_sessions')
      .select('session_token_hash')
      .eq('user_id', user.id)
      .maybeSingle();
    console.info('[Auth Session] Lecture session active', { durationMs: Date.now() - lookupStartedAt });

    if (lookupError) {
      console.error('Erreur de lecture de la session active:', lookupError.message);
      return NextResponse.json({ error: 'Impossible de vérifier la session.' }, { status: 503 });
    }

    const activateNewSession = request.headers.get('x-yam-session-action') === 'activate';
    const tokenMatches = existingToken
      && activeSession?.session_token_hash === hashStandardSessionToken(existingToken);

    let sessionToken = existingToken;
    if (activateNewSession || (!activeSession && !tokenMatches)) {
      sessionToken = randomBytes(32).toString('base64url');
      const saveStartedAt = Date.now();
      const { error: saveError } = await sessionAdmin
        .from('active_standard_sessions')
        .upsert({
          user_id: user.id,
          session_token_hash: hashStandardSessionToken(sessionToken),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      console.info('[Auth Session] Enregistrement session active', { durationMs: Date.now() - saveStartedAt });

      if (saveError) {
        console.error('Erreur d’enregistrement de la session active:', saveError.message);
        return NextResponse.json({ error: 'Impossible d’enregistrer cette session.' }, { status: 503 });
      }
    } else if (!tokenMatches) {
      return NextResponse.json(
        { error: 'Cette session a été remplacée par une connexion sur un autre appareil.' },
        { status: 409 }
      );
    }

    if (!sessionToken) {
      return NextResponse.json({ error: 'Session utilisateur invalide.' }, { status: 401 });
    }

    const response = NextResponse.json({ email });
    response.cookies.set(STANDARD_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: USER_EMAIL_COOKIE_MAX_AGE,
    });
    response.cookies.set('yam_user_email', email, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: USER_EMAIL_COOKIE_MAX_AGE,
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (caughtError) {
    console.error('[Auth Session] Erreur interne inattendue :', caughtError);
    return NextResponse.json(
      { error: 'Erreur inattendue lors de la vérification de session.' },
      { status: 500 }
    );
  }
}