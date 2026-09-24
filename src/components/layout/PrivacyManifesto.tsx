'use client';

export function PrivacyManifesto() {
  return (
    <div className="w-full max-w-4xl mx-auto my-6 p-6 rounded-2xl bg-slate-900/90 border border-indigo-500/30 shadow-2xl text-slate-100 backdrop-blur-md">
      <div className="text-center space-y-2 mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950 border border-indigo-800 text-indigo-300 text-xs font-semibold">
          🛡️ Engagement Général You&Me
        </div>
        <h3 className="text-xl font-extrabold text-white">
          Liberté, Confidentialité & Communication Éphémère
        </h3>
        <p className="text-xs text-slate-400 max-w-2xl mx-auto">
          You&Me est conçu pour connecter le monde entier en toute liberté, sans surveillance et sans conservation de vos données personnelles.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 text-xs">
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
          <div className="text-lg">🌍</div>
          <h4 className="font-bold text-slate-200">Connexion Mondiale Directe</h4>
          <p className="text-slate-400 leading-relaxed">
            Où que vous soyez (Dakar, New Delhi, Paris...), si votre interlocuteur est en ligne, l'appel audio/vidéo démarre instantanément.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
          <div className="text-lg">🔒</div>
          <h4 className="font-bold text-slate-200">Zéro Flicage & Auto-Purge</h4>
          <p className="text-slate-400 leading-relaxed">
            Aucun historique de vos échanges n'est stocké sur serveur. À la fin de l'appel, la session s'efface définitivement.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
          <div className="text-lg">📱</div>
          <h4 className="font-bold text-slate-200">Bientôt sur tous vos stores</h4>
          <p className="text-slate-400 leading-relaxed">
            Prochainement disponible en téléchargement sur Google Play, App Store et Microsoft Store.
          </p>
        </div>
      </div>
    </div>
  );
}