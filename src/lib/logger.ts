import { createClient } from '@/src/lib/supabase/clients';

export async function logUserConnection(email: string) {
  const cleanEmail = email.toLowerCase().trim();

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