// AccountView — wrapper server pour la page /cms/admin/account custom.
// Branché via payload.config admin.components.views.account.
//
// Remplace entièrement la vue native Payload du compte courant. Le
// fetch + dirty state + save sont côté client (cookies de session).

import React from 'react';

import AccountViewClient from './AccountView.client';

export default function AccountView(): React.ReactElement {
  return <AccountViewClient />;
}
