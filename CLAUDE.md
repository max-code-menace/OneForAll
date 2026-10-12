# OneForAll : état du projet et consignes pour Claude

Ce fichier est lu au début de chaque session. Il résume où en est le projet.
**Si quelque chose ici contredit le code, c'est le code qui a raison : vérifie avant d'affirmer.**

## Le projet
App iPhone **gratuite et open source** (Expo / React Native / TypeScript). Elle ouvre Instagram et
YouTube dans une WebView et masque Reels, Shorts et Explore, en gardant DMs, profils, recherche et
publication. TikTok est **banni** (liens bloqués). Valeurs : gratuité, confiance, honnêteté, aucune
collecte de données, dons libres (jamais dans l'app). Objectif : d'abord l'utilisateur, puis sa sœur et
ses amis (via TestFlight), puis tout le monde.

## Architecture
- `src/rules/instagram.json`, `youtube.json` : règles (sélecteurs CSS, redirections d'URL). **Source unique.**
  L'app les télécharge au lancement depuis `raw.githubusercontent.com/max-code-menace/OneForAll/main/src/rules/`.
- `src/rules/validate.ts` : validation stricte (pas de code, pas de `url()` dans le CSS, redirections
  limitées au même site). Un fichier distant ne peut changer que `rules`, jamais l'adresse ni les domaines.
- `src/lib/banned.ts` : sites bannis (TikTok), **codés en dur**, non modifiables à distance.
- `src/lib/buildInjection.ts` : script injecté dans les pages (CSS, MutationObserver, redirections, signalement du chemin).
- `src/lib/rules.tsx` : fournisseur des règles (intégrées + téléchargées + cache + désactivable dans Réglages).
- `src/lib/settings.tsx` : interrupteurs par règle, mode diagnostic. `src/lib/urlRules.ts` : règles d'URL.
- `src/components/SiteWebView.tsx` : la WebView (iOS). `SiteWebView.web.tsx` : simple message pour le web.
- `src/app/` : écrans (accueil, navigateur, réglages), Expo Router.
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
- Un **nouveau build** est nécessaire pour livrer : le bannissement TikTok et le mode diagnostic (code natif, pas des règles).
  Commandes que l'utilisateur lance **lui-même sous Windows (PowerShell), dans le dossier OneForAll** :
  ```
  git pull --no-rebase --no-edit
  eas build --platform ios --profile production
  eas submit --platform ios --latest
  ```
- Les corrections de **règles** (JSON sur `main`) arrivent sans nouveau build.

## Retours de test de l'utilisateur (iPhone)
- OK : onglet Reels masqué (Instagram), onglet Shorts masqué (YouTube), recherche Instagram sans grille Explore, DMs OK.
- **Problème ouvert** : un Reel reçu en message privé s'ouvre, et on peut descendre vers d'autres Reels. Le blocage par
  adresse n'a pas déclenché ; hypothèse non vérifiée : Instagram l'ouvre dans une fenêtre sans changer l'adresse.
  Il faut le **chemin affiché par le mode diagnostic** (Réglages → Diagnostic) sur la nouvelle version.
  L'utilisateur doit choisir : **A** voir le Reel envoyé mais pas les suivants, ou **B** aucun Reel du tout.
- Idées proposées, non demandées : masquer la bannière « Utiliser l'application » d'Instagram, masquer les publicités vidéo.

## À faire (par ordre)
1. L'utilisateur lance le nouveau build, active le diagnostic, envoie une capture du Reel ouvert → corriger la règle.
2. **Appliquer le design** de Claude Design (projet « OneForAll Prototype », fichiers `.dc.html`, `image-slot.js`,
   `support.js`). Claude n'a pas pu le lire (autorisation `/design-login` impossible en session). Il faut que l'utilisateur
   envoie les fichiers (bouton « Send to Claude Code Web », ou dépôt dans un dossier `design/` du repo, ou captures).
   Le HTML ne se réutilise pas tel quel : le reproduire en composants React Native, puis montrer des captures.
3. Statut de commerçant (UE) à renseigner dans App Store Connect (bandeau d'avertissement) : décision de l'utilisateur.
4. Inviter ses proches : TestFlight, lien public (revue bêta d'Apple possible) ou testeurs internes.
5. Lien de don (compléter `.github/FUNDING.yml` et le README), version Android, protection de la branche `main` sur GitHub
   (les règles de `main` tournent chez tout le monde) et authentification à deux facteurs.
6. Supprimer à la main l'ancienne branche `claude/ios-social-media-blocker-g3r1w6` du dépôt `martin-bois`
   (la session n'a pas pu la supprimer). Ne touche à rien d'autre dans ce dépôt.

## Comment travailler avec l'utilisateur
- Il parle **français**, n'est pas développeur : explique simplement, **une étape à la fois**, avec les commandes exactes.
- Il est sur **Windows (PowerShell)**. Les commandes `eas`, `git push` et la connexion Apple, il les lance lui-même
  (la session cloud n'a pas accès à Expo ni à Apple, et ne doit jamais voir ses mots de passe ni codes).
- Sois **honnête sur ce qui est vérifié ou non**. Ne promets pas ce que tu n'as pas testé. Corrige ton erreur franchement.
- Ne crée pas de dépôt ni de branche parallèle sans qu'il le demande. Pas de pull request sauf demande.
- Commits : e-mail GitHub « noreply » de l'utilisateur (`252899045+max-code-menace@users.noreply.github.com`),
  nom `max-code-menace`. Ne mets pas d'autre e-mail dans l'historique public.
