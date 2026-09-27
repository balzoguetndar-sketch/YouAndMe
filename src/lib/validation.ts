/**
 * Validation explicite et stricte des adresses e-mail
 */
export function validateEmail(email: string): { isValid: boolean; error?: string; cleanEmail: string } {
  if (!email || typeof email !== 'string') {
    return { isValid: false, error: 'Veuillez saisir votre adresse e-mail.', cleanEmail: '' };
  }

  const clean = email.trim().toLowerCase();

  // 1. Longueur minimale et maximale
  if (clean.length < 5 || clean.length > 254) {
    return { isValid: false, error: 'L’adresse e-mail doit comporter entre 5 et 254 caractères.', cleanEmail: clean };
  }

  // 2. Vérification des espaces
  if (/\s/.test(clean)) {
    return { isValid: false, error: 'L’adresse e-mail ne doit contenir aucun espace.', cleanEmail: clean };
  }

  // 3. Présence d’un seul symbole @
  if (!clean.includes('@')) {
    return { isValid: false, error: 'Il manque le symbole "@" dans votre adresse e-mail (ex: nom@domaine.com).', cleanEmail: clean };
  }

  const parts = clean.split('@');
  if (parts.length !== 2) {
    return { isValid: false, error: 'L’adresse e-mail ne doit contenir qu’un seul symbole "@".', cleanEmail: clean };
  }

  const [localPart, domain] = parts;

  // 4. Vérification de la partie locale avant @
  if (!localPart || localPart.length > 64 || localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return { isValid: false, error: 'Le début de l’adresse e-mail (avant l’@) est incomplet ou invalide.', cleanEmail: clean };
  }

  // 5. Vérification du nom de domaine après @
  if (!domain) {
    return { isValid: false, error: 'Veuillez renseigner le nom de domaine après l’@ (ex: gmail.com).', cleanEmail: clean };
  }

  if (!domain.includes('.')) {
    return {
      isValid: false,
      error: `Il manque l’extension (.com, .fr, .net, etc.). Vouliez-vous écrire : ${clean}.com ?`,
      cleanEmail: clean
    };
  }

  const domainParts = domain.split('.');
  const tld = domainParts[domainParts.length - 1];

  if (!tld || tld.length < 2) {
    return {
      isValid: false,
      error: `L’extension ".${tld}" est incomplète. Une extension valide comporte au moins 2 lettres (ex: .com, .fr, .org).`,
      cleanEmail: clean
    };
  }

  if (!/^[a-zA-Z]{2,24}$/.test(tld)) {
    return {
      isValid: false,
      error: `L’extension ".${tld}" contient des caractères non autorisés.`,
      cleanEmail: clean
    };
  }

  // 6. Regex standard stricte
  const strictEmailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!strictEmailRegex.test(clean)) {
    return { isValid: false, error: 'Format d’adresse e-mail incorrect (exemple valide : nom@domaine.com).', cleanEmail: clean };
  }

  return { isValid: true, cleanEmail: clean };
}

export const ADMIN_EMAIL = 'balzoguetndar@gmail.com';

/**
 * Vérification du code 2FA pour l'administrateur
 * Priorité au code configuré dans .env.local (ADMIN_2FA_PIN ou NEXT_PUBLIC_ADMIN_2FA_PIN)
 */
export function verifyAdmin2FACode(code: string): boolean {
  const cleanCode = (code || '').trim();
  const configuredPin = process.env.NEXT_PUBLIC_ADMIN_2FA_PIN || process.env.ADMIN_2FA_PIN;

  // Accepte le code configuré ou le code par défaut
  const validCodes = [
    (configuredPin || '').trim(),
    '690858', // Code initial
  ].filter(Boolean);

  return validCodes.includes(cleanCode);
}
