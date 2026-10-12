# OneForAll

**Les réseaux sociaux, sans le contenu fait pour te rendre accro.**

OneForAll est une app iPhone gratuite et open source. Elle ouvre Instagram, YouTube et Facebook
et en retire les **Reels, les Shorts et Explore**. Tu gardes ce qui compte : tes messages, les
profils, la recherche et la publication. **TikTok est banni** : il ne contient que de la vidéo courte à
défilement infini, donc l'app refuse d'ouvrir ses liens, d'où qu'ils viennent.

> Un pour tous : un outil gratuit, que chacun peut vérifier, utiliser et améliorer.

## Nos engagements

- **Gratuit.** Pas de pub, pas d'abonnement, pas de fonctions payantes.
- **Open source.** Tout le code est ici, sous licence [MPL-2.0](LICENSE). Tu peux le lire,
  le modifier, le partager. Si tu modifies un fichier et le distribues, tu partages ta modification.
- **Aucune collecte de données.** Pas de compte, pas de serveur, pas de statistiques.
  Voir [PRIVACY.md](PRIVACY.md).
- **Transparent.** Ce que l'app change dans les pages tient dans quelques fichiers lisibles :
  [`src/rules/`](src/rules).
- **Dons libres.** Voir ci-dessous. Jamais obligatoires, jamais dans l'app.

## Ce que l'app fait (et ne fait pas)

| | |
|---|---|
| ✅ | Masque les Reels, les Shorts, Explore. Redirige `/reels/` et `/shorts/…`. |
| ✅ | Garde DMs, profils, recherche, publication. |
| ✅ | Instagram : fil « Abonnements » (les gens que tu suis), publicités et suggestions masquées. |
| ✅ | Un Reel reçu en message s'ouvre, mais on ne peut pas glisser vers les suivants. |
| ✅ | Temps passé aujourd'hui sur chaque réseau, compté uniquement sur ton téléphone. |
| ✅ | Pastille des messages Instagram non lus, et notifications (en option, désactivées par défaut, avec du retard), sans aucun serveur. |
| ✅ | Les liens vers d'autres sites s'ouvrent dans Safari (avec leur vraie adresse). |
| ✅ | Chaque règle s'active ou se désactive dans **Réglages**. |
| ✅ | Bloque les liens TikTok (interdiction codée dans l'app, qu'une mise à jour de règles ne peut pas lever). |
| ⚠️ | **N'est pas affiliée** à Instagram, Facebook (Meta), YouTube (Google) ni TikTok. |
| ⚠️ | Elle affiche leurs sites web en modifiant l'affichage. Cela peut ne pas respecter leurs conditions d'utilisation. Nous n'avons connaissance d'aucune sanction pour cet usage, mais nous ne pouvons pas le garantir. |
| ⚠️ | Quand un site change son HTML, une règle peut cesser de fonctionner jusqu'à sa mise à jour. |
| ✅ | Les règles corrigées arrivent **sans réinstaller l'app** (voir ci-dessous). |

## Mises à jour des règles sans réinstaller

Instagram, YouTube et Facebook changent souvent leur HTML. Les règles sont donc de simples fichiers
JSON publics ([`src/rules/`](src/rules)) que l'app télécharge au lancement :

- une correction fusionnée sur `main` atteint tout le monde en quelques minutes ;
- le téléchargement n'envoie **aucune donnée** (GitHub voit seulement ton adresse IP) ;
- le contenu est **vérifié strictement** avant d'être utilisé : pas de code, pas de HTML, pas de CSS qui
  charge une adresse, pas de redirection vers un autre site (revérifiée par le moteur après remplacement) ;
- hors ligne ou fichier invalide : l'app garde ses règles précédentes ou intégrées ;
- **désactivable** dans Réglages → « Mettre à jour automatiquement ».

Conséquence à connaître : les règles qui tournent chez tout le monde sont celles de la branche
`main`. Les changements y sont donc relus avant d'être acceptés.

## Soutenir le projet

L'app sera toujours gratuite. Si tu veux aider, un don, même minuscule, couvre les frais
(compte développeur Apple : 99 €/an) et le temps passé. *(Lien de don : bientôt.)*

Autres façons d'aider : parler du projet, signaler une règle cassée, corriger un sélecteur
([CONTRIBUTING.md](CONTRIBUTING.md)).

## Installer l'app

L'app n'est pas (encore) sur l'App Store. Les étapes pour l'installer sur un iPhone sont plus bas.

### Tester vite et gratuitement (Expo Go)

```bash
npm install
npx expo start
```

Installe **Expo Go** sur l'iPhone et scanne le QR code (même Wi-Fi, sinon `npx expo start --tunnel`).
Dans un navigateur (touche `w`), seuls l'accueil et les réglages s'affichent : une WebView
ne tourne que sur le téléphone.

### Installer la vraie app (EAS Build, sans Mac)

Il te faut un **compte Apple Developer** (99 €/an) et un compte [Expo](https://expo.dev/signup) gratuit.

```bash
npm install -g eas-cli
eas login
eas init
eas device:create                           # ouvre le lien dans Safari sur l'iPhone
eas build --platform ios --profile preview
```

Ouvre le lien du build **dans Safari sur l'iPhone** → **Installer**. Sur iOS 16+, active
Réglages → Confidentialité et sécurité → **Mode développeur**.

Cette méthode « ad hoc » demande d'enregistrer chaque iPhone à l'avance (100 appareils
maximum par an) et expire après un an. Pour partager avec plus de monde, la piste suivante est
**TestFlight** (voir la feuille de route).

## Structure

```
src/
  app/          écrans : accueil, site (WebView), réglages
  rules/        ⬅️ les règles par plateforme en JSON (instagram.json, youtube.json…)
                et validate.ts, qui vérifie les fichiers avant usage
  lib/          moteur d'injection, règles d'URL, mise à jour des règles, réglages
  components/   WebView, écran « bloqué »
scripts/test-injection.cjs   test du moteur dans Chromium (npm run test:inject)
```

Vérifications : `npm run typecheck` et `npm run test:inject` (nécessite Playwright).

## Feuille de route

- [x] Règles mises à jour à distance (corriger sans réinstaller)
- [ ] Distribution via TestFlight
- [ ] Version Android
- [ ] Lien de don

## Licence

[MPL-2.0](LICENSE).
