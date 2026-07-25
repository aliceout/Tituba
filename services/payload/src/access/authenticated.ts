import type { Access } from 'payload';

/**
 * Helper d'access control : autorise toute requête authentifiée.
 *
 * En théorie c'est le default Payload pour les collections sans `access`
 * explicite, mais on l'a vu en prod 3.84 : sans déclaration explicite
 * des verbs (create/update/delete), des PATCH renvoient 403 avec « You
 * are not allowed to perform this action ». Mieux vaut être explicite.
 *
 * NB : on garde volontairement `Boolean(user)` au lieu d'un check par
 * rôle (cf isEditorOrAbove). Le check par rôle dépendait de
 * `req.user.role` qui n'est pas toujours hydraté dans tous les
 * contextes Payload 3.84 (server actions Next, certaines internals
 * payload-preferences) → 403. Tout user authentifié dans le système
 * a au moins le rôle editor, donc Boolean(user) est sémantiquement
 * équivalent au check de rôle pour les collections de contenu.
 */
export const authenticated: Access = ({ req: { user } }) => Boolean(user);
