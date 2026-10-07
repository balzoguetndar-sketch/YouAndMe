import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkMediaPermissions,
  createMediaPermissionError,
  isMediaPermissionError,
} from './mediaPermissions.ts';

test('creates a media permission error without mutating the read-only name', () => {
  const error = createMediaPermissionError('Access denied');

  assert.equal(error.name, 'NotAllowedError');
  assert.equal(error.message, 'Access denied');
  assert.equal(isMediaPermissionError(error), true);
});

test('detects explicit permission denial errors', () => {
  const deniedError = new DOMException('Permission denied', 'NotAllowedError');
  assert.equal(isMediaPermissionError(deniedError), true);
  assert.equal(isMediaPermissionError(new Error('device busy')), false);
});

test('marks denied states as denied when browser exposes them', async () => {
  const originalPermissions = globalThis.navigator?.permissions;

  Object.defineProperty(globalThis, 'navigator', {
    value: {
      permissions: {
        query: async ({ name }: { name: string }) => ({
          state: name === 'microphone' ? 'denied' : 'granted',
        }),
      },
    },
    configurable: true,
  });

  const permissionState = await checkMediaPermissions({ audio: true, video: true });
  assert.equal(permissionState, 'denied');

  if (originalPermissions) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { permissions: originalPermissions },
      configurable: true,
    });
  }
});
