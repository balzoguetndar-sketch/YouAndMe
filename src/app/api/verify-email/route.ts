import { NextResponse } from 'next/server';
import dns from 'dns/promises';
import { validateEmail, ADMIN_EMAIL } from '@/src/lib/validation';
import { isDisposableDomain } from '@/src/lib/disposableDomains';

const GENERIC_ERROR_MESSAGE = "Cet e-mail n'existe pas ou comporte une erreur de saisie. Recommencez, s'il vous plaît.";

// Fautes de frappe courantes sur les fournisseurs majeurs
const TYPO_MAP: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmaile.com': 'gmail.com',
  'gmail.fr': 'gmail.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yaho.fr': 'yahoo.fr',
  'hotmial.com': 'hotmail.com',
  'hotmaill.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outloock.com': 'outlook.com',
  'iclod.com': 'icloud.com',
  'icloude.com': 'icloud.com',
  'lapost.net': 'laposte.net',
  'sfr.com': 'sfr.fr',
  'orang.fr': 'orange.fr',
  'free.com': 'free.fr',
};

// Rate limiter en mémoire pour bloquer le batch et les attaques automatisées
const rateLimitMap = new Map<string, { count: number; firstRequestTime: number }>();
const RATE_LIMIT_WINDOW_MS = 30 * 1000; // 30 secondes
const MAX_REQUESTS_PER_WINDOW = 6; // max 6 requêtes par 30 secondes

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry) {
    rateLimitMap.set(ip, { count: 1, firstRequestTime: now });
    return false;
  }

  if (now - entry.firstRequestTime > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, firstRequestTime: now });
    return false;
  }

  entry.count += 1;
  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    return true;
  }

  return false;
}

export async function POST(request: Request) {
  try {
    // 0. Protection Anti-Batch / Rate Limiting (Objectif 5)
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    if (isRateLimited(clientIp)) {
      return NextResponse.json(
        {
          valid: false,
          error: '⛔ Trop de requêtes envoyées en rafale (Anti-Batch). Veuillez patienter quelques secondes avant de réessayer.',
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const emailInput = body?.email;

    // 1. Validation syntaxique
    const { isValid, cleanEmail } = validateEmail(emailInput);
    if (!isValid || !cleanEmail) {
      return NextResponse.json(
        { valid: false, error: GENERIC_ERROR_MESSAGE },
        { status: 400 }
      );
    }

    const [localPart, domain] = cleanEmail.split('@');

    // 2. Détection de fautes de frappe courantes avec suggestion bienveillante
    if (TYPO_MAP[domain]) {
      const suggested = `${localPart}@${TYPO_MAP[domain]}`;
      return NextResponse.json(
        {
          valid: false,
          error: `Le domaine "${domain}" semble comporter une faute de frappe. Vouliez-vous dire "${suggested}" ?`,
          suggestedEmail: suggested,
        },
        { status: 400 }
      );
    }

    // 3. Blocage strict des adresses e-mails jetables / temporaires (>3000 domaines) (Objectif 5)
    if (isDisposableDomain(domain)) {
      return NextResponse.json(
        {
          valid: false,
          error: '🚫 Les adresses e-mails temporaires, jetables ou anonymes sont strictement interdites sur You&Me.',
        },
        { status: 400 }
      );
    }

    // 4. Vérification DNS & Serveurs MX du domaine (Objectif 4 : e-mail obligatoirement existant)
    try {
      const mxRecords = await dns.resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        // Tentative de secours avec résolution A
        const aRecords = await dns.resolve4(domain);
        if (!aRecords || aRecords.length === 0) {
          return NextResponse.json(
            {
              valid: false,
              error: GENERIC_ERROR_MESSAGE,
            },
            { status: 400 }
          );
        }
      }
    } catch (dnsErr: unknown) {
      const errorCode = dnsErr instanceof Error ? (dnsErr as Error & { code?: string }).code : undefined;
      const errorMessage = dnsErr instanceof Error ? dnsErr.message : 'Erreur DNS inconnue';
      // Code d'erreur DNS typique quand le domaine n'existe pas
      if (errorCode === 'ENOTFOUND' || errorCode === 'ENODATA' || errorCode === 'SERVFAIL') {
        return NextResponse.json(
          {
            valid: false,
            error: GENERIC_ERROR_MESSAGE,
          },
          { status: 400 }
        );
      }
      console.warn('Vérification DNS tolérée suite à restriction réseau :', errorMessage);
    }

    const isAdmin = cleanEmail === ADMIN_EMAIL.toLowerCase();

    return NextResponse.json({
      valid: true,
      cleanEmail,
      isAdmin,
    });
  } catch {
    return NextResponse.json(
      { valid: false, error: GENERIC_ERROR_MESSAGE },
      { status: 500 }
    );
  }
}
