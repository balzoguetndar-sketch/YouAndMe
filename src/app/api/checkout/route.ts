import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { validateEmail } from '@/src/lib/validation';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2023-10-16' as Stripe.LatestApiVersion,
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const priceId = typeof body?.priceId === 'string' ? body.priceId : '';
        const supportAmount = body?.supportAmount;
        const emailInput = body?.email;
        const emailValidation = emailInput ? validateEmail(emailInput) : null;

        if (emailValidation && !emailValidation.isValid) {
            return NextResponse.json(
                { error: 'Adresse e-mail invalide.' },
                { status: 400 }
            );
        }

        const cleanEmail = emailValidation?.cleanEmail;
        let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
        let planId: 'ad_supported' | 'no_ads' | 'supporter';

        if (supportAmount !== undefined) {
            if (!Number.isInteger(supportAmount) || supportAmount < 50 || supportAmount > 999999) {
                return NextResponse.json(
                    { error: 'Le soutien doit être un montant entier compris entre 50 € et 999 999 €.' },
                    { status: 400 }
                );
            }

            planId = 'supporter';
            lineItems = [{
                price_data: {
                    currency: 'eur',
                    product_data: { name: 'Soutien au projet You&Me' },
                    unit_amount: supportAmount * 100,
                },
                quantity: 1,
            }];
        } else {
            const configuredPlans = new Map<string, 'ad_supported' | 'no_ads'>();
            const adSupportedPriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_YOU_5_AN;
            const noAdsPriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_YOU_12_AN;
            if (adSupportedPriceId) configuredPlans.set(adSupportedPriceId, 'ad_supported');
            if (noAdsPriceId) configuredPlans.set(noAdsPriceId, 'no_ads');
            const selectedPlan = configuredPlans.get(priceId);

            if (!priceId || !selectedPlan) {
                return NextResponse.json(
                    { error: 'Identifiant de formule invalide ou non configuré.' },
                    { status: 400 }
                );
            }

            planId = selectedPlan;
            lineItems = [{ price: priceId, quantity: 1 }];
        }

        if (!lineItems.length) {
            return NextResponse.json(
                { error: 'Aucune formule sélectionnée.' },
                { status: 400 }
            );
        }

        const origin = req.headers.get('origin') || 'http://localhost:3000';
        const metadata: Stripe.MetadataParam = {
            planId,
            licenseTerm: planId === 'supporter' ? 'lifetime' : 'annual',
        };
        if (cleanEmail) {
            metadata.userEmail = cleanEmail;
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: cleanEmail || undefined,
            line_items: lineItems,
            mode: 'payment',
            metadata,
            success_url: `${origin}/confirmation-paiement?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/faire-un-paiement?status=cancelled`,
        });

        return NextResponse.json({ url: session.url });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erreur Stripe Checkout';
        console.error('Erreur Stripe Checkout:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
/* export async function POST(request: Request) {
    try {
        const { amount, email } = await request.json();

        if (!amount || amount <= 0) {
            return NextResponse.json({ error: 'Montant invalide' }, { status: 400 });
        }

        // Création de la session de paiement Stripe
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: email || undefined,
            line_items: [
                {
                    price_data: {
                        currency: 'eur',
                        product_data: {
                            name: 'Don — Mémoires de Saint-Bernard',
                            description: 'Soutien au projet de sauvegarde du patrimoine',
                        },
                        unit_amount: Math.round(amount * 100), // Stripe gère les montants en centimes
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/faire-un-don?status=success`,
            cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/faire-un-don?status=cancel`,
        });

        return NextResponse.json({ url: session.url });
    } catch (err: any) {
        console.error('Erreur Stripe:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }

} */

/* const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  customer_email: email || undefined,
  metadata: {
    donor_email: email || 'Donateur Anonyme',
    amount: amount.toString(),
  },
  // ... reste du code inchangé
}); */