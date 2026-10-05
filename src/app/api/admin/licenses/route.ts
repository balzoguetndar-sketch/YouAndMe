import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/src/lib/adminAuth';
import { validateEmail } from '@/src/lib/validation';

type LicensePlan = 'ad_supported' | 'no_ads' | 'supporter';

const ANNUAL_LICENSE_PREFIXES = ['stripe-annual:', 'manual-annual:'];

function getAnnualExpiry(licenseKey: string | null): number | null {
  if (!licenseKey) return null;
  const prefix = ANNUAL_LICENSE_PREFIXES.find((candidate) => licenseKey.startsWith(candidate));
  if (!prefix) return null;
  const expiry = Date.parse(licenseKey.slice(prefix.length).split('|')[0]);
  return Number.isFinite(expiry) ? expiry : null;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const adminEmail = await verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  if (!adminEmail) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Configuration Supabase serveur incomplète.' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const emailResult = validateEmail(body?.email);
    const plan = body?.plan as LicensePlan;
    const paymentReference = typeof body?.paymentReference === 'string'
      ? body.paymentReference.trim()
      : '';
    const amount = Number(body?.amount);

    if (
      !emailResult.isValid ||
      !['ad_supported', 'no_ads', 'supporter'].includes(plan) ||
      !paymentReference ||
      paymentReference.length > 255 ||
      body?.paymentConfirmed !== true ||
      !Number.isInteger(amount)
    ) {
      return NextResponse.json({ error: 'Informations de paiement invalides ou non confirmées.' }, { status: 400 });
    }

    if ((plan === 'ad_supported' && amount !== 7) || (plan === 'no_ads' && amount !== 12) || (plan === 'supporter' && (amount < 50 || amount > 999999))) {
      return NextResponse.json({ error: 'Le montant ne correspond pas à la formule sélectionnée.' }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: existingUsage, error: lookupError } = await supabaseAdmin
      .from('user_usage')
      .select('usage_count, license_key')
      .eq('email', emailResult.cleanEmail)
      .maybeSingle();

    if (lookupError) {
      console.error('Erreur de lecture du quota pour activation admin:', lookupError.message);
      return NextResponse.json({ error: 'Impossible de lire le quota utilisateur dans Supabase.' }, { status: 500 });
    }

    if (existingUsage?.license_key?.includes(paymentReference)) {
      return NextResponse.json({ error: 'Cette référence de paiement a déjà été activée.' }, { status: 409 });
    }

    const now = Date.now();
    let licenseKey: string;
    let expiresAt: string | null = null;

    if (plan === 'supporter') {
      licenseKey = `manual-supporter:${paymentReference}`;
    } else {
      const previousExpiry = getAnnualExpiry(existingUsage?.license_key || null);
      const expiryDate = new Date(Math.max(now, previousExpiry || now));
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      expiresAt = expiryDate.toISOString();
      licenseKey = `manual-annual:${expiresAt}|${paymentReference}`;
    }

    const { error: activationError } = await supabaseAdmin.from('user_usage').upsert({
      email: emailResult.cleanEmail,
      usage_count: existingUsage?.usage_count || 0,
      has_license: true,
      license_key: licenseKey,
      activated_at: new Date(now).toISOString(),
    }, { onConflict: 'email' });

    if (activationError) {
      console.error('Erreur d’activation manuelle de licence:', activationError.message);
      return NextResponse.json({ error: 'Supabase n’a pas pu activer la licence.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      email: emailResult.cleanEmail,
      plan,
      expiresAt,
      message: expiresAt
        ? `Accès annuel activé jusqu’au ${new Date(expiresAt).toLocaleDateString('fr-FR')}.`
        : 'Accès permanent de soutien activé.',
    });
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
}