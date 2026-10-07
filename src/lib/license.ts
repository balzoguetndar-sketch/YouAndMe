export type LicenseTier =
  | 'free'
  | 'ad_supported'
  | 'no_ads'
  | 'supporter'
  | 'legacy';

export interface StoredLicense {
  license_tier: LicenseTier;
  license_status: 'active' | 'inactive';
  licensed_until: string | null;
  quota_unlimited: boolean;
  advertising_enabled: boolean;
}

export interface LicenseAccess {
  hasLicense: boolean;
  quotaUnlimited: boolean;
  advertisingEnabled: boolean;
  isExpired: boolean;
}

export type PaidLicenseTier = 'ad_supported' | 'no_ads' | 'supporter';

const ANNUAL_TIERS: LicenseTier[] = ['ad_supported', 'no_ads'];

export function createStoredLicense(
  tier: PaidLicenseTier,
  now = new Date(),
): StoredLicense {
  if (tier === 'supporter') {
    return {
      license_tier: 'supporter',
      license_status: 'active',
      licensed_until: null,
      quota_unlimited: true,
      advertising_enabled: false,
    };
  }

  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  return {
    license_tier: tier,
    license_status: 'active',
    licensed_until: expiresAt.toISOString(),
    quota_unlimited: true,
    advertising_enabled: tier === 'ad_supported',
  };
}

export function isAnnualLicenseActive(license: StoredLicense): boolean {
  if (license.license_status !== 'active' || !ANNUAL_TIERS.includes(license.license_tier)) {
    return false;
  }

  if (!license.licensed_until) {
    return false;
  }

  return new Date(license.licensed_until).getTime() > Date.now();
}

export function getLicenseAccess(license: StoredLicense): LicenseAccess {
  const isSupporter = license.license_tier === 'supporter';
  const isAnnual = isAnnualLicenseActive(license);
  const hasLicense = license.license_status === 'active' &&
    (isSupporter || isAnnual || license.license_tier === 'legacy');
  const advertisingEnabled = license.license_tier === 'free' ||
    (hasLicense && license.advertising_enabled);

  return {
    hasLicense,
    quotaUnlimited: Boolean(license.quota_unlimited && hasLicense),
    advertisingEnabled,
    isExpired: !hasLicense && license.license_status === 'active',
  };
}
