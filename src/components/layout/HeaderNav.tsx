'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/clients';
import { ADMIN_EMAIL } from '@/src/lib/validation';
import { clearSessionConnectionLog } from '@/src/lib/logger';
import { soundManager } from '@/src/lib/sound';
import { useHeaderActions } from '@/src/components/layout/HeaderActionsContext';

type UserLicenseInfo = {
  has_license?: boolean;
  license_tier?: string | null;
  plan_type?: string | null;
  license_key?: string | null;
};

export function HeaderNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { headerActions } = useHeaderActions();
  const [email, setEmail] = useState<string | null>(null);
  const [licenseInfo, setLicenseInfo] = useState<UserLicenseInfo | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const checkActiveSession = () => {
      if (typeof window === 'undefined') return;

      if (pathname === '/login') {
        setEmail(null);
        setLicenseInfo(null);
        return;
      }

      const activeSession = sessionStorage.getItem('yam_session_active') === 'true';
      const sessionEmail = sessionStorage.getItem('yam_user_email');
      const cookieMatch = document.cookie.match(/yam_user_email=([^;]+)/);

      let currentEmail: string | null = null;
      if (activeSession && sessionEmail) {
        currentEmail = sessionEmail;
      } else if (cookieMatch && activeSession) {
        currentEmail = decodeURIComponent(cookieMatch[1]);
      }

      setEmail(currentEmail);
    };

    checkActiveSession();
    window.addEventListener('yam-session-restored', checkActiveSession);
    return () => window.removeEventListener('yam-session-restored', checkActiveSession);
  }, [pathname]);

  // Récupération de la licence utilisateur en temps réel
  useEffect(() => {
    if (!email) {
      setLicenseInfo(null);
      return;
    }

    const fetchLicense = async () => {
      const { data } = await supabase
        .from('user_usage')
        .select('has_license, license_tier, plan_type, license_key')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();

      if (data) {
        setLicenseInfo(data);
      }
    };

    fetchLicense();

    // Écoute Realtime des modifications sur la table user_usage
    const channel = supabase
      .channel(`user_usage_${email}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_usage',
          filter: `email=eq.${email.trim().toLowerCase()}`,
        },
        (payload) => {
          if (payload.new) {
            setLicenseInfo(payload.new as UserLicenseInfo);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [email, supabase]);

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

  // Helper pour afficher le badge de licence correct
  const renderLicenseBadge = () => {
    if (!licenseInfo || (!licenseInfo.has_license && !licenseInfo.license_key)) {
      return null;
    }

    const { license_tier, plan_type, license_key } = licenseInfo;

    if (license_tier === 'ad_supported' || (!license_tier || license_tier === 'legacy') && plan_type === '7euro') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-950 text-amber-300 border border-amber-800">
          ⭐ Licence Annuelle (avec pub)
        </span>
      );
    }

    if (license_tier === 'no_ads' || (!license_tier || license_tier === 'legacy') && plan_type === '12euro') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
          💎 Licence Annuelle (sans pub)
        </span>
      );
    }

    if (license_tier === 'supporter' || (!license_tier || license_tier === 'legacy') && (plan_type === '50euro' || license_key?.toLowerCase().includes('supporter'))) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-950 text-purple-300 border border-purple-800">
          👑 Licence à Vie VIP (sans pub)
        </span>
      );
    }

    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-200 border border-slate-700">
        ⭐ Licence Active
      </span>
    );
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

      {/* Affichage dynamique du badge de licence */}
      {renderLicenseBadge()}

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