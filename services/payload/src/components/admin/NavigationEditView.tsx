// NavigationEditView — wrapper server pour la vue d'édition custom du
// global Navigation. Branché via Navigation.admin.components.views.edit.root.
//
// Pas de version GIT_TAG/GIT_COMMIT ici (réservée à Site) : Navigation
// est purement éditorial. La logique form vit côté client.

import React from 'react';

import NavigationEditViewClient from './NavigationEditView.client';
import AccesReserve, { estAdministratrice } from './AccesReserve';

export default async function NavigationEditView(): Promise<React.ReactElement> {
  if (!(await estAdministratrice())) return <AccesReserve titre="Navigation" />;

  return <NavigationEditViewClient />;
}
