'use client';

import { createClient } from '@/src/lib/supabase/clients';

export function LogoutButton() {
  const supabase = createClient();

  const handleLogout = async () => {
    await fetch('/api/auth/admin/logout', { method: 'POST' });
    await supabase.auth.signOut();
    document.cookie = 'yam_user_email=; path=/; max-age=0;';
    document.cookie = 'yam_admin_2fa=; path=/; max-age=0;';
    localStorage.clear();
    sessionStorage.clear();
    // Rechargement forcé vers la page de login pour nettoyer les états en mémoire
    window.location.href = '/login';
  };

  return (
    <button
      onClick={handleLogout}
      className="px-4 py-2 rounded-xl bg-red-600/80 hover:bg-red-500 text-white font-semibold text-xs border border-red-500 shadow-md transition-all"
    >
      Déconnexion
    </button>
  );
}