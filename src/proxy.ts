import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { validateEmail, ADMIN_EMAIL } from '@/src/lib/validation';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let authEmail: string | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authEmail = user?.user_metadata?.email || user?.email || null;
  } catch {}

  const rawCookieEmail = request.cookies.get('yam_user_email')?.value;
  const rawEmail = rawCookieEmail ? decodeURIComponent(rawCookieEmail) : '';

  // Validation stricte de l'adresse e-mail
  const { isValid, cleanEmail } = validateEmail(rawEmail);

  const pathname = request.nextUrl.pathname;
  const isLoginPage = pathname === '/login';
  const isAuthCallback = pathname.startsWith('/auth');
  const isApiRoute = pathname.startsWith('/api');
  const isAdminRoute = pathname.startsWith('/admin');
  const admin2FA = request.cookies.get('yam_admin_2fa')?.value;

  // 1. Protection stricte de l'Espace Administrateur (Email admin + 2FA vérifié)
  if (isAdminRoute) {
    if (!isValid || cleanEmail !== ADMIN_EMAIL.toLowerCase() || admin2FA !== 'verified') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return response;
  }

  // 2. Protection des routes générales : Redirection vers /login si session absente
  if (!isValid && !isLoginPage && !isAuthCallback && !isApiRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest|mp3|wav)$).*)'],
};
