import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2023-10-16' as any,
});

export async function POST(request: Request) {
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

}

/* const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  customer_email: email || undefined,
  metadata: {
    donor_email: email || 'Donateur Anonyme',
    amount: amount.toString(),
  },
  // ... reste du code inchangé
}); */