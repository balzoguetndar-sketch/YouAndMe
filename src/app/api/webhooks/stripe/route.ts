import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { createStoredLicense, type PaidLicenseTier } from '@/src/lib/license';
import { validateEmail } from '@/src/lib/validation';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2023-10-16' as Stripe.LatestApiVersion,
});
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature!,
            process.env.STRIPE_WEBHOOK_SECRET!
        );
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Signature Webhook invalide';
        console.error(` Signature Webhook invalide: ${message}`);
        return NextResponse.json({ error: 'Webhook Error' }, { status: 400 });
    }

    // Événement déclenché quand le paiement est validé
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status !== 'paid') {
            return NextResponse.json({ received: true });
        }

        const donorEmail = session.metadata?.userEmail || session.customer_details?.email || session.customer_email || '';
        const emailValidation = validateEmail(donorEmail);
        const planId = session.metadata?.planId;
        const amount = session.amount_total ? session.amount_total / 100 : 0;

        if (emailValidation.isValid && ['ad_supported', 'no_ads', 'supporter'].includes(planId || '')) {
            const cleanEmail = emailValidation.cleanEmail;
            const { data: existingUsage, error: lookupError } = await supabaseAdmin
                .from('user_usage')
                .select('usage_count')
                .eq('email', cleanEmail)
                .maybeSingle();

            if (lookupError) {
                console.error('Erreur de lecture du quota après paiement Stripe:', lookupError.message);
                return NextResponse.json({ error: 'License activation failed' }, { status: 500 });
            }

            const tier = planId as PaidLicenseTier;
            const storedLicense = createStoredLicense(tier);
            const { error: licenseError } = await supabaseAdmin.from('user_usage').upsert({
                email: cleanEmail,
                usage_count: existingUsage?.usage_count || 0,
                has_license: true,
                license_key: tier === 'supporter'
                    ? 'stripe-supporter'
                    : `stripe-annual:${storedLicense.licensed_until}`,
                license_tier: storedLicense.license_tier,
                license_status: storedLicense.license_status,
                licensed_until: storedLicense.licensed_until,
                quota_unlimited: storedLicense.quota_unlimited,
                advertising_enabled: storedLicense.advertising_enabled,
                activated_at: new Date().toISOString(),
            }, { onConflict: 'email' });

            if (licenseError) {
                console.error('Erreur d’activation de licence Stripe:', licenseError.message);
                return NextResponse.json({ error: 'License activation failed' }, { status: 500 });
            }
        }

        await supabaseAdmin.from('donations').insert([
            {
                donor_email: donorEmail || 'Donateur Anonyme',
                amount: amount,
                stripe_payment_id: session.payment_intent as string,
            },
        ]);
    }

    return NextResponse.json({ received: true });
}