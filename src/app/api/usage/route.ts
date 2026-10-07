import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { createClient as createAuthClient } from '@/src/lib/supabase/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/src/lib/adminAuth';
import { getLicenseAccess, type LicenseTier, type StoredLicense } from '@/src/lib/license';
import { ADMIN_EMAIL, validateEmail } from '@/src/lib/validation';

const MAX_FREE_USAGES = 10;
const USAGE_COLUMNS = 'email, usage_count, has_license, license_key, license_tier, license_status, licensed_until, quota_unlimited, advertising_enabled';
const MASTER_LICENSE_KEYS = new Set([
  'YAM-LIFE-2026-VIP',
  'YAM-PRO-2026-LIFE',
  'BALZOG-VIP-ACCESS-2026',
]);

type UsageRecord = {
  email: string;
  usage_count: number | null;
  has_license: boolean | null;
  license_key: string | null;
  license_tier: string | null;
  license_status: string | null;
  licensed_until: string | null;
  quota_unlimited: boolean | null;
  advertising_enabled: boolean | null;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function getSessionEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get('yam_user_email')?.value;
  if (!value) return null;

  let decodedValue = value;
  try {
    decodedValue = decodeURIComponent(value);
  } catch {}

  const result = validateEmail(decodedValue);
  if (!result.isValid) return null;

  if (result.cleanEmail === ADMIN_EMAIL.toLowerCase()) {
    const adminEmail = await verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
    return adminEmail === result.cleanEmail ? result.cleanEmail : null;
  }

  const authClient = await createAuthClient();
  const { data, error } = await authClient.auth.getUser();
  if (error || data.user?.email?.toLowerCase() !== result.cleanEmail || !data.user.email_confirmed_at) {
    return null;
  }

  return result.cleanEmail;
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getUsageInfo(email: string, row: UsageRecord | null) {
  const usageCount = Math.max(0, row?.usage_count || 0);
  if (email === ADMIN_EMAIL.toLowerCase()) {
    return {
      email,
      usageCount: 0,
      maxUsage: MAX_FREE_USAGES,
      hasLicense: true,
      quotaUnlimited: true,
      advertisingEnabled: false,
      licenseTier: 'supporter' as LicenseTier,
      remaining: Number.MAX_SAFE_INTEGER,
      isLocked: false,
    };
  }

  const normalizedKey = row?.license_key?.trim().toUpperCase();
  const storedTier = row?.license_tier;
  const tier: LicenseTier = storedTier === 'ad_supported' || storedTier === 'no_ads' || storedTier === 'supporter'
    ? storedTier
    : row?.has_license
      ? normalizedKey && (MASTER_LICENSE_KEYS.has(normalizedKey) || normalizedKey === 'STRIPE-SUPPORTER' || normalizedKey.startsWith('MANUAL-SUPPORTER:'))
        ? 'supporter'
        : 'legacy'
      : 'free';
  const license: StoredLicense = {
    license_tier: tier,
    license_status: row?.license_status === 'active' || (Boolean(row?.has_license) && !row?.license_status)
      ? 'active'
      : 'inactive',
    licensed_until: row?.licensed_until || null,
    quota_unlimited: row?.quota_unlimited ?? Boolean(row?.has_license),
    advertising_enabled: row?.advertising_enabled ?? (tier === 'free' || tier === 'ad_supported'),
  };
  const access = getLicenseAccess(license);

  return {
    email,
    usageCount,
    maxUsage: MAX_FREE_USAGES,
    hasLicense: access.hasLicense,
    quotaUnlimited: access.quotaUnlimited,
    advertisingEnabled: access.advertisingEnabled,
    licenseTier: tier,
    remaining: access.quotaUnlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, MAX_FREE_USAGES - usageCount),
    isLocked: !access.quotaUnlimited && usageCount >= MAX_FREE_USAGES,
  };
}

async function getUsageRow(email: string) {
  const supabase = createAdminClient();
  if (!supabase) return { supabase: null, row: null, error: 'Configuration Supabase serveur incomplète.' };

  const { data, error } = await supabase
    .from('user_usage')
    .select(USAGE_COLUMNS)
    .eq('email', email)
    .maybeSingle();

  if (error) {
    console.error('Erreur de lecture du quota Supabase:', error.message);
    return { supabase, row: null, error: 'Impossible de lire le quota utilisateur dans Supabase.' };
  }

  return { supabase, row: data as UsageRecord | null, error: null };
}

export async function GET() {
  const email = await getSessionEmail();
  if (!email) return json({ error: 'Session utilisateur invalide.' }, 401);

  const { row, error } = await getUsageRow(email);
  if (error) return json({ error }, 503);
  return json({ usage: getUsageInfo(email, row) });
}

export async function POST(request: Request) {
  const email = await getSessionEmail();
  if (!email) return json({ error: 'Session utilisateur invalide.' }, 401);

  let body: { action?: unknown; key?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Requête invalide.' }, 400);
  }

  if (body.action === 'activate-license') {
    const key = typeof body.key === 'string' ? body.key.trim().toUpperCase() : '';
    const isMasterKey = MASTER_LICENSE_KEYS.has(key);
    if (!isMasterKey && !/^YAM-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key)) {
      return json({ error: 'Format de clé invalide.' }, 400);
    }

    const { supabase, row, error } = await getUsageRow(email);
    if (error || !supabase) return json({ error: error || 'Supabase indisponible.' }, 503);

    const { error: activationError } = await supabase.from('user_usage').upsert({
      email,
      usage_count: row?.usage_count || 0,
      has_license: true,
      license_key: key,
      license_tier: isMasterKey ? 'supporter' : 'legacy',
      license_status: 'active',
      licensed_until: null,
      quota_unlimited: true,
      advertising_enabled: false,
      activated_at: new Date().toISOString(),
    }, { onConflict: 'email' });

    if (activationError) {
      console.error('Erreur d’activation de licence:', activationError.message);
      return json({ error: 'Impossible d’activer la licence dans Supabase.' }, 503);
    }

    return json({ success: true, message: 'Licence activée.' });
  }

  if (body.action !== 'consume') return json({ error: 'Action invalide.' }, 400);
  if (email === ADMIN_EMAIL.toLowerCase()) {
    return json({ usage: getUsageInfo(email, null), allowed: true });
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { supabase, row, error } = await getUsageRow(email);
    if (error || !supabase) return json({ error: error || 'Supabase indisponible.' }, 503);

    const usage = getUsageInfo(email, row);
    if (usage.isLocked) return json({ usage, allowed: false, error: 'Quota épuisé.' }, 409);

    const nextCount = usage.usageCount + 1;
    if (!row) {
      const { data, error: insertError } = await supabase
        .from('user_usage')
        .insert({
          email,
          usage_count: nextCount,
          has_license: false,
          last_used_at: new Date().toISOString(),
        })
        .select(USAGE_COLUMNS)
        .maybeSingle();

      if (!insertError && data) {
        return json({ usage: getUsageInfo(email, data as UsageRecord), allowed: true });
      }
      if (insertError?.code === '23505') continue;
      console.error('Erreur d’incrémentation du quota:', insertError?.message);
      return json({ error: 'Impossible d’enregistrer l’utilisation dans Supabase.' }, 503);
    }

    let update = supabase.from('user_usage').update({
      usage_count: nextCount,
      last_used_at: new Date().toISOString(),
    }).eq('email', email);
    update = row.usage_count === null
      ? update.is('usage_count', null)
      : update.eq('usage_count', row.usage_count);

    const { data, error: updateError } = await update.select(USAGE_COLUMNS).maybeSingle();
    if (updateError) {
      console.error('Erreur d’incrémentation du quota:', updateError.message);
      return json({ error: 'Impossible d’enregistrer l’utilisation dans Supabase.' }, 503);
    }
    if (data) return json({ usage: getUsageInfo(email, data as UsageRecord), allowed: true });
  }

  return json({ error: 'Le quota change trop rapidement. Réessayez.' }, 503);
}