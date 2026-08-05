import React from 'react';

import SubscribersListViewClient from './SubscribersListView.client';
import AccesReserve, { estAdministratrice } from './AccesReserve';

export default async function SubscribersListView(): Promise<React.ReactElement> {
  if (!(await estAdministratrice())) return <AccesReserve titre="Abonné·es" />;

  return <SubscribersListViewClient />;
}
