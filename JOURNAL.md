# Journal de bord — You&Me (YaM)

## Étape 1 : Initialisation du projet
- **Action** : Création du projet Next.js avec TypeScript, Tailwind CSS, App Router et le répertoire `src/`.
- **Nom du dossier** : `YaM`
- **Statut** : Terminé.

---

## Prochaines étapes
- [ ] Étape 2 : Configuration de Supabase (Authentification & variables d'environnement)
- [ ] Étape 3 : Mise en place du thème dynamique et de l'accessibilité de base
- [ ] Étape 4 : Intégration WebRTC pour les appels audio/vidéo
- [ ] Étape 5 : Partage d'images privé (Supabase Storage)
- [ ] Étape 6 : Tableau partagé en temps réel
- [ ] Étape 7 : Tests & Optimisations (STUN/TURN, Mobile, Accessibilité)


## Étape 2 : Configuration de Supabase & Authentification
- **Action** : Ajout du middleware de session et de la page `/login`.
- **Fichiers ajoutés** : `src/middleware.ts`, `src/app/login/page.tsx`.
- **Statut** : Terminé.


## Étape 3 : Thème dynamique et structure responsive
- **Action** : Configuration du layout principal (`layout.tsx`) avec support de l'accessibilité (`sr-only` skip link) et structure responsive. Mise à jour de la page d'accueil connectée (`page.tsx`).
- **Fichiers modifiés** : `src/app/layout.tsx`, `src/app/page.tsx`.
- **Statut** : Terminé.

## Étape 4 : Intégration WebRTC & Flux Média Local
- **Action** : Création du hook `useMediaStream` avec gestion dynamique des permissions (cam/mic), et du composant `VideoRoom` permettant d'activer/couper la vidéo et le micro avec retour visuel.
- **Fichiers ajoutés** : `src/hooks/useMediaStream.ts`, `src/components/call/VideoRoom.tsx`.
- **Statut** : Terminé.


## Étape 5 : Journalisation Admin
- **Action** : Création de la table Supabase `connection_logs` et du service `logger.ts` pour capturer l'e-mail, la date de connexion et l'adresse IP.
- **Fichiers ajoutés/modifiés** : `src/lib/logger.ts`, `src/app/login/page.tsx`.
- **Statut** : Terminé.

## Étape 6 : Signalisation WebRTC & Modal d'appel entrant
- **Action** : Configuration du système de diffusion WebRTC via Supabase Realtime et restriction des accès admin à `adiopasedikh@gmail.com`.
- **Fichiers ajoutés/modifiés** : `src/lib/webrtc.ts`, `src/components/call/IncomingCallModal.tsx`.
- **Statut** : Terminé.

## Étape 7 : Collaboration en temps réel (Tableau & Fichiers)
- **Action** : Création du composant Canvas synchrone `Whiteboard` (Supabase Realtime Broadcast) et du composant de téléchargement partagé `FileShare` (Supabase Storage).
- **Fichiers ajoutés** : `src/components/collaboration/Whiteboard.tsx`, `src/components/collaboration/FileShare.tsx`.
- **Statut** : Terminé.