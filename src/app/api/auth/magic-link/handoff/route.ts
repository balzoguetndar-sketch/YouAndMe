import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createStandardSessionAdminClient } from '@/src/lib/standardSession';

const HANDOFF_TTL_MS = 15 * 60 * 1000;
const HANDOFF_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type HandoffCredential =
  | { type: 'token_hash'; value: string }
  | { type: 'code'; value: string }
  | { type: 'session'; accessToken: string; refreshToken: string };

function hashHandoffId(id: string): string {
  return createHash('sha256').update(id).digest('hex');
}

function getEncryptionKey() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return serviceRoleKey ? createHash('sha256').update(serviceRoleKey).digest() : null;
}

function encryptCredential(credential: HandoffCredential) {
  const key = getEncryptionKey();
  if (!key) throw new Error('Clé de chiffrement indisponible.');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credential), 'utf8'),
    cipher.final(),
  ]);
  return {
    encrypted_credential: encrypted.toString('base64url'),
    nonce: nonce.toString('base64url'),
    auth_tag: cipher.getAuthTag().toString('base64url'),
  };
}

function decryptCredential(encrypted: string, nonce: string, authTag: string): HandoffCredential | null {
  const key = getEncryptionKey();
  if (!key) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64url'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    const credential: unknown = JSON.parse(decrypted);
    return isHandoffCredential(credential) ? credential : null;
  } catch {
    return null;
  }
}

function isHandoffCredential(value: unknown): value is HandoffCredential {
  if (!value || typeof value !== 'object') return false;
  const credential = value as Record<string, unknown>;
  if (credential.type === 'token_hash' || credential.type === 'code') {
    return typeof credential.value === 'string' && credential.value.length > 0 && credential.value.length <= 4096;
  }
  return credential.type === 'session'
    && typeof credential.accessToken === 'string'
    && credential.accessToken.length > 0
    && credential.accessToken.length <= 8192
    && typeof credential.refreshToken === 'string'
    && credential.refreshToken.length > 0
    && credential.refreshToken.length <= 4096;
}

function getAdminClient() {
  const client = createStandardSessionAdminClient();
  if (!client) {
    return { error: NextResponse.json({ error: 'Configuration Supabase serveur incomplète.' }, { status: 503 }) };
  }
  return { client };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { handoffId?: unknown; credential?: unknown; acknowledge?: unknown };
    if (typeof body.handoffId !== 'string' || !HANDOFF_ID_PATTERN.test(body.handoffId)) {
      return NextResponse.json({ error: 'Identifiant de transfert invalide.' }, { status: 400 });
    }

    const { client, error: clientError } = getAdminClient();
    if (clientError) return clientError;
    const handoffIdHash = hashHandoffId(body.handoffId);

    if (body.acknowledge === true) {
      const { error } = await client.from('magic_link_handoffs').delete().eq('handoff_id_hash', handoffIdHash);
      if (error) {
        console.error('[Magic Link] Suppression du transfert échouée :', error.message);
        return NextResponse.json({ error: 'Impossible de terminer le transfert.' }, { status: 503 });
      }
      return NextResponse.json({ success: true });
    }

    if (!isHandoffCredential(body.credential)) {
      return NextResponse.json({ error: 'Jeton de vérification invalide.' }, { status: 400 });
    }

    const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS).toISOString();
    const { error } = await client.from('magic_link_handoffs').insert({
      handoff_id_hash: handoffIdHash,
      ...encryptCredential(body.credential),
      expires_at: expiresAt,
    });

    if (error) {
      console.error('[Magic Link] Enregistrement du transfert échoué :', error.message);
      return NextResponse.json({ error: 'Impossible de transmettre le lien au navigateur d’origine.' }, { status: 503 });
    }

    await client.from('magic_link_handoffs').delete().lt('expires_at', new Date().toISOString());
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Requête de transfert invalide.' }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const handoffId = new URL(request.url).searchParams.get('id');
  if (!handoffId || !HANDOFF_ID_PATTERN.test(handoffId)) {
    return NextResponse.json({ error: 'Identifiant de transfert invalide.' }, { status: 400 });
  }

  const { client, error: clientError } = getAdminClient();
  if (clientError) return clientError;

  const { data, error } = await client
    .from('magic_link_handoffs')
    .select('encrypted_credential, nonce, auth_tag, expires_at')
    .eq('handoff_id_hash', hashHandoffId(handoffId))
    .maybeSingle();

  if (error) {
    console.error('[Magic Link] Lecture du transfert échouée :', error.message);
    return NextResponse.json({ error: 'Impossible de vérifier le transfert.' }, { status: 503 });
  }

  if (!data) {
    return NextResponse.json({ ready: false }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  }

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await client.from('magic_link_handoffs').delete().eq('handoff_id_hash', hashHandoffId(handoffId));
    return NextResponse.json({ error: 'Ce lien de connexion a expiré.' }, { status: 410 });
  }

  const credential = decryptCredential(data.encrypted_credential, data.nonce, data.auth_tag);
  if (!credential) {
    await client.from('magic_link_handoffs').delete().eq('handoff_id_hash', hashHandoffId(handoffId));
    return NextResponse.json({ error: 'Le transfert de connexion ne peut pas être déchiffré.' }, { status: 503 });
  }

  return NextResponse.json({ ready: true, credential }, { headers: { 'Cache-Control': 'no-store' } });
}