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
  `INSIDE_HOSTS` (`src/lib/sites.ts`, en dur aussi) : domaines de connexion gardés dans l'app ; tout autre
  site (hors réseaux) s'ouvre dans Safari.
- `src/lib/buildInjection.ts` : script injecté dans les pages (CSS, MutationObserver, redirections, signalement du chemin).
- `src/lib/rules.tsx` : fournisseur des règles (intégrées + téléchargées + cache + désactivable dans Réglages).
- `src/lib/settings.tsx` : interrupteurs par règle, mode diagnostic. `src/lib/urlRules.ts` : règles d'URL.
- `src/components/SiteWebView.tsx` : la WebView (iOS). `SiteWebView.web.tsx` : simple message pour le web.
- `src/app/` : écrans (accueil, navigateur, réglages, à propos), Expo Router,
  sans en-tête natif (chaque écran dessine le sien).
- Design : `design/OneForAll_Prototype.html` (export de Claude Design, s'ouvre dans un navigateur).
  Reproduit dans `src/lib/theme.ts` (couleurs claires/sombres, courbes), `src/components/ui.tsx`,
  `Mark.tsx` (symbole), `Intro.tsx` (lancement animé + présentation 3 pages, `src/lib/intro.tsx`),
  `Toast.tsx` (bandeau « Reels masqués »). Icône : `assets/icon.png` (générée depuis le symbole).
  Écarts voulus : section Diagnostic gardée dans les Réglages. Icônes des cartes : `assets/sites/*.png`,
  découpées dans une image fournie par l'utilisateur (ressemblent aux logos officiels : risque de remarque
  d'Apple, signalé, choix de l'utilisateur). **TikTok n'apparaît plus nulle part dans l'interface** (demande de
  l'utilisateur) ; ses liens restent bannis en silence par `banned.ts`.
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
- **Build 4** fabriqué (PR 2 et 3 fusionnées : plein écran, onglets au glissement, tuto, Reels en DM bloqués, fil
  Abonnements, pubs, temps du jour, pastille et notifications, icônes, TikTok retiré de l'interface, user-agent
  Facebook). Envoi à TestFlight à confirmer avec l'utilisateur ; pas encore testé sur iPhone.
- Invitation de la sœur en cours : groupe de test **externe** + **lien public** TestFlight (revue bêta Apple
  demandée ; textes de « Test Information » fournis). Prochaine étape : activer le lien public et l'envoyer.
- Branche `claude/beautiful-mayer-mvofmc` : 1 commit non fusionné (« Revoir la présentation » relance le tuto),
  à regrouper avec les corrections issues des tests du build 4 dans une prochaine PR.
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
- ⚠️ **Les règles de `main` tournent aussi sur les ANCIENNES versions installées.** Vérifié : le build 3 n'a pas
  l'anti-boucle (`isAlreadyThere`), donc `ig.followingFeed` (`/` → `/?variant=following`) y recharge la page sans fin
  (page Instagram blanche). Avant d'ajouter une règle, vérifier qu'elle ne casse pas les builds plus anciens.
- Le 12/10, les captures de l'utilisateur montraient encore le **build 3** (barre du haut, carte TikTok « Bloqué »),
  et pas le build 4 : le build 4 n'était donc pas installé sur son iPhone (TestFlight à vérifier).

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
- Demande de l'utilisateur : barre du haut des sites trop grande. Fait (pas encore buildé) : plus de barre.
  2e design (artifact Claude Design de l'utilisateur, « Prototype animé ») : dans un site, glisser depuis le bord
  **droit** = onglet suivant du réseau, bord **gauche** = onglet précédent (`SITE_TABS` dans `src/lib/sites.ts`,
  bords de 22 pt, seuil 50 pt, `injectJavaScript` qui clique le lien du site) ; seul le bouton rond ramène à
  OneForAll (geste de retour iOS coupé sur cet écran) ; tirer vers le bas = recharger. **Petit tuto** la 1re fois
  sur l'accueil, un site et les Réglages (`src/components/Tour.tsx`, `oneforall:tour-seen:v1`), il remplace l'astuce
  « glisser ». Onglet Profil d'Instagram trouvé par la photo de profil (alt « profil »/« profile ») : non vérifié.
  Réglages → « Revoir la présentation » remet aussi le tuto à zéro (`resetTours`) : fait après le build 4, à builder.
- **Design** appliqué, vérifié seulement en version web (captures Chromium), pas sur iPhone.
- Concurrent vu en vidéo : **SocialLite** (49,90 €/an). Idées reprises gratuitement, à la demande de l'utilisateur
  (pas encore buildé) : fil Instagram « Abonnements » (`ig.followingFeed`, redirection `/` → `/?variant=following`,
  anti-boucle `isAlreadyThere`), pubs masquées (`ig.ads`, texte « Sponsorisé »…), suggestions masquées par défaut,
  compteur de temps du jour sur l'accueil (`src/lib/usage.ts`, local), bouton rond flottant pour revenir, bandeau
  « Les vidéos suivantes sont bloquées ». Refusé : blocage des vraies apps (autorisation Apple Screen Time),
  notifications (serveur = collecte). L'utilisateur trouve leur Instagram « plus centré » : capture de notre
  accueil Instagram demandée pour comparer.
- **Notifications** (demande de l'utilisateur, pas encore buildé) : pas de serveur (refusé : il garderait les
  connexions = collecte). À la place : pastille de non-lus sur l'accueil (`src/lib/unread.ts` : titre « (N) » de la
  page + requête directe du téléphone à `instagram.com/api/v1/direct_v2/get_badge_count/`, endpoint NON officiel,
  non vérifié) et, en option (désactivé par défaut, Réglages → Notifications), vérification en arrière-plan
  `expo-background-fetch` + notification locale (`src/lib/backgroundCheck.ts`) : c'est iOS qui choisit quand
  (souvent des heures de retard). Les cookies viennent de la WebView (`sharedCookiesEnabled` les recopie dans
  `NSHTTPCookieStorage`, utilisé par `fetch`). Nouveaux modules natifs : expo-background-fetch, expo-task-manager,
  expo-notifications (plugin `expo-background-fetch` dans app.json, pas de push donc pas de plugin notifications).
- **Onglets au glissement gauche/droite RETIRÉS** (demande de l'utilisateur après le build 5 : chaque changement
  d'onglet rechargeait tout le site). Plus aucun glissement gauche/droite dans un site (ni onglets, ni retour
  arrière de WebKit : `allowsBackForwardNavigationGestures={false}`) ; seul « tirer vers le bas » recharge.
  **Ne pas les remettre sans qu'il le demande.**
- **Fluidité** (pas encore buildé, testé sur fausses pages Chromium) : redirections sans rechargement (`softGo` :
  `pushState`/`replaceState` + événement `popstate` que le routeur du site écoute ; si rien n'est ajouté à la page
  en 800 ms, rechargement à la bonne adresse). Explore → recherche et accueil → fil Abonnements ne rechargent donc
  plus la page (supposé sur le vrai Instagram). Écouteurs de geste non passifs posés seulement sur le conteneur
  d'une vidéo plein écran (avant : sur toute la page, iOS attendait le script à chaque défilement). Nettoyage :
  chaque sélecteur cherché une fois.
- **Fil Instagram plein de Reels** (constaté par l'utilisateur sur le build 5) : les Reels masqués laissaient de grands
  espaces vides (leur case gardait sa place) et le fil « Suivi(e) » se chargeait sans fin. Fait (à builder, testé sur
  fausse page) : la case qui ne contient que la publication masquée est masquée aussi (`rowOf`, 3 niveaux max) ; champ
  de règle `feedEnd` (sur `ig.feedReels`) : carte « Tu as tout vu » + « Revenir en haut » quand, après la dernière
  publication visible, il n'y a que des publications masquées (au moins 12). Barre d'onglets : la case du lien Reels
  est masquée aussi (`:has`, règle JSON seule), plus de trou entre Recherche et Messages.
- Idées proposées, non demandées : masquer la bannière « Utiliser l'application » d'Instagram, masquer les publicités vidéo.
- **Audit complet + corrections** (après le build 4, pas encore buildé ; testé seulement sur fausses pages Chromium) :
  - Sécurité des règles téléchargées : libellés/descriptions sans `< > &` et page bloquée construite sans HTML ;
    CSS sans `\` ni `@` (sauf `@media`), ni `url(`/`image(`/`src(` ; regex sans répétition imbriquée ni
    référence arrière ; cibles de redirection : seuls `$1`-`$9`, et cible revérifiée APRÈS remplacement
    (`isSafeTarget` dans urlRules.ts + `safeTarget` dans le script injecté). Nouveau champ de règle `silent`
    (pas de bandeau ; ignoré sans risque par les anciennes versions) sur `ig.followingFeed`.
  - Messages page → app : écoutés seulement sur les domaines des réseaux, valeurs vérifiées.
  - Liens externes → Safari ; écran « Pas de connexion » en français avec « Réessayer » ; le script est figé à
    l'ouverture du site (plus de rechargement si des règles arrivent pendant qu'on est dessus).
  - Pastille Instagram **désactivée par défaut** (Réglages → Messages Instagram), PRIVACY.md et textes corrigés
    (l'app contactait Instagram à chaque accueil alors qu'elle disait « ne contacte personne »).
  - Notifications : vérifie que l'actualisation en arrière-plan est permise ; chiffre de l'icône mis à jour app
    ouverte. `expo-background-fetch` est déprécié par Expo : migration vers `expo-background-task` NON faite.
  - Stories exclues du blocage de glissement ; le
    glissement horizontal sur une vidéo n'est plus bloqué.
  - Accessibilité : cartes de l'accueil lues en entier, interrupteurs lus une fois, bandeau annoncé par VoiceOver,
    pages de présentation qui défilent en très grand texte.
  - `npm run test:inject` échoue désormais sans Playwright (sauf `SANS_NAVIGATEUR=1`).
  - Non corrigé (choix de l'utilisateur ou hors code) : icônes ressemblant aux logos, protection de `main` + 2FA,
    vulnérabilités npm (outils de dev ; ne JAMAIS lancer `npm audit fix --force`).

## À faire (par ordre)
0. Protéger `main` (règle de branche) et activer la 2FA GitHub : les règles de `main` tournent chez tout le monde.
   Fait. Build 5 (corrections de l'audit) fabriqué et envoyé. Ensuite : build 6 (onglets retirés + fluidité) ;
   vérifier sur iPhone : défilement fluide, Explore et accueil sans rechargement, connexion YouTube (Google) et
   Facebook toujours dans l'app, liens externes dans Safari.
1. Retours de test du build 5 (utilisateur et sa sœur) : tuto,
   Reel en DM bloqué, fil Abonnements, pubs masquées, pastille (endpoint Instagram non officiel), notifications,
   connexion Facebook (vérification robot : capture toujours demandée si ça bloque encore).
2. Finir l'invitation TestFlight de la sœur (lien public après la revue bêta) ; si Apple refuse à cause des icônes
   ressemblant aux logos, les remplacer.
3. Comparer notre accueil Instagram à celui de SocialLite (« plus centré ») : capture demandée.
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
