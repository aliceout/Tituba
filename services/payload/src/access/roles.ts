// Helpers d'access control par rôle.
//
// Trois rôles :
//   - root   : exactement 1 user. Non rétrogradable, non supprimable.
//              Peut tout faire (incluant gérer les autres admins).
//   - admin  : peut éditer le contenu + inviter/gérer les editor.
//              Ne peut pas toucher au compte root, ni rétrograder un
//              autre admin (seul le root peut).
//   - editor : peut éditer le contenu (pages, actus, événements, etc.).
//              Pas d'accès à la gestion des comptes.
//
// Les non-authentifiés peuvent lire le contenu publié (read: () => true
// sur les collections de contenu) — c'est ce qui permet à Astro SSR de
// fetch le CMS sans token.

import type { Access, AccessArgs, FieldAccess } from 'payload';

export type UserRole = 'root' | 'admin' | 'editor';

type AuthedReq = AccessArgs['req'];

export function userRole(req: AuthedReq): UserRole | null {
  const user = req.user;
  if (!user) return null;
  const role = (user as { role?: string }).role;
  if (role === 'root' || role === 'admin' || role === 'editor') return role;
  return null;
}

export const isAuthenticated: Access = ({ req }) => Boolean(req.user);

export const isRoot: Access = ({ req }) => userRole(req) === 'root';

export const isAdminOrRoot: Access = ({ req }) => {
  const role = userRole(req);
  return role === 'admin' || role === 'root';
};

export const isEditorOrAbove: Access = ({ req }) => {
  const role = userRole(req);
  return role === 'editor' || role === 'admin' || role === 'root';
};

// Lecture publique du contenu publié, écriture restreinte aux rôles
// autorisés à éditer le site.
export const contentAccess = {
  read: () => true,
  create: isEditorOrAbove,
  update: isEditorOrAbove,
  delete: isEditorOrAbove,
};

// Field-level access : un editor peut voir son propre profil mais ne
// peut pas modifier son rôle. Un admin peut modifier le rôle d'un
// editor mais pas d'un autre admin (seul le root peut). Le root a
// tous les droits.
export const canMutateRole: FieldAccess = ({ req, doc }) => {
  const actor = userRole(req);
  if (actor === 'root') return true;
  if (actor !== 'admin') return false;
  // L'admin ne peut modifier le rôle que d'un editor.
  const target = (doc as { role?: string } | undefined)?.role;
  return target === 'editor' || target === undefined;
};

// Field readable par soi-même ou par un admin/root. Utilisé pour les
// champs sensibles du profil (email, lastActivityAt, …) qu'on ne veut
// pas exposer dans la liste users à un editor.
export const isSelfOrAdmin: FieldAccess = ({ req, id }) => {
  const role = userRole(req);
  if (role === 'admin' || role === 'root') return true;
  if (!req.user || id === undefined) return false;
  // Coercion en string : ID peut venir en number (Postgres) ou string
  // (cas serialization) selon le contexte.
  return String(req.user.id) === String(id);
};
