import { NextResponse } from 'next/server';
import { validateEmail, ADMIN_EMAIL } from '@/src/lib/validation';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSessionToken,
  isAdminPinConfigured,
  verifyAdminPin,
} from '@/src/lib/adminAuth';

const attemptsByIp = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attemptsByIp.get(ip);

  if (!entry || entry.resetAt <= now) {
    attemptsByIp.set(ip, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(request: Request) {
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(clientIp)) {
    return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' }, { status: 429 });
  }

  if (!isAdminPinConfigured()) {
    return NextResponse.json(
      { error: 'Connexion administrateur non configurée : ajoutez ADMIN_2FA_PIN dans les variables serveur.' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const emailResult = validateEmail(body?.email);
    if (
      !emailResult.isValid ||
      emailResult.cleanEmail !== ADMIN_EMAIL.toLowerCase() ||
      !(await verifyAdminPin(body?.code))
    ) {
      return NextResponse.json({ error: 'Adresse ou code administrateur incorrect.' }, { status: 401 });
    }

    const token = await createAdminSessionToken();
    const response = NextResponse.json({ success: true });
    response.cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: ADMIN_SESSION_TTL_SECONDS,
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Impossible de vérifier la connexion administrateur.' }, { status: 400 });
  }
}