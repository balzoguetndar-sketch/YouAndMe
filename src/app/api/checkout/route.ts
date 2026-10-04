import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2023-10-16' as Stripe.LatestApiVersion,
});

export async function POST(req: Request) {
    try {
        const { priceId } = await req.json();

        if (!priceId) {
            return NextResponse.json(
                { error: 'Identifiant du tarif manquant.' },
                { status: 400 }
            );
        }

        const origin = req.headers.get('origin') || 'http://localhost:3000';

        // Création de la session Stripe Checkout
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'payment',
            // En cas de succès :
            success_url: `${origin}/confirmation-paiement?session_id={CHECKOUT_SESSION_ID}`,
            // En cas d'annulation/renoncement par l'utilisateur :
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