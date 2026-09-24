# 📑 You&Me (YaM) — Rapport de Diagnostic Complet & Journal des Réparations

Date : 24 Septembre 2026
Projet : You&Me (YaM) — Communication Vidéo & Audio P2P Sécurisée & Éphémère

---

## 1. 🔍 DIAGNOSTIC INITIAL DÉTAILLÉ

### A. Connexion Mobile & Émulation (Page `/login`)
- **Problème rencontré** : L'accès à la page de connexion échouait lors des tests sur mobile ou émulateur via le tunnel ngrok.
- **Causes techniques identifiées** :
  1. *Dépendance à Supabase Anonymous Auth* : `signInAnonymously()` échoue si l'authentification anonyme est désactivée dans la console Supabase du projet.
  2. *Interception ngrok Free Tier* : ngrok affiche une page intermédiaire bloquante sur mobile tant que le bouton "Visit Site" n'est pas cliqué.
  3. *Restriction HTTPS sur navigateurs mobiles* : iOS Safari et Chrome Android bloquent l'accès aux flux caméra/micro si l'URL n'est pas en `https://`.
  4. *Synchronisation des cookies et Middleware Next.js* : Le middleware redirigeait en boucle si le cookie de session Supabase n'était pas instantanément synchronisé après soumission.

### B. Flux Vidéo / Audio WebRTC (Le point bloquant P2P)
- **Problème rencontré** : Deux appareils (PC et smartphone) ne pouvaient pas établir de liaison vidéo/audio mutuelle.
- **Cause technique** :
  - `ActiveCallRoom.tsx` ne créait aucune instance `RTCPeerConnection`.
  - Aucun serveur STUN n'était configuré pour traverser les routeurs/box Internet (NAT).
  - Aucune offre/réponse SDP ni échange de candidats ICE n'étaient transmis entre les deux interlocuteurs.

### C. Parcours Utilisateur & Présence (En Ligne / Hors Ligne)
- **Problème rencontré** :
  - La page `page.tsx` ne contenait pas le carrousel en haut ni le parcours complet.
  - La présence reposait sur une requête SQL dans les logs datant de 5 minutes au lieu d'un suivi en temps réel instantané.
  - Absence de distinction claire entre les options En ligne (Appel direct + Ambiances vs Message direct) et Hors ligne (Message différé texte/audio/vidéo).

### D. Sécurité Administrateur
- **Constat** :
  - N'importe qui pouvait saisir `adiopasedikh@gmail.com` sur `/login` et obtenir l'accès immédiat à `/admin`.
  - Une couche de protection dédiée (code secret/PIN ou validation) est à déployer.

---

## 2. 🛠️ JOURNAL DES RÉPARATIONS EFFECTUÉES

### 📁 1. Module WebRTC & Présence Temps Réel (`src/lib/webrtc.ts`)
- **Ajout des serveurs STUN publics de Google** (`stun:stun.l.google.com:19302`, `stun1`, `stun2`, etc.) pour permettre aux smartphones (en 4G/Wi-Fi) de joindre un PC distant.
- **Ajout de la signalisation complète** : Événements `call-request`, `call-accepted`, `call-rejected`, `offer`, `answer`, `ice-candidate`, `call-ended`.
- **Ajout de `subscribeToPresence`** via Supabase Realtime Channel Presence :
  - Détection immédiate du statut **En ligne** (vert) ou **Hors ligne** (orange).
  - Mise à jour dynamique automatique : si un interlocuteur se connecte plus tard, l'interface active instantanément l'appel direct sans recharger la page.

### 📁 2. Salle d'Appel Active WebRTC (`src/components/call/ActiveCallRoom.tsx`)
- **Instanciation complète de `RTCPeerConnection`** avec gestion des pistes audio et vidéo.
- **Correction `InvalidStateError` (addIceCandidate / remote description null)** : Mise en place d'une file d'attente sécurisée (`pendingIceCandidates`) qui stocke les candidats réseau arrivés avant l'offre/réponse SDP et les applique dès que la description distante est active.
- **Gestion de l'offre et de la réponse SDP** en fonction du rôle (Appelant `isInitiator` vs Destinataire).
- **Affichage dynamique des flux vidéo** : Mon flux local (avec miroir) + Flux vidéo réel de l'interlocuteur distant.
- **Contrôles interactifs** : Coupure/activation micro (`toggleMic`), Caméra (`toggleCam`), Raccrocher (`handleHangup`).
- **Affichage des Tarifs en salle** : Intégration de la grille tarifaire pilotée par la configuration administrateur (`system_settings.show_pricing_in_room`).
- **Outils collaboratifs intégrés** : Tableau blanc partagé (`Whiteboard`) et partage de fichiers éphémères (`FileShare`).

### 📁 3. Page d'Accueil & Parcours Utilisateur (`src/app/page.tsx`)
- **Bannière défilante en haut** (`BannerCarousel`) active dès la connexion.
- **Barre d'état session** avec affichage de l'e-mail connecté et bouton Déconnexion.
- **Bouton "Démarrer un test local"** (`VideoRoom`) conservé et accessible pour pré-tester sa caméra et son micro en privé.
- **Saisie de l'e-mail interlocuteur** avec badge temps réel :
  - **Si En Ligne** :
    - *Option 1* : Appel direct en temps réel (Vidéo ou Audio) avec choix d'ambiance (*Neutre, ❤️ Amoureux, 🏡 Famille, 💍 Couple, 🤝 Amitié*).
    - *Option 2* : Laisser un message direct écrit ou audio.
  - **Si Hors Ligne** :
    - *Un seul choix* : Laisser un message différé (Texte, Mémo vocal avec enregistreur `MediaRecorder`, ou Mémo vidéo).
- **Modal d'appel entrant** (`IncomingCallModal`) : Notification interactive avec nom de l'appelant, type d'appel et ambiance avec boutons "Accepter" et "Refuser".

### 📁 4. Page Login & Compatibilité Mobile (`src/app/login/page.tsx` & `src/middleware.ts`)
- **Champs vides garantis** à l'arrivée sur la page (`email = ''`, `autoComplete="email"`).
- **Carrousel défilant** (`BannerCarousel`) actif au-dessus de la carte de connexion.
- **Résilience mobile** : Cookie de session `yam_user_email` et localStorage en relais d'authentification pour éviter les blocages lors de tests mobiles/ngrok.

---

## 3. 📲 GUIDE DE TEST ENTRE MOBILE ET PC (PAS À PAS)

Pour tester la communication vidéo entre votre smartphone et votre PC :

1. **Sur votre PC** :
   - Ouvrez votre navigateur sur `http://localhost:3000`.
   - Sur la page de login, entrez une première adresse de test (ex: `pc@test.com`).
   - Vous arrivez sur l'espace avec la bannière en haut et votre badge de connexion.

2. **Sur votre Smartphone** :
   - Assurez-vous d'utiliser l'URL sécurisée **`https://`** de ngrok (ex: `https://xxxx.ngrok-free.app`).
   - *Note ngrok* : Si ngrok affiche la page de bienvenue, cliquez sur **"Visit Site"**.
   - Sur la page de login, entrez une seconde adresse (ex: `mobile@test.com`).
   - Autorisez l'accès à la caméra et au microphone lorsque le navigateur mobile le demande.

3. **Lancement de l'appel** :
   - Sur le PC, dans le champ interlocuteur, tapez `mobile@test.com`. Le badge passe au vert **"En ligne"**.
   - Choisissez l'ambiance (ex: *Amoureux* ou *Famille*), puis cliquez sur **"🚀 Lancer l'appel Vidéo"**.
   - Sur le smartphone, le modal d'appel entrant s'affiche avec l'ambiance choisie. Cliquez sur **"Accepter"**.
   - **Résultat** : La vidéo du PC apparaît sur le smartphone et la vidéo du smartphone apparaît sur le PC !

---

## 4. 🔒 PROCHAINES ÉTAPES : PAGE ADMINISTRATEUR
- Sécurisation stricte de la route `/admin` avec un code PIN / mot de passe secret maître afin que personne ne puisse usurper l'e-mail admin.
- Pilotage direct en temps réel de l'activation des tarifs et de la gestion des bannières.
