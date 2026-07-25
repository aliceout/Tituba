'use client';

// Header custom pour /cms/admin/account et pour /cms/admin/collections/
// users/[id]. Affiche crumbs « Carnet / Mon compte » (ou « Carnet /
// Utilisateurs / [email] » si on édite un autre user).
//
// Branché via Users.admin.components.edit.beforeDocumentControls.

import React from 'react';
import { useDocumentInfo } from '@payloadcms/ui';

export default function AccountEditHeader(): React.ReactElement {
  const info = useDocumentInfo();
  const data = (info as { savedDocumentData?: Record<string, unknown> }).savedDocumentData ?? {};
  const email = (data.email as string | undefined) ?? '';
  const role = (data.role as string | undefined) ?? '';

  // Si on est sur /admin/account (édition de soi-même), Payload route
  // automatiquement vers /admin/collections/users/<own-id> en interne.
  // On affiche un crumb adapté au contexte par défaut. Le path exact
  // n'est pas trivial à détecter côté client sans hook supplémentaire,
  // donc on rend toujours « Carnet / Utilisateurs / [email] ».
  const isAccountPage =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/cms/admin/account');

  return (
    <div className="carnet-doc-header">
      <div className="carnet-doc-header__crumbs">
        <a href="/cms/admin">Carnet</a>
        <span className="sep" aria-hidden="true">
          /
        </span>
        {isAccountPage ? (
          <span className="carnet-doc-header__current">Mon compte</span>
        ) : (
          <>
            <a href="/cms/admin/collections/users">Utilisateurs</a>
            <span className="sep" aria-hidden="true">
              /
            </span>
            <span className="carnet-doc-header__current">{email || '—'}</span>
          </>
        )}
      </div>
      {role && (
        <span className={`carnet-role carnet-role--${role}`}>
          {role === 'root' ? 'Root' : role === 'admin' ? 'Admin' : 'Éditeur·ice'}
        </span>
      )}
    </div>
  );
}
