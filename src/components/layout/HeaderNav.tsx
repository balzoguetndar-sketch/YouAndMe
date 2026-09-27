'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/src/lib/supabase/clients';
import { ADMIN_EMAIL } from '@/src/lib/validation';

export function HeaderNav() {
  const [email, setEmail] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const fetchUser = async () => {
      let currentEmail: string | null = null;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        currentEmail = user?.user_metadata?.email || user?.email || null;
      } catch (e) {}

      if (!currentEmail && typeof window !== 'undefined') {
        const cookieMatch = document.cookie.match(/yam_user_email=([^;]+)/);
        if (cookieMatch) {
          currentEmail = decodeURIComponent(cookieMatch[1]);
        } else {
          currentEmail = localStorage.getItem('yam_user_email') || sessionStorage.getItem('yam_user_email');
        }
      }

      setEmail(currentEmail);
    };

    fetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setEmail(session.user.user_metadata?.email || session.user.email || null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
    document.cookie = 'yam_user_email=; path=/; max-age=0;';
    if (typeof window !== 'undefined') {
      localStorage.clear();
      sessionStorage.clear();
    }
    window.location.href = '/login';
  };

  if (!email) {
    return (
      <span className="text-xs rounded-full bg-emerald-950 px-2.5 py-1 text-emerald-400 border border-emerald-800">
        Session sécurisée
      </span>
    );
  }

  const isAdmin = email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim();

  return (
    <div className="flex items-center gap-3">
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

      <button
        onClick={handleLogout}
        className="text-xs font-bold px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
      >
        Déconnexion
      </button>
    </div>
  );
}