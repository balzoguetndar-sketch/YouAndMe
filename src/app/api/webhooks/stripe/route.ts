import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/src/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2023-10-16' as any,
});

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
    } catch (err: any) {
        console.error(` Signature Webhook invalide: ${err.message}`);
        return NextResponse.json({ error: 'Webhook Error' }, { status: 400 });
    }

    // Événement déclenché quand le paiement est validé
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const supabase = await createClient();

        const donorEmail = session.metadata?.donor_email || session.customer_details?.email || 'Donateur Anonyme';
        const amount = session.amount_total ? session.amount_total / 100 : 0;

        // Insertion automatique du vrai don dans la table Supabase
        await supabase.from('donations').insert([
            {
                donor_email: donorEmail,
                amount: amount,
                stripe_payment_id: session.payment_intent as string,
            },
        ]);
    }

    return NextResponse.json({ received: true });
}