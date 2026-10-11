import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/src/lib/adminAuth';
import { validateEmail } from '@/src/lib/validation';

type LicensePlan = 'ad_supported' | 'no_ads' | 'supporter' | '7euro' | '12euro' | '50euro';

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

    // ----------------------------------------------------
    // ACTION 1 : Réinitialisation simple du quota (0 / 10)
    // ----------------------------------------------------
    if (body?.action === 'reset_quota') {
      const emailResult = validateEmail(body?.email);
      if (!emailResult.isValid) {
        return NextResponse.json({ error: 'Email invalide.' }, { status: 400 });
      }

      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: existingUsage, error: lookupError } = await supabaseAdmin
        .from('user_usage')
        .select('usage_count, has_license, license_key, activated_at, plan_type')
        .eq('email', emailResult.cleanEmail)
        .maybeSingle();

      if (lookupError) {
        console.error('Erreur lecture quota pour débloquage manuel:', lookupError.message);
        return NextResponse.json({ error: 'Impossible de lire le quota utilisateur dans Supabase.' }, { status: 500 });
      }

      const { error: resetError } = await supabaseAdmin.from('user_usage').upsert({
        email: emailResult.cleanEmail,
        usage_count: 0,
        has_license: Boolean(existingUsage?.has_license) || Boolean(existingUsage?.license_key),
        license_key: existingUsage?.license_key || null,
        plan_type: existingUsage?.plan_type || 'none',
        activated_at: existingUsage?.activated_at || null,
      }, { onConflict: 'email' });

      if (resetError) {
        console.error('Erreur de remise à zéro du quota:', resetError.message);
        return NextResponse.json({ error: 'Impossible de remettre à zéro le quota.' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        email: emailResult.cleanEmail,
        message: `Quota remis à zéro pour ${emailResult.cleanEmail}. L’utilisateur peut maintenant reprendre normalement.`,
      });
    }

    // ----------------------------------------------------
    // ACTION 2 : Attribution ou Rectification de licence
    // ----------------------------------------------------
    const emailResult = validateEmail(body?.email);
    const rawPlan = (body?.planType || body?.plan) as LicensePlan;

    if (!emailResult.isValid || !rawPlan) {
      return NextResponse.json({ error: 'Informations utilisateur ou formule invalides.' }, { status: 400 });
    }

    // Mappage des identifiants de plans
    let normalizedPlan: 'ad_supported' | 'no_ads' | 'supporter' = 'ad_supported';
    let dbPlanType: '7euro' | '12euro' | '50euro' = '7euro';

    if (rawPlan === 'ad_supported' || rawPlan === '7euro') {
      normalizedPlan = 'ad_supported';
      dbPlanType = '7euro';
    } else if (rawPlan === 'no_ads' || rawPlan === '12euro') {
      normalizedPlan = 'no_ads';
      dbPlanType = '12euro';
    } else if (rawPlan === 'supporter' || rawPlan === '50euro') {
      normalizedPlan = 'supporter';
      dbPlanType = '50euro';
    }

    const paymentReference = typeof body?.paymentReference === 'string' && body.paymentReference.trim()
      ? body.paymentReference.trim()
      : `admin-rectification-${Date.now()}`;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: existingUsage, error: lookupError } = await supabaseAdmin
      .from('user_usage')
      .select('usage_count, has_license, license_key')
      .eq('email', emailResult.cleanEmail)
      .maybeSingle();

    if (lookupError) {
      console.error('Erreur de lecture du quota pour activation admin:', lookupError.message);
      return NextResponse.json({ error: 'Impossible de lire le quota utilisateur dans Supabase.' }, { status: 500 });
    }

    const now = Date.now();
    let licenseKey: string;
    let expiresAt: string | null = null;

    if (normalizedPlan === 'supporter') {
      licenseKey = `manual-supporter:${paymentReference}`;
    } else {
      const previousExpiry = getAnnualExpiry(existingUsage?.license_key || null);
      const expiryDate = new Date(Math.max(now, previousExpiry || now));
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      expiresAt = expiryDate.toISOString();
      licenseKey = `manual-annual:${expiresAt}|${paymentReference}`;
    }

    // Mise à jour simultanée des colonnes `license_key`, `plan_type` et `expires_at`
    const { error: activationError } = await supabaseAdmin.from('user_usage').upsert({
      email: emailResult.cleanEmail,
      usage_count: 0, // Réinitialise le compteur d'appels lors de l'activation
      has_license: true,
      plan_type: dbPlanType,
      expires_at: expiresAt,
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
      plan: normalizedPlan,
      planType: dbPlanType,
      expiresAt,
      message: expiresAt
        ? `Licence ${dbPlanType === '7euro' ? '7 € (avec pub)' : '12 € (sans pub)'} activée jusqu’au ${new Date(expiresAt).toLocaleDateString('fr-FR')}.`
        : 'Licence 50 € + (Soutien permanent à vie) activée.',
    });
  } catch (err) {
    console.error('Erreur serveur route licence admin:', err);
    return NextResponse.json({ error: 'Requête invalide ou erreur serveur.' }, { status: 400 });
  }
}