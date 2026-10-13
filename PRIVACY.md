# Politique de confidentialité

**En bref : OneForAll ne collecte, n'envoie et ne vend aucune donnée te concernant.**

## Ce que fait l'app
- Elle n'a **ni compte, ni serveur à elle, ni statistiques, ni publicité, ni outil de suivi**.
- Tes réglages (quelles règles sont actives) sont enregistrés **uniquement sur ton téléphone**.
- Le temps passé aujourd'hui sur chaque réseau (affiché sur l'accueil) est compté et gardé
  **uniquement sur ton téléphone**, puis remis à zéro chaque jour. Il n'est envoyé nulle part.
- Elle ne lit ni tes messages, ni tes mots de passe, ni ton contenu. Le script qu'elle ajoute aux
  pages masque des éléments, redirige des liens et empêche de glisser vers d'autres Reels. Il lit aussi l'adresse de la page et le nombre de messages
  non lus affiché dans son titre (« (3) Instagram ») ; ces informations restent sur ton téléphone.
  Il est lisible dans `src/lib/buildInjection.ts` et `src/rules/`.
- En mode Diagnostic (désactivé par défaut), le bouton « Relevé » lit la **forme** de la page affichée
  (tailles, positions, type de chaque case), sans texte, sans nom de compte et sans lien, et ouvre la
  feuille de partage d'iOS. Il ne quitte ton téléphone **que si tu choisis toi-même** où l'envoyer.

## Les connexions que fait l'app elle-même
Il y en a deux, et aucune ne passe par un serveur à nous : les règles (ci-dessous, activé par
défaut) et le nombre de messages Instagram non lus (section suivante, **désactivé par défaut**).

### Les règles
Quand tu ouvres l'app, elle télécharge 3 petits fichiers publics (`src/rules/*.json` de ce dépôt,
sur `raw.githubusercontent.com`) pour récupérer d'éventuelles corrections des règles.

- **Aucune donnée n'est envoyée** : c'est une simple requête de téléchargement, sans identifiant,
  sans compte, sans contenu de ton téléphone.
- Comme pour n'importe quelle page web, **GitHub voit ton adresse IP** à ce moment-là et applique
  sa propre politique de confidentialité.
- Ces fichiers sont **vérifiés strictement** avant usage (`src/rules/validate.ts`) : ils ne peuvent
  contenir ni code, ni HTML, ni CSS qui charge une adresse, ni redirection vers un autre site. S'ils sont
  invalides ou inaccessibles, l'app garde ses règles précédentes ou intégrées.
- **Tu peux couper ça** : Réglages → « Mettre à jour automatiquement ». L'app n'utilise alors que
  ses règles intégrées et ne contacte plus GitHub.

### Messages non lus Instagram (pastille et notifications) : désactivé par défaut
Si tu actives Réglages → Messages Instagram → « Pastille des messages non lus », **ton téléphone
demande lui-même à Instagram** combien de conversations sont non lues, chaque fois que l'accueil
s'affiche. Si tu actives « Notifications », il le demande aussi de temps en temps en arrière-plan
(quand iOS le permet).

- La requête part **directement de ton téléphone vers instagram.com**, avec ta connexion déjà
  enregistrée sur le téléphone, comme quand tu ouvres le site. **Aucun serveur de OneForAll** n'est
  utilisé, et ta connexion ne quitte jamais ton téléphone.
- Seul le nombre de messages non lus est lu et gardé sur le téléphone. Le contenu des messages
  n'est jamais lu.
- Comme pour toute visite du site, **Instagram voit ces demandes** : il sait donc quand tu ouvres
  l'accueil de OneForAll (pastille) ou quand iOS réveille l'app (notifications). L'adresse utilisée
  n'est pas officielle : Instagram pourrait prendre ces demandes automatiques pour un robot.
- Les deux sont **désactivés par défaut** et se coupent dans les Réglages.

## Ce que font les sites que tu ouvres
Instagram, YouTube et Facebook (et leurs pages de connexion) s'affichent dans l'app comme dans un
navigateur. Les liens vers les autres sites s'ouvrent dans Safari.
**Ils reçoivent donc les mêmes informations que d'habitude** (ton compte, ton adresse IP, tes
activités sur leur site) et appliquent leurs propres politiques de confidentialité. OneForAll
ne peut pas l'empêcher. Tes connexions (cookies) sont conservées sur ton téléphone, par iOS,
pour que tu restes connecté.

## Vérifier par toi-même
Tout le code est public. Si une version future changeait ces engagements, ce fichier serait
modifié en même temps, et l'historique de ces modifications est visible sur GitHub.
