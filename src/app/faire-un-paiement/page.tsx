'use client';

import { useState } from 'react';
import { createClient } from '@/src/lib/supabase/clients';
import Link from 'next/link';

export default function PublicDonationPage() {
    const [amount, setAmount] = useState<number>(20);
    const [customAmount, setCustomAmount] = useState<string>('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const supabase = createClient();
    const handleDonate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const finalAmount = customAmount ? parseFloat(customAmount) : amount;

        if (!finalAmount || finalAmount <= 0) {
            alert("Veuillez saisir un montant valide.");
            setLoading(false);
            return;
        }

        try {
            // Appel de l'API Checkout Stripe
            const res = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: finalAmount,
                    email: email,
                }),
            });

            const data = await res.json();

            if (data.url) {
                // Redirection de l'utilisateur vers la page de paiement sécurisée Stripe
                window.location.href = data.url;
            } else {
                alert("Erreur lors de la création de la session de paiement.");
                setLoading(false);
            }
        } catch (err) {
            console.error(err);
            alert("Une erreur est survenue.");
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans">
            {/* HEADER PUBLIC */}
            <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center max-w-5xl mx-auto rounded-b-xl shadow-sm">
                <Link href="/" className="font-bold text-slate-800 flex items-center gap-2">
                    <span className="bg-amber-700 text-white text-xs px-2.5 py-1 rounded-lg">ST-BERNARD</span>
                    <span>Mémoires de Saint-Bernard</span>
                </Link>
                <Link href="/" className="text-xs text-slate-500 hover:text-slate-800">
                    ← Retour à l'accueil
                </Link>
            </header>

            {/* CONTENU DE LA PAGE DE DON */}
            <main className="max-w-xl mx-auto px-6 py-12">
                <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center space-y-6">

                    <div className="w-16 h-16 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-3xl mx-auto">
                        💳
                    </div>

                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Soutenir les Mémoires de Saint-Bernard</h1>
                        <p className="text-sm text-slate-500 mt-2">
                            Vos dons nous permettent de préserver et numériser le patrimoine vivant, les récits et les archives de notre commune.
                        </p>
                    </div>

                    {success ? (
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-6 rounded-xl space-y-3">
                            <span className="text-4xl">🎉</span>
                            <h3 className="font-bold text-lg">Merci infiniment pour votre soutien !</h3>
                            <p className="text-xs text-emerald-700">
                                Votre contribution a bien été enregistrée et apparaît désormais dans notre suivi.
                            </p>
                            <button
                                onClick={() => setSuccess(false)}
                                className="mt-2 text-xs text-emerald-800 underline font-medium"
                            >
                                Faire un autre don
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleDonate} className="space-y-6 text-left">

                            {/* Sélecteur de montant */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                                    Choisissez un montant
                                </label>
                                <div className="grid grid-cols-3 gap-3">
                                    {[10, 20, 50].map((val) => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => {
                                                setAmount(val);
                                                setCustomAmount('');
                                            }}
                                            className={`py-3 rounded-xl font-bold text-sm border transition ${amount === val && !customAmount
                                                ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                                }`}
                                        >
                                            {val} €
                                        </button>
                                    ))}
                                </div>
                                <input
                                    type="number"
                                    placeholder="Ou entrez un montant libre (€)"
                                    value={customAmount}
                                    onChange={(e) => setCustomAmount(e.target.value)}
                                    className="w-full mt-3 px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-600"
                                />
                            </div>

                            {/* Adresse Email (facultatif ou obligatoire) */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                                    Votre Adresse Email (Optionnel)
                                </label>
                                <input
                                    type="email"
                                    placeholder="exemple@domaine.fr"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-600"
                                />
                            </div>

                            {/* Bouton Valider */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-sm transition flex justify-center items-center gap-2"
                            >
                                {loading ? 'Traitement...' : `Faire un don de ${customAmount || amount} €`}
                            </button>
                        </form>
                    )}

                </div>
            </main>
        </div>
    );
}