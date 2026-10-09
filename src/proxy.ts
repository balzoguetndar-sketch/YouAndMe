import { NextResponse, type NextRequest } from 'next/server';
import { validateEmail } from '@/src/lib/validation';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/src/lib/adminAuth';

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const rawCookieEmail = request.cookies.get('yam_user_email')?.value;
  const rawEmail = rawCookieEmail ? decodeURIComponent(rawCookieEmail) : '';

  // Validation stricte de l'adresse e-mail
  const { isValid, cleanEmail } = validateEmail(rawEmail);

  const pathname = request.nextUrl.pathname;
  const isLoginPage = pathname === '/login';
  const isAuthCallback = pathname.startsWith('/auth');
  const isMagicLinkVerify = pathname === '/verify';
  const isApiRoute = pathname.startsWith('/api');
  const isAdminRoute = pathname.startsWith('/admin');

  // Proxy check is a fast gate; the page and admin APIs verify the signed session too.
  if (isAdminRoute) {
    const adminEmail = await verifyAdminSessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
    if (!adminEmail || !isValid || cleanEmail !== adminEmail) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return response;
  }

  // 2. Protection des routes générales : Redirection vers /login si session absente
  if (!isValid && !isLoginPage && !isAuthCallback && !isMagicLinkVerify && !isApiRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest|mp3|wav)$).*)'],
};
