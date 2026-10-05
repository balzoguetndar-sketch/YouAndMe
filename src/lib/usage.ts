import { createClient } from '@/src/lib/supabase/clients';
import { ADMIN_EMAIL } from '@/src/lib/validation';

export const MAX_FREE_USAGES = 10;

export interface UserUsageInfo {
  email: string;
  usageCount: number;
  maxUsage: number;
  hasLicense: boolean;
  remaining: number;
  isLocked: boolean;
}

const MASTER_LICENSE_KEYS = new Set([
  'YAM-LIFE-2026-VIP',
  'YAM-PRO-2026-LIFE',
  'BALZOG-VIP-ACCESS-2026',
]);

/**
 * Récupère le statut d'utilisation et de licence pour un e-mail donné
 */
export async function getUserUsage(email: string): Promise<UserUsageInfo> {
  const cleanEmail = (email || '').trim().toLowerCase();
  const isAdmin = cleanEmail === ADMIN_EMAIL.toLowerCase();

  if (!cleanEmail) {
    return {
      email: '',
      usageCount: 0,
      maxUsage: MAX_FREE_USAGES,
      hasLicense: false,
      remaining: MAX_FREE_USAGES,
      isLocked: false,
    };
  }

  // L'administrateur dispose toujours d'une licence illimitée
  if (isAdmin) {
    return {
      email: cleanEmail,
      usageCount: 0,
      maxUsage: MAX_FREE_USAGES,
      hasLicense: true,
      remaining: Infinity,
      isLocked: false,
    };
  }

  let usageCount = 0;
  let hasLicense = false;

  // 1. Lecture locale immédiate
  if (typeof window !== 'undefined') {
    const localUsage = localStorage.getItem(`yam_usage_${cleanEmail}`);
    if (localUsage) {
      usageCount = parseInt(localUsage, 10) || 0;
    }
    const localLicense = localStorage.getItem(`yam_license_${cleanEmail}`);
    if (localLicense === 'true' || localLicense === 'active') {
      hasLicense = true;
    }
  }

  // 2. Synchronisation Supabase (si table disponible)
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('user_usage')
      .select('usage_count, has_license, license_key')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (!error && data) {
      usageCount = Math.max(usageCount, data.usage_count || 0);
      const annualExpiry = typeof data.license_key === 'string' && data.license_key.startsWith('stripe-annual:')
        ? Date.parse(data.license_key.slice('stripe-annual:'.length))
        : null;

      if (annualExpiry !== null) {
        hasLicense = Number.isFinite(annualExpiry) && annualExpiry > Date.now();
        if (typeof window !== 'undefined') {
          localStorage.setItem(`yam_license_${cleanEmail}`, hasLicense ? 'true' : 'false');
        }
      } else if (data.has_license) {
        hasLicense = true;
      }
      // Mise à jour du cache local
      if (typeof window !== 'undefined') {
        localStorage.setItem(`yam_usage_${cleanEmail}`, usageCount.toString());
        if (hasLicense) {
          localStorage.setItem(`yam_license_${cleanEmail}`, 'true');
        }
      }
    }
  } catch {
    // Mode hors-ligne / fallback local
  }

  const remaining = hasLicense ? Infinity : Math.max(0, MAX_FREE_USAGES - usageCount);
  const isLocked = !hasLicense && usageCount >= MAX_FREE_USAGES;

  return {
    email: cleanEmail,
    usageCount,
    maxUsage: MAX_FREE_USAGES,
    hasLicense,
    remaining,
    isLocked,
  };
}

/**
 * Incrémente le compteur d'utilisation lors d'un appel
 */
export async function incrementUserUsage(email: string): Promise<UserUsageInfo> {
  const cleanEmail = (email || '').trim().toLowerCase();
  const isAdmin = cleanEmail === ADMIN_EMAIL.toLowerCase();

  if (isAdmin || !cleanEmail) {
    return getUserUsage(cleanEmail);
  }

  let newCount = 1;

  if (typeof window !== 'undefined') {
    const current = parseInt(localStorage.getItem(`yam_usage_${cleanEmail}`) || '0', 10);
    newCount = current + 1;
    localStorage.setItem(`yam_usage_${cleanEmail}`, newCount.toString());
  }

  // Synchronisation avec Supabase
  try {
    const supabase = createClient();
    const { data: existing } = await supabase
      .from('user_usage')
      .select('usage_count, has_license')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (existing) {
      newCount = Math.max(newCount, (existing.usage_count || 0) + 1);
      await supabase
        .from('user_usage')
        .update({
          usage_count: newCount,
          last_used_at: new Date().toISOString(),
        })
        .eq('email', cleanEmail);
    } else {
      await supabase
        .from('user_usage')
        .insert({
          email: cleanEmail,
          usage_count: newCount,
          has_license: false,
          last_used_at: new Date().toISOString(),
        });
    }
  } catch {
    // Mode hors ligne
  }

  return getUserUsage(cleanEmail);
}

/**
 * Active une licence à vie avec une clé d'activation
 */
export async function activateLicenseKey(
  email: string,
  key: string
): Promise<{ success: boolean; message: string }> {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanKey = (key || '').trim().toUpperCase();

  if (!cleanKey) {
    return { success: false, message: 'Veuillez saisir votre clé de licence.' };
  }

  // Vérification de la clé
  const isValidFormat = /^YAM-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cleanKey);
  const isMasterKey = MASTER_LICENSE_KEYS.has(cleanKey);

  if (!isMasterKey && !isValidFormat) {
    return {
      success: false,
      message: 'Format de clé invalide (Ex: YAM-LIFE-2026-VIP ou YAM-XXXX-XXXX).',
    };
  }

  // Enregistrement local
  if (typeof window !== 'undefined') {
    localStorage.setItem(`yam_license_${cleanEmail}`, 'true');
    localStorage.setItem(`yam_license_key_${cleanEmail}`, cleanKey);
  }

  // Enregistrement Supabase
  try {
    const supabase = createClient();
    await supabase
      .from('user_usage')
      .upsert({
        email: cleanEmail,
        has_license: true,
        license_key: cleanKey,
        activated_at: new Date().toISOString(),
      }, { onConflict: 'email' });
  } catch {}

  return {
    success: true,
    message: '🎉 Félicitations ! Votre Licence à Vie You&Me a été activée avec succès.',
  };
}
