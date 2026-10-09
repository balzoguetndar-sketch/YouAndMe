'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/clients';
import { ADMIN_EMAIL } from '@/src/lib/validation';
import { clearSessionConnectionLog } from '@/src/lib/logger';
import { soundManager } from '@/src/lib/sound';
import { useHeaderActions } from '@/src/components/layout/HeaderActionsContext';

export function HeaderNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { headerActions } = useHeaderActions();
  const [email, setEmail] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const checkActiveSession = () => {
      if (typeof window === 'undefined') return;

      if (pathname === '/login') {
        setEmail(null);
        return;
      }

      const activeSession = sessionStorage.getItem('yam_session_active') === 'true';
      const sessionEmail = sessionStorage.getItem('yam_user_email');
      const cookieMatch = document.cookie.match(/yam_user_email=([^;]+)/);

      if (activeSession && sessionEmail) {
        setEmail(sessionEmail);
      } else if (cookieMatch && activeSession) {
        setEmail(decodeURIComponent(cookieMatch[1]));
      } else {
        setEmail(null);
      }
    };

    checkActiveSession();
    window.addEventListener('yam-session-restored', checkActiveSession);
    return () => window.removeEventListener('yam-session-restored', checkActiveSession);
  }, [pathname, supabase]);

  const handleLogout = async () => {
    soundManager.stop();
    const isAdmin = email?.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase();
    try {
      await fetch('/api/auth/admin/logout', { method: 'POST' });
    } catch {}
    if (isAdmin) {
      try {
        await supabase.auth.signOut();
      } catch {}
    }
    document.cookie = 'yam_user_email=; path=/; max-age=0;';
    document.cookie = 'yam_admin_2fa=; path=/; max-age=0;';
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('yam_user_email');
      sessionStorage.removeItem('yam_session_active');
      sessionStorage.removeItem('yam_admin_2fa');
      if (isAdmin) localStorage.removeItem('yam_user_email');
      else if (email) localStorage.setItem('yam_user_email', email);
      localStorage.removeItem('yam_admin_2fa');
      clearSessionConnectionLog(email ?? undefined);
    }
    router.replace('/login');
  };

  if (!email) {
    return (
      <span className="text-xs rounded-full bg-slate-900 px-3 py-1 text-slate-400 border border-slate-800">
        🔒 Espace Privé
      </span>
    );
  }

  const isAdmin = email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim();

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
      {isAdmin && (
        <a
          href="/admin"
          className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-950 text-indigo-300 border border-indigo-800 hover:bg-indigo-900 transition-all"
        >
          👑 Panneau Admin
        </a>
      )}

      <span className="text-xs text-slate-300 font-medium hidden sm:inline truncate max-w-[200px]">
        {email}
      </span>

      {headerActions}

      <button
        onClick={handleLogout}
        className="text-xs font-bold px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
      >
        Déconnexion
      </button>
    </div>
  );
}