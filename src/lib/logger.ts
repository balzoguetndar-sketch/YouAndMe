import { createClient } from '@/src/lib/supabase/clients';

const SESSION_LOG_KEY = 'yam_session_logged_emails';

function shouldSkipSessionConnectionLog(email: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) {
    return true;
  }

  try {
    const raw = window.sessionStorage.getItem(SESSION_LOG_KEY);
    const loggedEmails = new Set(raw ? JSON.parse(raw) as string[] : []);

    if (loggedEmails.has(cleanEmail)) {
      return true;
    }

    loggedEmails.add(cleanEmail);
    window.sessionStorage.setItem(SESSION_LOG_KEY, JSON.stringify(Array.from(loggedEmails)));
    return false;
  } catch {
    window.sessionStorage.setItem(SESSION_LOG_KEY, JSON.stringify([cleanEmail]));
    return false;
  }
}

export function clearSessionConnectionLog(email?: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const raw = window.sessionStorage.getItem(SESSION_LOG_KEY);
    const loggedEmails = new Set(raw ? (JSON.parse(raw) as string[]) : []);

    if (email) {
      loggedEmails.delete(email.toLowerCase().trim());
    } else {
      loggedEmails.clear();
    }

    window.sessionStorage.setItem(SESSION_LOG_KEY, JSON.stringify(Array.from(loggedEmails)));
  } catch {
    if (email) {
      window.sessionStorage.removeItem(SESSION_LOG_KEY);
    } else {
      window.sessionStorage.removeItem(SESSION_LOG_KEY);
    }
  }
}

export async function logUserConnection(email: string) {
  const cleanEmail = email.toLowerCase().trim();

  if (!cleanEmail || shouldSkipSessionConnectionLog(cleanEmail)) {
    return;
  }

  // 1. Appel direct de l'API serveur dédiée (fiable, enregistre l'IP et contourne les restrictions RLS)
  try {
    const res = await fetch('/api/log-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail }),
    });
    if (res.ok) {
      return;
    }
  } catch {}

  // 2. Fallback direct via client Supabase
  try {
    const supabase = createClient();
    const nowISO = new Date().toISOString();
    await supabase.from('connection_logs').insert([
      {
        email: cleanEmail,
        ip_address: 'Direct',
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Client App',
        started_at: nowISO,
        ended_at: nowISO,
        created_at: nowISO,
        location: 'Direct',
      },
    ]);
  } catch (err) {
    console.warn('Journalisation ignorée :', err);
  }
}