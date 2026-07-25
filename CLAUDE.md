# Instructions de collaboration — Carnet

## Règle absolue : pas de push sans demande explicite

**Interdiction absolue de `git push` (et `gh pr` qui pousse) tant que
l'utilisatrice ne l'a pas demandé explicitement par écrit dans la
conversation en cours.**

- « commit » seul ≠ autorisation de push.
- Une autorisation passée (« push ce truc-là ») n'est valable QUE pour
  ce push-là. Pas de transitivité, pas d'implicite.
- En cas de doute → demander avant. Le coût d'attendre une confirmation
  est faible, le coût d'un push non voulu (CI qui tourne, deploy auto
  qui déclenche, images Docker rebuild, schéma DB modifié en prod) est
  élevé.
- S'applique aussi à `git push --force`, `gh pr create`, `gh pr merge`,
  et tout commande qui propage du code vers un remote.

`git commit` local en revanche est OK quand l'utilisatrice le demande.

### Proposer un numéro de version à chaque demande de push

Quand l'utilisatrice demande un push (ou qu'on propose un push à
valider), **toujours proposer un numéro de version semver** dans la
même phrase, en suivant l'historique des tags :

- Patch (`vX.Y.Z+1`) : fix CI, hotfix d'un build cassé, correction
  cosmétique, typo. Pas de changement de fonctionnalité ni de schéma.
- Mineur (`vX.Y+1.0`) : nouvelle feature opt-in, ajout de champs au
  schéma sans drop, nouveau global ou collection.
- Majeur (`vX+1.0.0`) : breaking change UX/admin, refonte d'une
  surface publique, suppression de routes ou de fields existants.

Format proposé : « tu push ? je tag `vA.B.C` (patch — fix CI) ? ».
L'utilisatrice peut bumper différemment ou refuser le tag.

## Autres conventions de travail

- **Code 100 %** : c'est Claude qui écrit, pas l'utilisatrice. Mais
  valider les choix structurels (architecture, schéma DB, refactor
  multi-fichiers) avant de coder.
- **Pas de Sveltia** : on reste sur Payload CMS.
- **Vouvoiement systématique** dans tous les textes UI/UX (placeholders,
  hints, lede, descriptions, mails). Jamais de tutoiement.
- **Issues GitHub** pour les reports de bug / features à venir — le
  workflow standard.
- **Formulation inclusive** dans les libellés rôles + collections
  utilisateur·ices (« éditeur·ice », « Utilisateur·ices », etc.).

## Stack & contraintes techniques

- Astro 6 SSR + Payload v3 (Next.js 16, Lexical) + Postgres 16
- pnpm 10, Node 22+, Docker pour la prod
- Pas de pnpm workspaces : `services/payload` a son propre package.json
  et lockfile → install séparé requis (la CI a une étape dédiée).
- Pre-commit hook husky : auto-génère les migrations Payload SQL sur
  toute modif de schéma (cf `.husky/pre-commit`). Si husky pas
  installé localement (`pnpm install` à la racine doit l'avoir fait
  via le hook `prepare`), le hook ne se déclenche pas → penser à
  `payload migrate:create` à la main avant un push qui touche au
  schéma.
- Convention version : `git describe --tags --abbrev=0` côté CI → la
  version affichée dans Payload (footer sidebar) reste celle du tag
  Git le plus récent. Tag manuel à chaque release significative.
