'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function ConfirmationContent() {
    const searchParams = useSearchParams();
    const sessionId = searchParams.get('session_id');

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                </div>

                <h1 className="text-2xl font-bold text-white">Paiement Réussi !</h1>

                <div className="space-y-3 text-slate-300 text-sm leading-relaxed">
                    <p>
                        Merci pour votre souscription à la licence **You&Me**.
                    </p>
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-amber-400 font-medium text-xs">
                        📧 Un e-mail contenant votre clé de licence et le lien de téléchargement vient de vous être envoyé par l'administrateur.
                    </div>
                </div>

                {sessionId && (
                    <p className="text-[10px] text-slate-500 break-all font-mono">
                        Réf. transaction : {sessionId}
                    </p>
                )}

                <div className="pt-2">
                    <Link
                        href="/"
                        className="inline-block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-6 rounded-xl transition-colors text-sm shadow-lg"
                    >
                        Retourner à l'accueil
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default function ConfirmationPaiementPage() {
    return (
        <Suspense fallback={<div className="text-center text-slate-400 py-12">Chargement de la confirmation...</div>}>
            <ConfirmationContent />
        </Suspense>
    );
}