import type { Metadata, Viewport } from 'next';
import './globals.css';
import { HeaderNav } from '@/src/components/layout/HeaderNav';
import { InstallPrompt } from '@/src/components/pwa/InstallPrompt';

export const viewport: Viewport = {
  themeColor: '#07111f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'You&Me — Espace privé',
  description: 'Application de communication vidéo, audio et tableau partagé sécurisée.',
  applicationName: 'You&Me',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'You&Me',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-indigo-600 focus:text-white"
        >
          Aller au contenu principal
        </a>

        <div className="flex min-h-screen flex-col">
          <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur px-4 py-3">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
              <span className="text-xl font-bold tracking-tight text-indigo-400">
                You&Me
              </span>
              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                <InstallPrompt />
                <HeaderNav />
              </div>
            </div>
          </header>

          <main id="main-content" className="flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}