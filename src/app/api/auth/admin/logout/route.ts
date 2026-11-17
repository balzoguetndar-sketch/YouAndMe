import { NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE } from '@/src/lib/adminAuth';
// Force dynamic: prevents build-time static collection (env vars may be absent in preview/PHP mode).
export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set('yam_user_email', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}