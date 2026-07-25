// Server component pour le bouton "Inviter" branché en
// `admin.components.beforeListTable` sur la collection users.
// Vérifie côté serveur que l'utilisateur peut inviter.

import React from 'react';
import type { ServerProps } from 'payload';

import InviteUserButtonClient from './InviteUserButton.client';

export default function InviteUserButton(props: ServerProps): React.ReactElement | null {
  const user = props.user as { role?: 'root' | 'admin' | 'editor' } | null | undefined;
  if (!user) return null;
  if (user.role !== 'admin' && user.role !== 'root') return null;
  // Seul le root peut inviter d'autres admins.
  return <InviteUserButtonClient canInviteAdmin={user.role === 'root'} />;
}
