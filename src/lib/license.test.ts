import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createStoredLicense,
  getLicenseAccess,
  isAnnualLicenseActive,
  type StoredLicense,
} from './license.ts';

const storedLicense = (overrides: Partial<StoredLicense> = {}): StoredLicense => ({
  license_tier: 'free',
  license_status: 'inactive',
  licensed_until: null,
  quota_unlimited: false,
  advertising_enabled: true,
  ...overrides,
});

test('a free user has a 10-call quota and advertising', () => {
  assert.deepEqual(getLicenseAccess(storedLicense()), {
    hasLicense: false,
    quotaUnlimited: false,
    advertisingEnabled: true,
    isExpired: false,
  });
});

test('the 7 euro plan has an annual unlimited quota and advertising', () => {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const access = getLicenseAccess(storedLicense({
    license_tier: 'ad_supported',
    license_status: 'active',
    licensed_until: future,
    quota_unlimited: true,
    advertising_enabled: true,
  }));

  assert.equal(access.hasLicense, true);
  assert.equal(access.quotaUnlimited, true);
  assert.equal(access.advertisingEnabled, true);
  assert.equal(access.isExpired, false);
});

test('the 12 euro plan has an annual unlimited quota without advertising', () => {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const access = getLicenseAccess(storedLicense({
    license_tier: 'no_ads',
    license_status: 'active',
    licensed_until: future,
    quota_unlimited: true,
    advertising_enabled: false,
  }));

  assert.equal(access.hasLicense, true);
  assert.equal(access.quotaUnlimited, true);
  assert.equal(access.advertisingEnabled, false);
});

test('the supporter plan is permanent and has no advertising', () => {
  const access = getLicenseAccess(storedLicense({
    license_tier: 'supporter',
    license_status: 'active',
    licensed_until: null,
    quota_unlimited: true,
    advertising_enabled: false,
  }));

  assert.equal(access.hasLicense, true);
  assert.equal(access.quotaUnlimited, true);
  assert.equal(access.advertisingEnabled, false);
  assert.equal(access.isExpired, false);
});

test('an expired annual license is inactive', () => {
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  assert.equal(isAnnualLicenseActive(storedLicense({
    license_tier: 'no_ads',
    license_status: 'active',
    licensed_until: past,
  })), false);
});

test('creates the exact rights for each paid plan', () => {
  const now = new Date('2026-10-07T12:00:00.000Z');
  const annual = createStoredLicense('ad_supported', now);
  const noAds = createStoredLicense('no_ads', now);
  const supporter = createStoredLicense('supporter', now);

  assert.deepEqual(annual, {
    license_tier: 'ad_supported',
    license_status: 'active',
    licensed_until: '2027-10-07T12:00:00.000Z',
    quota_unlimited: true,
    advertising_enabled: true,
  });
  assert.deepEqual(noAds, {
    license_tier: 'no_ads',
    license_status: 'active',
    licensed_until: '2027-10-07T12:00:00.000Z',
    quota_unlimited: true,
    advertising_enabled: false,
  });
  assert.deepEqual(supporter, {
    license_tier: 'supporter',
    license_status: 'active',
    licensed_until: null,
    quota_unlimited: true,
    advertising_enabled: false,
  });
});
