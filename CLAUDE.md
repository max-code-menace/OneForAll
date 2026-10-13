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
  Fonctionnement « Fluidité 3 » plus bas (traitement avant chaque image, pas de relecture inutile).
- `src/lib/rules.tsx` : fournisseur des règles (intégrées + téléchargées + cache + désactivable dans Réglages).
- `src/lib/settings.tsx` : interrupteurs par règle, mode diagnostic. `src/lib/urlRules.ts` : règles d'URL.
- `src/components/SiteWebView.tsx` : la WebView (iOS). `SiteWebView.web.tsx` : simple message pour le web.
- `src/components/SitesLayer.tsx` + `src/lib/openSites.tsx` : les réseaux, **par-dessus la pile d'écrans**
  (plus d'écran `browser/[platform]`). Chaque réseau ouvert reste en vie, caché quand on revient à l'accueil
  (voir « Fluidité 2 » plus bas). `src/lib/siteColor.ts` : couleur de la zone du haut, envoyée par la page.
- `src/app/` : écrans (accueil, réglages, à propos), Expo Router,
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
npm run bench:inject   # fluidité du script sur un faux fil Instagram (avec / sans script, CPU ÷4)
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
- PR 6 (« Fluidité 2 ») fusionnée le 12/10 : **build 6** à lancer par l'utilisateur (PR 5 + Fluidité 2).
- **App de test « OneForAll Test »** (mise en place après la PR 6, demande de l'utilisateur : tester plus vite
  qu'un build + TestFlight à chaque essai). `app.config.js` : avec `APP_VARIANT=test`, autre nom et autre
  identifiant (`com.maxcodemenace.oneforall.test`, installée à côté de la vraie), `expo-updates` activé (canal
  `test`, `runtimeVersion` = `TEST_RUNTIME` en clair, ex. `test-1`). Sans variable (vraie app) : `updates.enabled: false`, la
  vraie app ne contacte jamais Expo. Profil EAS `test` (distribution interne = iPhone enregistré par
  `eas device:create`). `.github/workflows/test-update.yml` : à chaque push sur `claude/**`, typecheck + tests,
  puis `eas update --channel test` (secret `EXPO_TOKEN` requis dans GitHub). `src/lib/testUpdates.ts` : l'app de
  test installe la nouvelle version au lancement et au retour dans l'app ; l'accueil affiche « Version de test du… ».
  ⚠️ Changement natif (module, autorisation, plugin, version d'Expo…) : **augmenter `TEST_RUNTIME`** dans
  app.config.js (`test-2`…) et faire refaire l'app de test. 1er essai (12/10) : 2 builds `test` échoués à l'étape
  EAS « Configure expo-updates » (« Unknown error », runtime `file:fingerprint`) avec la politique `fingerprint` ;
  remplacée par un numéro en clair (aucun calcul pendant le build). Cause exacte non vue (logs non fournis).
  La vraie app utilise `runtimeVersion` = `version` (1.0.0), mises à jour coupées.
  Étapes pour l'utilisateur : (1) `eas device:create` ; (2) créer un jeton sur expo.dev (Account settings →
  Access tokens) et le coller dans GitHub (secret `EXPO_TOKEN`) ; (3) `eas build --platform ios --profile test`.
  **Fait et utilisé par l'utilisateur (13/10)** : il teste les branches `claude/…` avec l'app de test.
  Règles dans l'app de test : jusqu'au 13/10, elle téléchargeait celles de `main`, qui REMPLAÇAIENT celles de la
  branche (une règle JSON modifiée n'arrivait pas avant fusion). Depuis : mise à jour des règles coupée par défaut
  dans l'app de test (`IS_TEST_APP` dans rules.tsx, réactivable dans ses Réglages) ; la vraie app ne change pas.
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
- **Fluidité 2** (demande de l'utilisateur avant le build 6 ; pas encore buildé ; testé seulement sur fausses pages
  Chromium et dans la version web de l'app, où les sites ne sont qu'un message) :
  - Réseaux **gardés ouverts** : revenir à l'accueil cache le réseau sans le fermer ; rouvrir = instantané, même
    endroit. Caché : hors écran, opacité 0, sans appuis ni VoiceOver ; la page reçoit `__ONEFORALL_HIDDEN__(true)`
    (`PAGE_HIDDEN_SCRIPT` : `visibilityState`/`hidden`/`hasFocus` faussés + `visibilitychange`/`blur`, vidéos en
    pause, toute lecture arrêtée). But supposé : veille du site, pas de « Vu » sur un message arrivé en notre absence.
    Pas de `display: none` (risque que la vue native soit détruite avec la nouvelle architecture).
  - Page tuée par iOS (`onContentProcessDidTerminate`) : rechargée (tout de suite si affichée, sinon au retour) ;
    avant, page blanche. Règles changées : rechargement en arrière-plan quand le réseau est caché.
  - **Préparation au lancement** du dernier réseau utilisé (`oneforall:last-site:v1`), après l'animation et la mise
    à jour des règles (≤ 3 s). Réglages → Rapidité, activé par défaut (choix de l'utilisateur).
  - Bandeau « Reels masqués » à la 1re apparition seulement (choix de l'utilisateur). Temps du jour compté seulement
    quand le réseau est affiché.
  - Lancement : 0,4 s au lieu de 2,65 s quand la présentation a déjà été vue (animation complète au 1er lancement).
    Non fait : écran de démarrage natif sombre en mode sombre (il est beige, `splash-icon.png` est transparent) ;
    le module de config n'a pas pu être vérifié dans la session.
  - Script : nettoyage limité aux éléments ajoutés (page entière ≤ 1 fois / 2 s) : 851 → 93 ms de travail pendant
    3 s de défilement sur une fausse page de 400 publications. Mesures des vidéos dans `requestAnimationFrame`.
    Redirection après la navigation du site (micro-tâche, avant : pendant). Instagram démarre directement sur
    `/?variant=following` (adresse de départ déjà redirigée).
  - Zone du haut de la couleur du site (`theme-color` ou fond de la page, message `theme`, réduit à 3 nombres).
  - `allowsLinkPreview={false}` (pas d'aperçu Safari à l'appui long) ; `mediaPlaybackRequiresUserAction={false}` :
    vidéos en lecture auto sans le son, **choix de l'utilisateur** (avant : aucune lecture auto).
  - **Diagnostic** : compteur de chargements complets + cause du dernier (ouverture, rechargement, lien, redirection
    OneForAll, redirection au chargement, redirection douce ratée, page fermée par iOS, règles changées).
    C'est l'outil pour trouver ce qui recharge encore : demander à l'utilisateur ce qu'il affiche.
  - Déconseillé et non fait : service workers (« App-Bound Domains », 10 domaines max, connexion Google/Facebook
    en risque), toucher aux cookies partagés ou au cache.
  - Un test de glissement (`assert.ok`) a échoué une fois juste après un banc d'essai, puis 16 passages réussis :
    probablement sensible à la charge de la machine, à surveiller.
- **Fluidité 3 : Instagram « sans accrochage »** (demande de l'utilisateur, 13/10 ; pas encore buildé ; mesuré
  seulement sur un faux fil dans Chromium, `npm run bench:inject`, jamais sur le vrai Instagram ni sur iPhone) :
  - **Élan du défilement** : `decelerationRate="normal"` sur la WebView. Trouvé dans react-native-webview 13.16.1 :
    avec la nouvelle architecture (RNCWebView.mm), la valeur par défaut reste 0 et `scrollViewWillBeginDragging`
    l'applique à chaque début de glissement (l'ancienne architecture mettait « normal »). Effet réel sur iPhone NON
    vérifié (supposé : la page s'arrête net quand on lâche le doigt). Piste n°1 si l'utilisateur dit que ça accroche.
  - Changements de la page traités **juste avant l'image suivante** (requestAnimationFrame, minuteur de secours
    250 ms) au lieu de 120 ms après : un Reel ou une pub du fil ne s'affiche plus du tout (faux fil : 156 → ~5
    images « flash »). Une seule fonction par image (`onFrame`) : d'abord masquer, puis mesurer (vidéos, fin du fil,
    couleur), mesures ≤ 4/s.
  - L'observateur suit aussi les textes (`characterData`) et les `href` changés : plus de relecture complète toutes
    les 2 s. Relecture complète seulement au chargement (`deep`) ; à un changement de page, contrôle 1,5 s plus tard
    qui saute les éléments déjà examinés (`__sansReelsSeen`). Changement de page : 36–60 → 4–8 ms (CPU ÷4).
  - `pushState`/`replaceState` **sans changement d'adresse** ignorés (un site qui retient la position de défilement
    faisait tout relire à chaque appel : 3 267 → 48 ms de script sur le faux fil, tâches de 74 ms supprimées).
    Instagram le fait-il ? Non vérifié.
  - Barre d'onglets : les 3 sélecteurs CSS `:has()` (case du Reels) remplacés par le champ de règle `cell`
    (`cellOf` : remonte ≤ 3 niveaux div/span/li tant qu’il n’y a pas d’autre lien) : surcoût de recalcul de style
    ≈ +60 % → +15 à 30 %.
    ⚠️ Les builds ≤ 6 ignorent `cell` : le trou entre Recherche et Messages y revient (affichage seulement).
  - Vidéo « plein écran » (blocage du glissement) : format portrait exigé (hauteur ≥ 1,3 × largeur), sinon une
    vidéo 4:5 du fil bloquait le défilement sur un petit écran (iPhone SE). Mesure aussi au démarrage d'une vidéo
    (`play`) et 1 fois/s s'il y a des vidéos.
  - Loupe touchée alors qu'on est déjà sur la recherche : remonte en haut au lieu d'empiler la page (2 retours).
  - Corrigé en passant : la regex « fond transparent » de `reportTheme` était cassée (barres obliques du gabarit).
  - Retour de l'utilisateur (app de test, 13/10) : « je sens une amélioration ».
- **Fil : grand vide sous la dernière photo** (captures de l'utilisateur, app de test, 13/10 : après la dernière
  photo, du blanc sur une très longue page, sans carte « Tu as tout vu » ; en-tête « Pour vous ⌄ »). Analyse par
  agents (recherche sur GitHub + faux fils virtualisés `scripts/fake-feed.cjs`) :
  - Cause (établie par plusieurs projets indépendants de 2026, dont NoReel, une WebView Android comme nous ; jamais
    observée directement sur le vrai site) : le fil d'Instagram est **virtualisé**. Seules les publications proches
    de l'écran sont dans la page, et il réserve la place des autres d'après leur hauteur mesurée. Le script masquait
    les Reels APRÈS cette mesure (useLayoutEffect) : leur place restait, d'où le vide. Les `<article>` sont aussi
    **réutilisés** pour d'autres publications pendant le défilement.
  - Correctifs (non buildés ; testés sur faux fils Chromium seulement) :
    1. CSS `article:has(a[href*="/reel/"]) { display: none !important; }` dans ig.feedReels : masqué dès le 1er
       calcul, avant la mesure. Faux fils V1 (espaceurs) et V2 (positions absolues) : vide de 23 000 à 29 700 px
       ramené à 0 ; en V1, les photos qui suivent une série de Reels redeviennent visibles. Sans effet si Instagram
       tire les hauteurs de ses données (V4) : alors seule la carte « vide » aide. Accepté par tous les anciens
       validateurs. Coût mesuré : style −9 à −11 % (le contenu d'un Reel n'est plus calculé du tout).
       ⚠️ Effet secondaire possible : le bas du fil restant proche, Instagram peut charger page après page sans
       arrêt (faux fil sans fin : 9-10 chargements en 3 s immobile). À surveiller : chaleur, data.
    2. Moteur : `recheck()` réaffiche un élément masqué dont le contenu a changé quand plus aucune règle ne le vise
       et qu'il contient au moins un lien (une case vidée avant d'être remplie reste masquée).
    3. Carte de fin réécrite (`feedState`) : l'ancienne condition (≥ 12 masquées après la dernière visible) ne
       s'affichait JAMAIS sur un fil virtualisé (0 sur 57 essais). États « fin » (≥ 3 masquées après la dernière
       visible et bas de page atteint ou dernière visible passée) et « vide » (défilé, rien de visible à l'écran) ;
       doit durer 0,5 s ; bandeau compact en bas (au-dessus de la barre d'onglets, à gauche du bouton rond).
    4. **« Pour vous » au lieu d'Abonnements** : la navigation douce (`softGo`) changeait l'adresse en
       `?variant=following` sans changer le fil (hypothèse forte, cohérente avec la capture ; les autres outils —
       noslop, IG-Clean, IGPlus — font tous un vrai chargement). Nouveau champ de règle `reload` (vrai chargement,
       ignoré par les anciens builds) sur ig.followingFeed + lien `a[href="/"]` réécrit vers `/?variant=following`.
       Conséquence : toucher Accueil depuis une autre page recharge le fil (1-2 s) ; déjà sur le fil : remonte en haut.
       Compteur Diagnostic : cause « redirection OneForAll ».
  - Pistes non faites : remplacer `display:none` par une boîte de 0 px mesurable (NoReel, No-Reel Safari, ReelLess
    le font pour ne pas dérégler le chargement d'Instagram ; risque : publication de 0 px « visible » pour Instagram,
    lecture auto, adresse qui passe à /reel/) ; supprimer l'espaceur `div:has(> article){padding-bottom:0}`
    (unleash-focus, ordinateur) ; filtrer les données JSON avant React (IG-Clean ; champ « Reel » inconnu).
  - Bandeau « Utiliser l'application » (visible sur les captures) : aucun sélecteur fiable connu ; les autres outils
    cherchent le texte puis remontent à l'ancêtre `position: fixed` (6 niveaux). Non fait (non demandé).
  - Sources (copies locales seulement pendant la session) : Kalbra/NoReel PR #51, SHADOWDANCH/instagram-noslop,
    InfectedDuck/ReelLess, Guillaume351/No-Reel-For-Instagram-Safari, blobspire/insta-filter, AtleyMa/focus,
    LukasWestholt/instagram-distraction-free-js, AyushUnleashed/unleash-focus, lpedenon/no-brainrot, gerwld/igplus.
- Idées proposées, non demandées : masquer la bannière « Utiliser l'application » d'Instagram (captures demandées
  à l'utilisateur pour viser juste ; règle JSON compatible avec les anciens builds), masquer les publicités vidéo.
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
   Fait. Build 5 (corrections de l'audit) fabriqué et envoyé. Ensuite : build 6 (onglets retirés + fluidité +
   Fluidité 2) ; vérifier sur iPhone : réseau retrouvé au même endroit après l'accueil, préparation au lancement,
   lancement court, zone du haut colorée, défilement fluide, compteur du Diagnostic (Explore et accueil sans
   rechargement ?), vidéos en pause quand le réseau est caché, batterie et chaleur avec 3 réseaux ouverts,
   connexion YouTube (Google) et Facebook toujours dans l'app, liens externes dans Safari.
   Avec Fluidité 3 (même build, ou app de test) : élan du défilement d'Instagram (la page continue de glisser ?),
   aucun Reel visible même un instant dans le fil, barre d'onglets sans trou, Reel en DM toujours bloqué au glissement.
   Fil (13/10, app de test) : plus de vide sous la dernière photo ? carte « Tu as tout vu » en bas ? en-tête
   « Abonnements » (plus « Pour vous ») après Accueil ? aucune photo qui disparaît ? chaleur/data en bas du fil.
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
