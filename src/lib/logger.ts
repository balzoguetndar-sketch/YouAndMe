const SESSION_LOG_KEY = 'yam_session_logged_emails';

function hasSessionConnectionLog(email: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const raw = window.sessionStorage.getItem(SESSION_LOG_KEY);
    const loggedEmails = new Set(raw ? JSON.parse(raw) as string[] : []);
    return loggedEmails.has(email);
  } catch {
    return false;
  }
}

function markSessionConnectionLog(email: string) {
  if (typeof window === 'undefined') return;

  try {
    const raw = window.sessionStorage.getItem(SESSION_LOG_KEY);
    const loggedEmails = new Set(raw ? JSON.parse(raw) as string[] : []);
    loggedEmails.add(email);
    window.sessionStorage.setItem(SESSION_LOG_KEY, JSON.stringify(Array.from(loggedEmails)));
  } catch (error) {
    console.warn('Impossible de mémoriser le journal de connexion dans cette session.', error);
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

// Protection mémoire : ensemble des requêtes de journalisation en cours pour éviter les doublons simultanés
const inFlightRequests = new Set<string>();

export async function logUserConnection(email: string): Promise<boolean> {
  const cleanEmail = email.toLowerCase().trim();

  if (!cleanEmail || hasSessionConnectionLog(cleanEmail)) {
    return false;
  }

  // Éviter les requêtes parallèles pour le même e-mail (économie mémoire et réseau)
  if (inFlightRequests.has(cleanEmail)) {
    return false;
  }

  inFlightRequests.add(cleanEmail);

  try {
    const res = await fetch('/api/log-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail }),
    });

    const result = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      temporary?: boolean;
      deduplicated?: boolean;
    };

    if (!res.ok) {
      // Indisponibilité temporaire ou erreur serveur : ne pas marquer la session pour permettre une tentative ultérieure
      console.warn(
        `[Journalisation] Indisponibilité temporaire (HTTP ${res.status}) : ${result.error || 'Serveur indisponible'}`
      );
      return false;
    }

    // Écriture confirmée avec succès par Supabase (ou déjà dédupliquée dans la fenêtre de 30s)
    markSessionConnectionLog(cleanEmail);
    return true;
  } catch (error) {
    // Erreur réseau passagère (ex. serveur en redémarrage) : ne pas bloquer ni marquer comme consigné
    console.warn('[Journalisation] Réseau ou serveur momentanément inaccessible, nouvelle tentative possible.', error);
    return false;
  } finally {
    // Libération immédiate de la mémoire
    inFlightRequests.delete(cleanEmail);
  }
}