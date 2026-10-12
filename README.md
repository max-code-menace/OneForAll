# Sans Reels

Une app iPhone perso qui ouvre **Instagram** et **YouTube** sans **Reels, Shorts ni Explore**,
et qui bloque **TikTok**. Les DMs, profils, la recherche et la publication marchent normalement.

Elle affiche le site web mobile dans une WebView et y injecte du CSS + JavaScript qui masque
le contenu addictif (et recommence à chaque scroll grâce à un `MutationObserver`).

## Structure

```
src/
  app/                    écrans (Expo Router)
    index.tsx             accueil : 3 boutons
    browser/[platform].tsx  le site dans une WebView (ou l'écran « bloqué »)
    settings.tsx          un interrupteur par règle
  rules/                  ⬅️ LES RÈGLES, à modifier quand Instagram change son HTML
    instagram.ts
    youtube.ts
    tiktok.ts
    types.ts              explication de chaque champ
  lib/
    buildInjection.ts     transforme les règles en script injecté dans la page
    urlRules.ts           bloque / redirige les URLs avant chargement
    settings.tsx          sauvegarde des réglages
  components/             WebView, écran « bloqué »
scripts/test-injection.cjs  test du script injecté dans Chromium
```

**Un Reel réapparaît ?** Ouvre le fichier de la plateforme dans `src/rules/`, ajoute un
sélecteur CSS (`css`) ou une règle `hide` (masque un élément, ou son ancêtre avec `closest`).
Les commentaires de `types.ts` expliquent chaque champ.

## 1. Tester sur ton ordinateur / ton iPhone (gratuit)

```bash
npm install
npx expo start
```

- **iPhone** : installe **Expo Go** (App Store), scanne le QR code affiché avec l'appareil photo.
  Le PC et l'iPhone doivent être sur le même Wi-Fi (sinon : `npx expo start --tunnel`).
  Tout fonctionne dans Expo Go, y compris les WebViews filtrées.
- **Navigateur** : appuie sur `w`. Seuls l'accueil, les réglages et l'écran TikTok
  s'affichent (une WebView ne peut pas tourner dans un navigateur).

Vérifications : `npm run typecheck` et `npm run test:inject` (ce test demande Playwright).

## 2. Installer la vraie app sur l'iPhone (EAS Build, sans Mac)

### Ce qu'il te faut
- Un **compte Apple Developer payant** (99 €/an) : https://developer.apple.com/programs/
  (le compte gratuit ne permet pas l'installation « ad hoc »).
- Un **compte Expo** gratuit : https://expo.dev/signup

### Une seule fois

```bash
npm install -g eas-cli         # ou préfixe chaque commande par : npx eas-cli@latest
eas login                      # connexion à ton compte Expo
eas init                       # crée le projet sur expo.dev (ajoute un projectId dans app.json)
```

Change `ios.bundleIdentifier` dans `app.json` si tu veux (doit être unique, ex. `com.tonnom.sansreels`).

**Enregistrer ton iPhone** (Apple n'autorise une app ad hoc que sur les appareils déclarés) :

```bash
eas device:create
```

Choisis « Website », ouvre le lien / QR code **dans Safari sur l'iPhone**, installe le profil
proposé (Réglages → Profil téléchargé → Installer). EAS récupère l'identifiant (UDID) de l'iPhone.

### Construire et installer

```bash
eas build --platform ios --profile preview
```

- Réponds **oui** pour te connecter à ton compte Apple : EAS crée tout seul le certificat et le
  profil de provisionnement (avec ton iPhone dedans).
- Le build tourne dans le cloud (~10-20 min). À la fin, un lien et un QR code s'affichent
  (aussi sur https://expo.dev, rubrique Builds).
- Ouvre ce lien **dans Safari sur l'iPhone** → **Install**.
- iOS 16 et plus : active le **mode développeur** (Réglages → Confidentialité et sécurité →
  Mode développeur → redémarrer), sinon l'app ne s'ouvre pas.

### Plus tard
- **Nouvel iPhone** : `eas device:create`, puis relance `eas build --platform ios --profile preview`
  (accepte de régénérer le profil).
- **Modifier les règles sans recompiler** : possible avec `eas update` (à configurer), sinon
  refais simplement un build.
- Un build ad hoc expire au bout d'**un an** (durée du certificat) : il suffira d'en refaire un.

## Limites connues
- Instagram et YouTube changent leur HTML : certains sélecteurs devront être mis à jour.
- Connexion Google/YouTube : Google bloque parfois la connexion dans les WebViews. L'app se
  présente donc comme Safari (`userAgent` dans `src/rules/youtube.ts`), ce qui suffit en général.
- Usage personnel uniquement (pas destiné à l'App Store).
