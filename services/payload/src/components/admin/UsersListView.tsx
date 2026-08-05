import React from 'react';

import UsersListViewClient from './UsersListView.client';
import AccesReserve, { estAdministratrice } from './AccesReserve';

export default async function UsersListView(): Promise<React.ReactElement> {
  if (!(await estAdministratrice())) return <AccesReserve titre="Utilisateur·ices" />;

  return <UsersListViewClient />;
}
