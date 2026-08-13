// IdentityEditView — wrapper server pour la vue d'édition custom du
// global Identity. Branché via Identity.admin.components.views.edit.root.

import React from 'react';

import IdentityEditViewClient from './IdentityEditView.client';
import AccesReserve, { estAdministratrice } from './AccesReserve';

export default async function IdentityEditView(): Promise<React.ReactElement> {
  if (!(await estAdministratrice())) return <AccesReserve titre="Identité" />;

  return <IdentityEditViewClient />;
}
