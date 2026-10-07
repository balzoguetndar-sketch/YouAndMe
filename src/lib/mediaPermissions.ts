export type MediaPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

export type MediaAccessRequest = {
  audio: boolean;
  video: boolean;
};

export function createMediaPermissionError(message: string): DOMException {
  return new DOMException(message, 'NotAllowedError');
}

export function isMediaPermissionError(error: unknown): boolean {
  const errorName =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: string }).name)
      : '';

  return ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(errorName);
}

export async function checkMediaPermissions({ audio, video }: MediaAccessRequest): Promise<MediaPermissionState> {
  if (typeof navigator === 'undefined' || !navigator.permissions || !navigator.permissions.query) {
    return 'unknown';
  }

  const queries: Promise<PermissionStatus>[] = [];

  if (audio) {
    queries.push(navigator.permissions.query({ name: 'microphone' }));
  }

  if (video) {
    queries.push(navigator.permissions.query({ name: 'camera' }));
  }

  if (queries.length === 0) {
    return 'granted';
  }

  try {
    const states = await Promise.all(queries);

    if (states.some((state) => state.state === 'denied')) {
      return 'denied';
    }

    if (states.some((state) => state.state === 'prompt')) {
      return 'prompt';
    }

    if (states.every((state) => state.state === 'granted')) {
      return 'granted';
    }
  } catch {
    return 'unknown';
  }

  return 'unknown';
}
