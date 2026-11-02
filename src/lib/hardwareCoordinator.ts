/**
 * Coordinateur Matériel Exclusif (Caméra & Microphone)
 *
 * Règle 2 :
 * - Les ressources caméra et micro sont NON-PARTAGEABLES simultanément entre onglets.
 * - Un seul onglet à la fois détient l'accès matériel actif.
 * - Si l'onglet qui disposait de ces ressources est fermé, elles sont automatiquement
 *   attribuées à l'onglet le plus récemment ouvert dans ce même navigateur.
 */

import { getTabId, getKnownTabs, getMostRecentTab } from '@/src/lib/tabCoordinator';

export type HardwareState = {
  ownerTabId: string | null;
  acquiredAt: number | null;
  hardwareType: 'video_audio' | 'audio_only' | null;
};

type HardwareMessage =
  | { type: 'HW_ACQUIRED'; tabId: string; acquiredAt: number; hardwareType: 'video_audio' | 'audio_only' }
  | { type: 'HW_RELEASED'; previousOwnerTabId: string; releasedAt: number; nextEligibleTabId: string | null }
  | { type: 'HW_HEARTBEAT'; tabId: string };

const CHANNEL_NAME = 'yam_hardware_lock';
let currentOwner: HardwareState = {
  ownerTabId: null,
  acquiredAt: null,
  hardwareType: null,
};

let activeMediaStream: MediaStream | null = null;
const releaseCallbacks = new Set<(isNextEligible: boolean) => void>();

export function isCurrentTabHardwareOwner(): boolean {
  return currentOwner.ownerTabId === getTabId();
}

export function getCurrentHardwareOwner(): HardwareState {
  return { ...currentOwner };
}

export function registerActiveMediaStream(stream: MediaStream | null, type: 'video_audio' | 'audio_only' = 'video_audio') {
  activeMediaStream = stream;
  const myTabId = getTabId();

  if (stream) {
    currentOwner = {
      ownerTabId: myTabId,
      acquiredAt: Date.now(),
      hardwareType: type,
    };
    broadcastHardwareAcquired(type);
  } else if (currentOwner.ownerTabId === myTabId) {
    releaseHardware();
  }
}

export function acquireHardwareLock(type: 'video_audio' | 'audio_only'): boolean {
  const myTabId = getTabId();
  if (currentOwner.ownerTabId === myTabId) {
    return true;
  }

  // Si aucun propriétaire ou si le propriétaire précédent est cet onglet
  if (!currentOwner.ownerTabId) {
    currentOwner = {
      ownerTabId: myTabId,
      acquiredAt: Date.now(),
      hardwareType: type,
    };
    broadcastHardwareAcquired(type);
    return true;
  }

  // Le matériel est actuellement détenu par un autre onglet
  return false;
}

export function releaseHardware() {
  const myTabId = getTabId();
  if (currentOwner.ownerTabId !== myTabId) {
    return;
  }

  // 1. Arrêter physiquement toutes les pistes caméra/micro
  if (activeMediaStream) {
    try {
      activeMediaStream.getTracks().forEach((track) => {
        track.stop();
      });
    } catch {}
    activeMediaStream = null;
  }

  // 2. Déterminer l'onglet le plus récent parmi les onglets restants
  const otherTabs = getKnownTabs().filter((t) => t.tabId !== myTabId);
  const nextEligible = otherTabs.length > 0
    ? otherTabs.sort((a, b) => b.createdAt - a.createdAt)[0].tabId
    : null;

  currentOwner = {
    ownerTabId: null,
    acquiredAt: null,
    hardwareType: null,
  };

  // 3. Diffuser la libération pour transmission immédiate
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage({
        type: 'HW_RELEASED',
        previousOwnerTabId: myTabId,
        releasedAt: Date.now(),
        nextEligibleTabId: nextEligible,
      });
      channel.close();
    } catch {}
  }
}

function broadcastHardwareAcquired(hardwareType: 'video_audio' | 'audio_only') {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({
      type: 'HW_ACQUIRED',
      tabId: getTabId(),
      acquiredAt: Date.now(),
      hardwareType,
    });
    channel.close();
  } catch {}
}

export function initHardwareCoordinator(onAcquireOffered?: (canTakeOver: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return () => {};
  }

  const myTabId = getTabId();
  const channel = new BroadcastChannel(CHANNEL_NAME);

  if (onAcquireOffered) {
    releaseCallbacks.add(onAcquireOffered);
  }

  const handleMessage = (event: MessageEvent<HardwareMessage>) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'HW_ACQUIRED') {
      currentOwner = {
        ownerTabId: data.tabId,
        acquiredAt: data.acquiredAt,
        hardwareType: data.hardwareType,
      };
    } else if (data.type === 'HW_RELEASED') {
      currentOwner = {
        ownerTabId: null,
        acquiredAt: null,
        hardwareType: null,
      };

      // Si cet onglet est l'onglet désigné ou le plus récent disponible
      const mostRecent = getMostRecentTab();
      const isNextEligible = data.nextEligibleTabId === myTabId || (mostRecent && mostRecent.tabId === myTabId);

      releaseCallbacks.forEach((cb) => cb(Boolean(isNextEligible)));
    }
  };

  channel.addEventListener('message', handleMessage);

  // Libération automatique à la fermeture ou rafraîchissement de l'onglet
  const handleBeforeUnload = () => {
    if (currentOwner.ownerTabId === myTabId) {
      releaseHardware();
    }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('pagehide', handleBeforeUnload);

  return () => {
    if (onAcquireOffered) {
      releaseCallbacks.delete(onAcquireOffered);
    }
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.removeEventListener('pagehide', handleBeforeUnload);
    try {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    } catch {}
  };
}
