'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type InstallPlatform = 'android' | 'ios' | null;

const subscribeToPlatform = () => () => {};

function getPlatformSnapshot(): InstallPlatform {
  if (typeof navigator === 'undefined') return null;

  const userAgent = navigator.userAgent;
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPad|iPhone|iPod/i.test(userAgent)) return 'ios';
  return null;
}

const getServerPlatformSnapshot = (): InstallPlatform => null;

let installedInCurrentPage = false;

function subscribeToInstalledStatus(onChange: () => void) {
  if (typeof window === 'undefined') return () => {};

  const displayMode = window.matchMedia('(display-mode: standalone)');
  const handleAppInstalled = () => {
    installedInCurrentPage = true;
    onChange();
  };

  displayMode.addEventListener('change', onChange);
  window.addEventListener('appinstalled', handleAppInstalled);

  return () => {
    displayMode.removeEventListener('change', onChange);
    window.removeEventListener('appinstalled', handleAppInstalled);
  };
}

function getInstalledStatusSnapshot() {
  if (typeof window === 'undefined') return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };

  return (
    installedInCurrentPage ||
    window.matchMedia('(display-mode: standalone)').matches ||
    navigatorWithStandalone.standalone === true
  );
}

const getServerInstalledStatusSnapshot = () => false;

export function InstallPrompt() {
  const platform = useSyncExternalStore(
    subscribeToPlatform,
    getPlatformSnapshot,
    getServerPlatformSnapshot
  );
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const isInstalled = useSyncExternalStore(
    subscribeToInstalledStatus,
    getInstalledStatusSnapshot,
    getServerInstalledStatusSnapshot
  );
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstallEvent(null);
      setShowInstructions(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (!platform || isInstalled) {
    return null;
  }

  const handleInstall = async () => {
    if (!installEvent) {
      setShowInstructions(true);
      return;
    }

    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);

    if (choice.outcome === 'accepted') {
      installedInCurrentPage = true;
    } else {
      setShowInstructions(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstall}
        aria-haspopup="dialog"
        aria-expanded={showInstructions}
        className="whitespace-nowrap rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        Installer
      </button>

      {showInstructions && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/80 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-install-title"
            className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl"
          >
            <h2 id="pwa-install-title" className="text-base font-semibold">
              Installer You&Me
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {platform === 'ios'
                ? 'Dans Safari, touche Partager puis Sur l’écran d’accueil.'
                : 'Dans le menu ⋮ de Chrome, choisis Installer l’application ou Ajouter à l’écran d’accueil.'}
            </p>
            <button
              type="button"
              onClick={() => setShowInstructions(false)}
              className="mt-5 rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              Fermer
            </button>
          </section>
        </div>
      )}
    </>
  );
}