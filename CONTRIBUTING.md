# Contribuer à OneForAll

Merci ! Le plus utile : **réparer une règle cassée**. Instagram et YouTube changent souvent leur HTML.

## Corriger ou ajouter une règle

1. Ouvre le fichier de la plateforme : `src/rules/instagram.json` ou `src/rules/youtube.json`.
2. Chaque règle correspond à un interrupteur dans les Réglages. Les champs sont expliqués
   dans `src/rules/types.ts` (dans le JSON, `css` est une liste de lignes) :
   - `css` : masque directement des éléments ;
   - `hide` : masque des éléments (ou leur ancêtre `closest`, ou selon leur texte) ;
   - `rewriteLinks` : change la destination d'un lien ;
   - `urls` : redirige ou bloque une adresse.
3. Préfère les sélecteurs basés sur les liens (`a[href*="/reel/"]`) plutôt que sur les classes
   CSS, qui changent souvent.
4. Dans ta proposition, indique **quel élément était visible** et **sur quelle page**.
5. Ces fichiers sont **téléchargés par l'app de tout le monde** dès qu'ils sont sur `main` :
   chaque changement est relu avant d'être accepté. Le format est vérifié automatiquement
   (`src/rules/validate.ts`) : pas de code, pas de `url(...)` dans le CSS, redirections
   uniquement vers des chemins du même site (`/…`).

## Vérifier avant de proposer

```bash
npm install
npm run typecheck
npm run test:inject   # nécessite Playwright
```

Si tu ajoutes une règle, ajoute aussi un cas dans `scripts/test-injection.cjs`.

## Règles du projet

- Aucune collecte de données, aucun traceur, aucune publicité : une contribution qui en ajoute sera refusée.
- Les règles restent **déclaratives** (sélecteurs, textes, expressions régulières), sans code arbitraire.
- En contribuant, tu acceptes que ton travail soit publié sous licence [MPL-2.0](LICENSE).
