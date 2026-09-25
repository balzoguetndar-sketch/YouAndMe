'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/clients';
import { subscribeToPresence } from '@/src/lib/webrtc';

interface LiveUsersManagerProps {
  adminEmail?: string;
  onSelectUserForCall?: (email: string) => void;
}

export function LiveUsersManager({ adminEmail, onSelectUserForCall }: LiveUsersManagerProps) {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [myEmail, setMyEmail] = useState(adminEmail || '');
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  const supabase = createClient();

  useEffect(() => {
    if (adminEmail) {
      setMyEmail(adminEmail.toLowerCase().trim());
      return;
    }

    async function fetchUser() {
      let email: string | null = null;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        email = user?.user_metadata?.email || user?.email || null;
      } catch {}

      if (!email && typeof window !== 'undefined') {
        const cookieMatch = document.cookie.match(/yam_user_email=([^;]+)/);
        if (cookieMatch) {
          email = decodeURIComponent(cookieMatch[1]);
        } else {
          email = localStorage.getItem('yam_user_email');
        }
      }

      if (email) {
        setMyEmail(email.toLowerCase().trim());
      }
    }

    fetchUser();
  }, [adminEmail, supabase]);

  useEffect(() => {
    if (!myEmail) return;

    const unsubscribe = subscribeToPresence(myEmail, (usersSet) => {
      setOnlineUsers(new Set(usersSet));
    });

    return () => {
      unsubscribe();
    };
  }, [myEmail]);

  const handleCopy = (email: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(email);
      setCopiedEmail(email);
      setTimeout(() => setCopiedEmail(null), 2500);
    }
  };

  const handleCall = (email: string) => {
    if (onSelectUserForCall) {
      onSelectUserForCall(email);
    }
    // Déclenche également un événement global pour pré-remplir le CallLauncher
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('yam:select-call-peer', { detail: { email } }));
      const launcherElement = document.getElementById('peer-email');
      if (launcherElement) {
        launcherElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        launcherElement.focus();
      }
    }
  };

  const allUsersList = Array.from(onlineUsers);
  const filteredUsers = allUsersList.filter((email) => {
    if (!searchFilter) return true;
    return email.toLowerCase().includes(searchFilter.toLowerCase());
  });

  const otherUsersCount = allUsersList.filter(
    (email) => email.toLowerCase() !== myEmail.toLowerCase()
  ).length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
      {/* En-tête avec compteur temps réel */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>👥</span> Utilisateurs Connectés en Temps Réel
            </h3>
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-extrabold bg-emerald-950 text-emerald-300 border border-emerald-700 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              {allUsersList.length} en direct
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Détection instantanée via Supabase Realtime WebSocket • Mise à jour automatique sans rechargement
          </p>
        </div>

        {allUsersList.length > 0 && (
          <div className="w-full sm:w-64">
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Rechercher parmi les connectés..."
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        )}
      </div>

      {/* Liste des utilisateurs connectés */}
      {filteredUsers.length === 0 ? (
        <div className="text-center py-10 px-4 bg-slate-950/50 rounded-xl border border-dashed border-slate-800 space-y-2">
          <div className="text-3xl">📡</div>
          <p className="text-sm font-semibold text-slate-300">
            {searchFilter ? 'Aucun utilisateur connecté ne correspond à ce filtre.' : 'En attente d’utilisateurs en ligne'}
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Dès qu'un visiteur ou utilisateur ouvre l'application You&Me, son adresse e-mail apparaîtra ici instantanément.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredUsers.map((email) => {
            const isMe = email.toLowerCase() === myEmail.toLowerCase();
            const initial = email.charAt(0).toUpperCase();

            return (
              <div
                key={email}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                  isMe
                    ? 'bg-indigo-950/30 border-indigo-800/60 shadow-md'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 shadow-md'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-500 flex items-center justify-center font-bold text-white text-sm shadow shrink-0">
                      {initial}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-slate-100 truncate" title={email}>
                        {email}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-[11px] font-medium text-emerald-400">
                          {isMe ? 'Votre session (Admin)' : 'En ligne maintenant'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions rapides */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                  {!isMe && (
                    <button
                      type="button"
                      onClick={() => handleCall(email)}
                      className="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all flex items-center justify-center gap-1.5 shadow cursor-pointer"
                    >
                      <span>📞</span> Appeler
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleCopy(email)}
                    className="py-1.5 px-3 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 transition-all flex items-center justify-center gap-1 cursor-pointer"
                    title="Copier l'adresse email"
                  >
                    <span>{copiedEmail === email ? '✅' : '📋'}</span>
                    <span>{copiedEmail === email ? 'Copié' : 'Copier'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Résumé d'état */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
        <span>
          {otherUsersCount > 0
            ? `🟢 ${otherUsersCount} autre(s) utilisateur(s) actif(s) en ce moment.`
            : 'Aucun autre utilisateur actif pour le moment.'}
        </span>
        <span className="text-slate-600">Canal : yam_presence_room</span>
      </div>
    </div>
  );
}
