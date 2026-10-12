# Politique de confidentialité

**En bref : OneForAll ne collecte, n'envoie et ne vend aucune donnée.**

## Ce que fait l'app
- Elle n'a **ni compte, ni serveur, ni statistiques, ni publicité, ni outil de suivi**.
- Tes réglages (quelles règles sont actives) sont enregistrés **uniquement sur ton téléphone**.
- Elle ne lit ni tes messages, ni tes mots de passe, ni ton contenu. Le script qu'elle ajoute aux
  pages ne fait que masquer des éléments et rediriger des liens. Il est lisible dans `src/lib/buildInjection.ts`
  et `src/rules/`.

## Ce que font les sites que tu ouvres
Instagram, YouTube et les autres sites s'affichent dans l'app comme dans un navigateur.
**Ils reçoivent donc les mêmes informations que d'habitude** (ton compte, ton adresse IP, tes
activités sur leur site) et appliquent leurs propres politiques de confidentialité. OneForAll
ne peut pas l'empêcher. Tes connexions (cookies) sont conservées sur ton téléphone, par iOS,
pour que tu restes connecté.

## Vérifier par toi-même
Tout le code est public. Si une version future changeait ces engagements, ce fichier serait
modifié en même temps, et l'historique de ces modifications est visible sur GitHub.
