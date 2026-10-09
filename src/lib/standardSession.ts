import 'server-only';

import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export const STANDARD_SESSION_COOKIE = 'yam_standard_session';

export function hashStandardSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createStandardSessionAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function isActiveStandardSession(userId: string): Promise<boolean> {
  const token = (await cookies()).get(STANDARD_SESSION_COOKIE)?.value;
  if (!token) return false;

  const supabase = createStandardSessionAdminClient();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from('active_standard_sessions')
    .select('session_token_hash')
    .eq('user_id', userId)
    .maybeSingle();

  return !error && data?.session_token_hash === hashStandardSessionToken(token);
}