// PageEditView — wrapper server pour la vue d'édition custom d'une
// page éditoriale (À propos, Colophon, Mentions légales…). Branché via
// Pages.admin.components.views.edit.root.

import React from 'react';

import PageEditViewClient from './PageEditView.client';
import AccesReserve, { estAdministratrice } from './AccesReserve';

export default async function PageEditView(props: {
  routeSegments?: string[];
}): Promise<React.ReactElement> {
  if (!(await estAdministratrice())) return <AccesReserve titre="Pages" />;
  const segments = props.routeSegments ?? [];
  const last = segments[segments.length - 1];
  const id = !last || last === 'create' ? null : last;
  return <PageEditViewClient docId={id} />;
}
