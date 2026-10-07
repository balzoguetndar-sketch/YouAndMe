import type { LicenseTier } from '@/src/lib/license';

export const MAX_FREE_USAGES = 10;

export interface UserUsageInfo {
  email: string;
  usageCount: number;
  maxUsage: number;
  hasLicense: boolean;
  quotaUnlimited: boolean;
  advertisingEnabled: boolean;
  licenseTier: LicenseTier;
  remaining: number;
  isLocked: boolean;
}

type UsageApiResponse = {
  usage?: UserUsageInfo;
  allowed?: boolean;
  success?: boolean;
  message?: string;
  error?: string;
};

async function readUsageResponse(response: Response): Promise<UsageApiResponse> {
  try {
    return await response.json() as UsageApiResponse;
  } catch {
    throw new Error('Réponse invalide du serveur de quota.');
  }
}

function assertSessionMatches(email: string, usage: UserUsageInfo) {
  if (usage.email !== email.trim().toLowerCase()) {
    throw new Error('Le serveur de quota a répondu pour une autre session.');
  }
}

export async function getUserUsage(email: string): Promise<UserUsageInfo> {
  const cleanEmail = (email || '').trim().toLowerCase();
  const response = await fetch('/api/usage', { cache: 'no-store' });
  const data = await readUsageResponse(response);
  if (!response.ok || !data.usage) {
    throw new Error(data.error || 'Impossible de lire le quota sur le serveur.');
  }
  assertSessionMatches(cleanEmail, data.usage);
  return data.usage;
}

export async function incrementUserUsage(email: string): Promise<{
  usage: UserUsageInfo;
  allowed: boolean;
}> {
  const cleanEmail = (email || '').trim().toLowerCase();
  const response = await fetch('/api/usage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'consume' }),
  });
  const data = await readUsageResponse(response);
  if (!data.usage) {
    throw new Error(data.error || 'Impossible de vérifier le quota sur le serveur.');
  }
  assertSessionMatches(cleanEmail, data.usage);
  if (!response.ok && response.status !== 409) {
    throw new Error(data.error || 'Impossible de vérifier le quota sur le serveur.');
  }
  return { usage: data.usage, allowed: data.allowed === true };
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

  if (!cleanEmail || !cleanKey) {
    return { success: false, message: 'Veuillez saisir votre clé de licence.' };
  }

  try {
    const response = await fetch('/api/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'activate-license', key: cleanKey }),
    });
    const data = await readUsageResponse(response);
    if (!response.ok) {
      return { success: false, message: data.error || 'Impossible d’activer la licence sur le serveur.' };
    }
  } catch {
    return { success: false, message: 'Impossible de contacter le serveur de licence.' };
  }

  return {
    success: true,
    message: '🎉 Félicitations ! Votre Licence à Vie You&Me a été activée avec succès.',
  };
}
