'use client';

import { useSearchParams } from 'next/navigation';
import { PricingPlans } from '@/src/components/subscription/PricingPlans';
import { Suspense } from 'react';

function ContentPaiement() {
    const searchParams = useSearchParams();
    // On détecte si l'utilisateur revient de Stripe après une annulation
    const isCancelled = searchParams.get('status') === 'cancelled';

    return (
        <div className="space-y-6">
            {/* Si le paiement a été annulé, le message s'affiche ICI au-dessus */}
            {isCancelled && (
                <div className="max-w-2xl mx-auto bg-amber-950/40 border border-amber-800/60 p-4 rounded-xl text-center text-amber-200 text-sm">
                    <strong>Paiement non finalisé :</strong> Votre transaction a été annulée et aucun débit n'a été effectué sur votre compte. Nous vous remercions pour votre visite !
                </div>
            )}

            {/* Vos formules de prix */}
            <PricingPlans />
        </div>
    );
}

// Exportation principale de la page
export default function FaireUnPaiementPage() {
    return (
        <main className="min-h-screen bg-slate-950 p-6">
            <Suspense fallback={<div className="text-center text-slate-400">Chargement...</div>}>
                <ContentPaiement />
            </Suspense>
        </main>
    );
}