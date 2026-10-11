import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createAuthClient } from '@/src/lib/supabase/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/src/lib/adminAuth';
import { isActiveStandardSession } from '@/src/lib/standardSession';
import { ADMIN_EMAIL, validateEmail } from '@/src/lib/validation';

const BUCKET = 'session-files';
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function roomFolder(firstEmail: string, secondEmail: string) {
  const key = (email: string) => Buffer.from(email.trim().toLowerCase(), 'utf8').toString('hex');
  return [key(firstEmail), key(secondEmail)].sort().join('--');
}

function safeFileName(name: string) {
  return name.replace(/[\\/]/g, '_').replace(/[\u0000-\u001f]/g, '_').slice(0, 180) || 'fichier';
}

async function getRequesterEmail() {
  const cookieStore = await cookies();
  const rawCookieEmail = cookieStore.get('yam_user_email')?.value;
  if (!rawCookieEmail) return null;

  let decodedEmail = rawCookieEmail;
  try {
    decodedEmail = decodeURIComponent(rawCookieEmail);
  } catch {}

  const validation = validateEmail(decodedEmail);
  if (!validation.isValid) return null;

  if (validation.cleanEmail === ADMIN_EMAIL.toLowerCase()) {
    const adminEmail = await verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
    return adminEmail === validation.cleanEmail ? adminEmail : null;
  }

  const authClient = await createAuthClient();
  const { data, error } = await authClient.auth.getUser();
  if (
    error ||
    data.user?.email?.toLowerCase() !== validation.cleanEmail ||
    !data.user.email_confirmed_at ||
    !(await isActiveStandardSession(data.user.id))
  ) return null;

  return validation.cleanEmail;
}

function createStorageAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createSupabaseAdmin(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getPeerEmail(value: unknown, requesterEmail: string) {
  if (typeof value !== 'string') return null;
  const peer = validateEmail(value);
  if (!peer.isValid || peer.cleanEmail === requesterEmail) return null;
  return peer.cleanEmail;
}

export async function GET(request: Request) {
  const requesterEmail = await getRequesterEmail();
  if (!requesterEmail) return json({ error: 'Session utilisateur invalide.' }, 401);

  const peerEmail = getPeerEmail(new URL(request.url).searchParams.get('peer'), requesterEmail);
  if (!peerEmail) return json({ error: 'Interlocuteur invalide.' }, 400);

  const supabase = createStorageAdminClient();
  if (!supabase) return json({ error: 'Stockage indisponible.' }, 503);

  const folder = roomFolder(requesterEmail, peerEmail);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(folder, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

  if (error) return json({ error: 'Impossible de charger les fichiers de la salle.' }, 502);

  const files = await Promise.all((data || []).filter((item) => item.id).map(async (item) => {
    const path = `${folder}/${item.name}`;
    const { data: signed, error: signedError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (signedError || !signed) return null;
    return {
      id: path,
      name: item.name.replace(/^[0-9a-f-]{36}_/, ''),
      path,
      size: item.metadata?.size || 0,
      contentType: item.metadata?.mimetype || 'application/octet-stream',
      createdAt: item.created_at || '',
      url: signed.signedUrl,
    };
  }));

  return json({ files: files.filter((file) => file !== null) });
}

export async function POST(request: Request) {
  const requesterEmail = await getRequesterEmail();
  if (!requesterEmail) return json({ error: 'Session utilisateur invalide.' }, 401);

  let body: { peerEmail?: unknown; fileName?: unknown; size?: unknown; contentType?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Requête invalide.' }, 400);
  }

  const peerEmail = getPeerEmail(body.peerEmail, requesterEmail);
  if (!peerEmail) return json({ error: 'Interlocuteur invalide.' }, 400);
  if (
    typeof body.fileName !== 'string' ||
    !body.fileName.trim() ||
    body.fileName.length > 255 ||
    typeof body.size !== 'number' ||
    !Number.isSafeInteger(body.size) ||
    body.size <= 0
  ) return json({ error: 'Informations de fichier invalides.' }, 400);
  if (body.size > MAX_FILE_SIZE) return json({ error: 'Chaque fichier doit faire 2 Mio maximum.' }, 413);

  const supabase = createStorageAdminClient();
  if (!supabase) return json({ error: 'Stockage indisponible.' }, 503);

  const path = `${roomFolder(requesterEmail, peerEmail)}/${randomUUID()}_${safeFileName(body.fileName)}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return json({ error: 'Impossible de préparer l’envoi du fichier.' }, 502);

  return json({ path: data.path, token: data.token });
}