import 'server-only';

import { ADMIN_EMAIL } from '@/src/lib/validation';

export const ADMIN_SESSION_COOKIE = 'yam_admin_session';
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

const encoder = new TextEncoder();

function encodeBase64Url(value: Uint8Array): string {
  let binary = '';
  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

  function toArrayBuffer(value: Uint8Array): ArrayBuffer {
    const buffer = new ArrayBuffer(value.byteLength);
    new Uint8Array(buffer).set(value);
    return buffer;
  }

async function getSigningKey(purpose: 'session' | 'pin'): Promise<CryptoKey> {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error('Admin session signing secret is not configured.');
  }

  return crypto.subtle.importKey(
    'raw',
    encoder.encode(`${secret}:youandme-admin-${purpose}-v1`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    purpose === 'session' ? ['sign', 'verify'] : ['sign', 'verify']
  );
}

export function isAdminPinConfigured(): boolean {
  return Boolean(process.env.ADMIN_2FA_PIN?.trim());
}

export async function verifyAdminPin(pin: unknown): Promise<boolean> {
  const expectedPin = process.env.ADMIN_2FA_PIN?.trim();
  if (!expectedPin || typeof pin !== 'string' || !pin.trim()) {
    return false;
  }

  const key = await getSigningKey('pin');
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(expectedPin));
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(pin.trim()));
}

export async function createAdminSessionToken(): Promise<string> {
  const payload = encodeBase64Url(encoder.encode(JSON.stringify({
    email: ADMIN_EMAIL.toLowerCase(),
    expiresAt: Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS,
  })));
  const key = await getSigningKey('session');
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyAdminSessionToken(token: string | undefined): Promise<string | null> {
  if (!token) {
    return null;
  }

  try {
    const [payload, encodedSignature, extraPart] = token.split('.');
    if (!payload || !encodedSignature || extraPart) {
      return null;
    }

    const key = await getSigningKey('session');
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      toArrayBuffer(decodeBase64Url(encodedSignature)),
      encoder.encode(payload)
    );
    if (!isValid) {
      return null;
    }

    const session = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as {
      email?: string;
      expiresAt?: number;
    };
    if (
      session.email !== ADMIN_EMAIL.toLowerCase() ||
      typeof session.expiresAt !== 'number' ||
      session.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return session.email;
  } catch {
    return null;
  }
}