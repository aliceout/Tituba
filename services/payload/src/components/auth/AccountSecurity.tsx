// Panneau Sécurité — rendu via un field type:'ui' sur la collection users.
// Visible uniquement sur le profil du user courant (cf. condition du
// field dans Users.ts).

import React from 'react';
import type { ServerProps } from 'payload';

import AccountSecurityClient from './AccountSecurity.client';

export default function AccountSecurity(props: ServerProps): React.ReactElement | null {
  if (!props.user) return null;
  return <AccountSecurityClient />;
}
