import React from 'react';

import PagesListViewClient from './PagesListView.client';
import AccesReserve, { estAdministratrice } from './AccesReserve';

export default async function PagesListView(): Promise<React.ReactElement> {
  if (!(await estAdministratrice())) return <AccesReserve titre="Pages" />;

  return <PagesListViewClient />;
}
