/**
 * Coordinateur de sessions et d'onglets (Multi-onglets)
 *
 * Règle 1 :
 * - Deux onglets avec des e-mails différents (ex: admin et standard) coexistent
 *   sans s'écraser.
 * - Deux onglets avec le même e-mail : la session unique par e-mail s'applique,
 *   l'onglet le plus récent prend la main active.
 */

export interface TabInfo {
  tabId: string;
  createdAt: number;
  email: string | null;
  lastSeen: number;
}

type TabMessage =
  | { type: 'TAB_HELLO'; tabId: string; createdAt: number; email: string | null }
  | { type: 'TAB_WELCOME'; tabId: string; createdAt: number; email: string | null; targetTabId: string }
  | { type: 'TAB_SESSION_CHANGE'; tabId: string; email: string | null }
  | { type: 'TAB_BYE'; tabId: string };

const CHANNEL_NAME = 'yam_tabs_coordinator';
const TAB_ID_KEY = 'yam_tab_id';
const TAB_CREATED_KEY = 'yam_tab_created_at';

let currentTabId: string | null = null;
let currentTabCreatedAt: number | null = null;
const knownTabs = new Map<string, TabInfo>();

export function getTabId(): string {
  if (typeof window === 'undefined') return 'server_tab';
  if (currentTabId) return currentTabId;

  let stored = sessionStorage.getItem(TAB_ID_KEY);
  if (!stored) {
    stored = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(TAB_ID_KEY, stored);
  }
  currentTabId = stored;
  return stored;
}

export function getTabCreatedAt(): number {
  if (typeof window === 'undefined') return 0;
  if (currentTabCreatedAt) return currentTabCreatedAt;

  let stored = sessionStorage.getItem(TAB_CREATED_KEY);
  if (!stored) {
    stored = String(Date.now());
    sessionStorage.setItem(TAB_CREATED_KEY, stored);
  }
  currentTabCreatedAt = Number(stored) || Date.now();
  return currentTabCreatedAt;
}

export function getKnownTabs(): TabInfo[] {
  return Array.from(knownTabs.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function getMostRecentTab(
  predicate?: (tab: TabInfo) => boolean
): TabInfo | null {
  const tabs = getKnownTabs();
  const filtered = predicate ? tabs.filter(predicate) : tabs;
  return filtered[0] || null;
}

export function initTabCoordinator(
  initialEmail: string | null,
  callbacks?: {
    onSessionTakenOver?: (email: string) => void;
    onTabsChanged?: (tabs: TabInfo[]) => void;
  }
): () => void {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return () => {};
  }

  const myTabId = getTabId();
  const myCreatedAt = getTabCreatedAt();
  const myEmail = initialEmail ? initialEmail.trim().toLowerCase() : null;

  // Enregistrer cet onglet
  knownTabs.set(myTabId, {
    tabId: myTabId,
    createdAt: myCreatedAt,
    email: myEmail,
    lastSeen: Date.now(),
  });

  const channel = new BroadcastChannel(CHANNEL_NAME);

  const handleMessage = (event: MessageEvent<TabMessage>) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'TAB_HELLO') {
      if (data.tabId === myTabId) return;

      // Enregistrer le nouvel onglet
      knownTabs.set(data.tabId, {
        tabId: data.tabId,
        createdAt: data.createdAt,
        email: data.email,
        lastSeen: Date.now(),
      });

      // Lui répondre pour qu'il nous connaisse
      channel.postMessage({
        type: 'TAB_WELCOME',
        tabId: myTabId,
        createdAt: myCreatedAt,
        email: myEmail,
        targetTabId: data.tabId,
      });

      // Même email ? Règle de la session unique par e-mail
      if (myEmail && data.email && myEmail === data.email.toLowerCase()) {
        if (data.createdAt > myCreatedAt) {
          // L'autre onglet est plus récent que nous : il prend la main active
          callbacks?.onSessionTakenOver?.(myEmail);
        }
      }

      callbacks?.onTabsChanged?.(getKnownTabs());
    } else if (data.type === 'TAB_WELCOME') {
      if (data.targetTabId !== myTabId) return;

      knownTabs.set(data.tabId, {
        tabId: data.tabId,
        createdAt: data.createdAt,
        email: data.email,
        lastSeen: Date.now(),
      });

      // Si un onglet déjà existant avait le même email et était plus récent (cas rare de refresh)
      if (myEmail && data.email && myEmail === data.email.toLowerCase()) {
        if (data.createdAt > myCreatedAt) {
          callbacks?.onSessionTakenOver?.(myEmail);
        }
      }

      callbacks?.onTabsChanged?.(getKnownTabs());
    } else if (data.type === 'TAB_SESSION_CHANGE') {
      if (data.tabId === myTabId) return;

      const existing = knownTabs.get(data.tabId);
      if (existing) {
        existing.email = data.email;
        existing.lastSeen = Date.now();
      } else {
        knownTabs.set(data.tabId, {
          tabId: data.tabId,
          createdAt: Date.now(),
          email: data.email,
          lastSeen: Date.now(),
        });
      }

      // Si l'autre onglet vient de se connecter avec le MÊME email que nous
      if (myEmail && data.email && myEmail === data.email.toLowerCase()) {
        const otherTab = knownTabs.get(data.tabId);
        // Si l'autre onglet est plus récent ou vient d'activer ce même compte
        if (otherTab && otherTab.createdAt >= myCreatedAt) {
          callbacks?.onSessionTakenOver?.(myEmail);
        }
      }

      callbacks?.onTabsChanged?.(getKnownTabs());
    } else if (data.type === 'TAB_BYE') {
      knownTabs.delete(data.tabId);
      callbacks?.onTabsChanged?.(getKnownTabs());
    }
  };

  channel.addEventListener('message', handleMessage);

  // Annoncer l'arrivée de cet onglet à tous les autres
  channel.postMessage({
    type: 'TAB_HELLO',
    tabId: myTabId,
    createdAt: myCreatedAt,
    email: myEmail,
  });

  const handleUnload = () => {
    try {
      channel.postMessage({ type: 'TAB_BYE', tabId: myTabId });
      channel.close();
    } catch {}
  };

  window.addEventListener('beforeunload', handleUnload);

  return () => {
    window.removeEventListener('beforeunload', handleUnload);
    try {
      channel.postMessage({ type: 'TAB_BYE', tabId: myTabId });
      channel.removeEventListener('message', handleMessage);
      channel.close();
    } catch {}
  };
}

export function broadcastSessionChange(email: string | null) {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  const tabId = getTabId();
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage({
    type: 'TAB_SESSION_CHANGE',
    tabId,
    email: email ? email.trim().toLowerCase() : null,
  });
  channel.close();
}
