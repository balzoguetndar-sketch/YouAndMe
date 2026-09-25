import { NextResponse } from 'next/server';
import dns from 'dns/promises';
import { validateEmail, ADMIN_EMAIL } from '@/src/lib/validation';

// Domaines jetables / temporaires interdits
const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'yopmail.com',
  'mailinator.com',
  'throwawaymail.com',
  'trashmail.com',
  'temp-mail.org',
  'fakeinbox.com',
  'sharklasers.com',
  'dispostable.com',
  'getairmail.com',
  'mohmal.com',
]);

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
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const emailInput = body?.email;

    // 1. Validation syntaxique
    const { isValid, error, cleanEmail } = validateEmail(emailInput);
    if (!isValid || !cleanEmail) {
      return NextResponse.json(
        { valid: false, error: error || 'Format d’adresse e-mail invalide.' },
        { status: 400 }
      );
    }

    const [localPart, domain] = cleanEmail.split('@');

    // 2. Détection de fautes de frappe courantes
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

    // 3. Blocage des adresses e-mails temporaires/poubelles
    if (DISPOSABLE_DOMAINS.has(domain)) {
      return NextResponse.json(
        {
          valid: false,
          error: 'Les adresses e-mails temporaires ou jetables ne sont pas autorisées.',
        },
        { status: 400 }
      );
    }

    // 4. Détection de faute de frappe sur le compte Administrateur
    const adminLocal = ADMIN_EMAIL.split('@')[0];
    if (
      cleanEmail !== ADMIN_EMAIL.toLowerCase() &&
      (cleanEmail.includes('adiopasedikh') || (localPart.includes('adiop') && localPart.includes('sedikh')))
    ) {
      return NextResponse.json(
        {
          valid: false,
          error: `Attention : cette adresse ressemble au compte administrateur avec une faute de frappe. Vérifiez l'orthographe exacte (${ADMIN_EMAIL}).`,
        },
        { status: 400 }
      );
    }

    // 5. Vérification DNS & Serveurs MX du domaine
    try {
      const mxRecords = await dns.resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        // Tentative de secours avec résolution A
        const aRecords = await dns.resolve4(domain);
        if (!aRecords || aRecords.length === 0) {
          return NextResponse.json(
            {
              valid: false,
              error: `Le domaine "${domain}" n’a aucun serveur de messagerie actif pour recevoir des e-mails.`,
            },
            { status: 400 }
          );
        }
      }
    } catch (dnsErr: any) {
      // Code d'erreur DNS typique quand le domaine n'existe pas
      if (dnsErr.code === 'ENOTFOUND' || dnsErr.code === 'ENODATA' || dnsErr.code === 'SERVFAIL') {
        return NextResponse.json(
          {
            valid: false,
            error: `Le domaine "${domain}" n’existe pas ou ne possède aucun serveur de messagerie.`,
          },
          { status: 400 }
        );
      }
      // Si timeout ou réseau restreint, on laisse passer pour éviter tout faux blocage
      console.warn('Vérification DNS passée outre suite à timeout réseau :', dnsErr.message);
    }

    const isAdmin = cleanEmail === ADMIN_EMAIL.toLowerCase();

    return NextResponse.json({
      valid: true,
      cleanEmail,
      isAdmin,
    });
  } catch (err: any) {
    return NextResponse.json(
      { valid: false, error: 'Erreur lors de la vérification de l’e-mail.' },
      { status: 500 }
    );
  }
}
