import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/src/lib/adminAuth';

export async function GET() {
  const cookieStore = await cookies();
  const adminEmail = await verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);

  if (!adminEmail) {
    return NextResponse.json({ isAdmin: false }, { status: 401 });
  }

  return NextResponse.json({ isAdmin: true });
}