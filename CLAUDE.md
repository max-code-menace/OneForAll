# OneForAll : état du projet et consignes pour Claude

Ce fichier est lu au début de chaque session. Il résume où en est le projet.
**Si quelque chose ici contredit le code, c'est le code qui a raison : vérifie avant d'affirmer.**

## Le projet
App iPhone **gratuite et open source** (Expo / React Native / TypeScript). Elle ouvre Instagram,
YouTube et Facebook dans une WebView et masque Reels, Shorts et Explore, en gardant DMs, profils, recherche et
publication. TikTok est **banni** (liens bloqués). Valeurs : gratuité, confiance, honnêteté, aucune
collecte de données, dons libres (jamais dans l'app). Objectif : d'abord l'utilisateur, puis sa sœur et
ses amis (via TestFlight), puis tout le monde.

## Architecture
- `src/rules/instagram.json`, `youtube.json`, `facebook.json` : règles (sélecteurs CSS, redirections d'URL). **Source unique.**
  L'app les télécharge au lancement depuis `raw.githubusercontent.com/max-code-menace/OneForAll/main/src/rules/`.
- `src/rules/validate.ts` : validation stricte (pas de code, pas de `url()` dans le CSS, redirections
  limitées au même site). Un fichier distant ne peut changer que `rules`, jamais l'adresse ni les domaines.
- `src/lib/banned.ts` : sites bannis (TikTok), **codés en dur**, non modifiables à distance.
- `src/lib/buildInjection.ts` : script injecté dans les pages (CSS, MutationObserver, redirections, signalement du chemin).
- `src/lib/rules.tsx` : fournisseur des règles (intégrées + téléchargées + cache + désactivable dans Réglages).
- `src/lib/settings.tsx` : interrupteurs par règle, mode diagnostic. `src/lib/urlRules.ts` : règles d'URL.
- `src/components/SiteWebView.tsx` : la WebView (iOS). `SiteWebView.web.tsx` : simple message pour le web.
- `src/app/` : écrans (accueil, navigateur, TikTok bloqué `blocked`, réglages, à propos), Expo Router,
  sans en-tête natif (chaque écran dessine le sien).
- Design : `design/OneForAll_Prototype.html` (export de Claude Design, s'ouvre dans un navigateur).
  Reproduit dans `src/lib/theme.ts` (couleurs claires/sombres, courbes), `src/components/ui.tsx`,
  `Mark.tsx` (symbole), `Intro.tsx` (lancement animé + présentation 3 pages, `src/lib/intro.tsx`),
  `Toast.tsx` (bandeau « Reels masqués »). Icône : `assets/icon.png` (générée depuis le symbole).
  Écarts voulus : pas de logos de marques (une lettre à la place), TikTok non débloquable (pas
  d'interrupteur), section Diagnostic gardée dans les Réglages.
- Docs publiques : `README.md`, `PRIVACY.md`, `CONTRIBUTING.md`. Licence **MPL-2.0**.

## Vérifier
```bash
npm install
npm run typecheck
npm run test:inject    # nécessite Playwright (Chromium) ; teste le moteur sur de fausses pages
```
Les sélecteurs n'ont **jamais été vérifiés par Claude sur le vrai Instagram/YouTube** (accès réseau et
connexion impossibles dans la session). Seuls les essais de l'utilisateur sur son iPhone font foi.

## Où en est le déploiement
- Compte Apple Developer actif. Projet Expo `@max-code-menace/oneforall`. Identifiant iOS : `com.maxcodemenace.oneforall`
  (définitif chez Apple).
- Un premier build « production » a été envoyé à TestFlight, avec l'utilisateur comme testeur interne (aucune revue Apple).
- Dans App Store Connect, le nom de la fiche est provisoire (« OneForAll » était pris). Le nom sous l'icône reste « OneForAll ».
- **Build 3** (design, Facebook, TikTok banni, diagnostic) livré sur TestFlight et installé par l'utilisateur.
- `app.json` contient `owner` et `extra.eas.projectId` (ajoutés par EAS, poussés sur `main`) : à garder.
- La session Claude **ne peut pas pousser sur `main`** (refusé par l'environnement) : travailler sur la branche
  de la session, puis ouvrir une pull request que l'utilisateur fusionne sur GitHub (« Merge pull request »).
- Tout changement de code (hors règles JSON) demande un nouveau build. Commandes que l'utilisateur lance
  **lui-même sous Windows (PowerShell), dans le dossier OneForAll** :
  ```
  git checkout main
  git pull --no-rebase --no-edit
  eas build --platform ios --profile production
  eas submit --platform ios --latest
  ```
- Les corrections de **règles** (JSON sur `main`) arrivent sans nouveau build.

## Retours de test de l'utilisateur (iPhone)
- OK : onglet Reels masqué (Instagram), onglet Shorts masqué (YouTube), recherche Instagram sans grille Explore, DMs OK.
- Build 3 OK : icône, lancement animé, présentation, accueil 4 cartes, écran TikTok bloqué, connexion Instagram gardée.
  Mode sombre OK. Bandeau « Reels masqués » pas encore vérifié.
- **Problème ouvert** : un Reel reçu en message privé s'ouvre, et on peut descendre vers d'autres Reels. Le blocage par
  adresse n'a pas déclenché ; hypothèse non vérifiée : Instagram l'ouvre dans une fenêtre sans changer l'adresse.
  Il faut le **chemin affiché par le mode diagnostic** (Réglages → Diagnostic) sur la nouvelle version.
  **Choix de l'utilisateur : A** (voir le Reel envoyé, mais pas les suivants). **Confirmé par le diagnostic** :
  l'adresse reste `/direct/t/<id>/` pendant le Reel puis pendant les « Suggestions » qui suivent.
  Réponse (pas encore buildée) : champ de règle `lockVideoFeed` + règles `ig.reelSwipe` / `fb.reelSwipe`. Le moteur
  repère une vidéo qui occupe l'écran (≥ 90 % largeur, ≥ 75 % hauteur) et bloque le glissement vertical commencé
  dessus (défilement natif + gestionnaires du site) ; les panneaux sans vidéo (commentaires) restent libres.
  Testé seulement sur une fausse page (Chromium). Non testé sur le vrai Instagram.
- **Facebook** (ajouté à la demande de l'utilisateur) : règles écrites sans aucun test sur le vrai site
  (`m.facebook.com`). **Connexion bloquée** par une « vérification robot » à cases à cocher, alors que chez le
  concurrent SocialLite un contrôle invisible passe tout seul. Hypothèse (non vérifiée) : notre user-agent Safari
  était figé sur iOS 18, incohérent avec le vrai moteur. Corrigé (à builder) : `applicationNameForUserAgent` avec la
  vraie version d'iOS (SiteWebView.tsx). Si ça ne suffit pas : regarder les fenêtres pop-up
  (`javaScriptCanOpenWindowsAutomatically`, `onOpenWindow`).
- Demande de l'utilisateur : barre du haut des sites trop grande. Fait (pas encore buildé) : plus de barre ; glisser
  depuis le bord gauche = retour à OneForAll ; tirer vers le bas = recharger ; astuce affichée à la 1re ouverture.
- **Design** appliqué, vérifié seulement en version web (captures Chromium), pas sur iPhone.
- Concurrent vu en vidéo : **SocialLite** (49,90 €/an). Idées reprises gratuitement, à la demande de l'utilisateur
  (pas encore buildé) : fil Instagram « Abonnements » (`ig.followingFeed`, redirection `/` → `/?variant=following`,
  anti-boucle `isAlreadyThere`), pubs masquées (`ig.ads`, texte « Sponsorisé »…), suggestions masquées par défaut,
  compteur de temps du jour sur l'accueil (`src/lib/usage.ts`, local), bouton rond flottant pour revenir, bandeau
  « Les vidéos suivantes sont bloquées ». Refusé : blocage des vraies apps (autorisation Apple Screen Time),
  notifications (serveur = collecte). L'utilisateur trouve leur Instagram « plus centré » : capture de notre
  accueil Instagram demandée pour comparer.
- Idées proposées, non demandées : masquer la bannière « Utiliser l'application » d'Instagram, masquer les publicités vidéo.

## À faire (par ordre)
1. Fait (à builder) : blocage du défilement des Reels ouverts depuis un DM.
2. Recevoir la capture de la vérification robot Facebook → trouver une solution.
3. Puis un build 4 avec tout ça (barre du haut supprimée, idées reprises de SocialLite, user-agent Facebook).
4. Statut de commerçant (UE) à renseigner dans App Store Connect (bandeau d'avertissement) : décision de l'utilisateur.
5. Inviter ses proches : TestFlight, lien public (revue bêta d'Apple possible) ou testeurs internes.
6. Lien de don (compléter `.github/FUNDING.yml` et le README), version Android, protection de la branche `main` sur GitHub
   (les règles de `main` tournent chez tout le monde) et authentification à deux facteurs.
7. Supprimer à la main l'ancienne branche `claude/ios-social-media-blocker-g3r1w6` du dépôt `martin-bois`
   (la session n'a pas pu la supprimer). Ne touche à rien d'autre dans ce dépôt.

## Comment travailler avec l'utilisateur
- Il parle **français**, n'est pas développeur : explique simplement, **une étape à la fois**, avec les commandes exactes.
- Il est sur **Windows (PowerShell)**. Les commandes `eas`, `git push` et la connexion Apple, il les lance lui-même
  (la session cloud n'a pas accès à Expo ni à Apple, et ne doit jamais voir ses mots de passe ni codes).
- Sois **honnête sur ce qui est vérifié ou non**. Ne promets pas ce que tu n'as pas testé. Corrige ton erreur franchement.
- Ne crée pas de dépôt ni de branche parallèle sans qu'il le demande. Pas de pull request sauf demande.
- Commits : e-mail GitHub « noreply » de l'utilisateur (`252899045+max-code-menace@users.noreply.github.com`),
  nom `max-code-menace`. Ne mets pas d'autre e-mail dans l'historique public.
