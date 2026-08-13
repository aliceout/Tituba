// SubscriptionsEditView — wrapper server pour la vue d'édition custom
// du global Subscriptions. Branché via
// Subscriptions.admin.components.views.edit.root.

import React from 'react';

import SubscriptionsEditViewClient from './SubscriptionsEditView.client';
import AccesReserve, { estAdministratrice } from './AccesReserve';

export default async function SubscriptionsEditView(): Promise<React.ReactElement> {
  if (!(await estAdministratrice())) return <AccesReserve titre="Abonnements" />;

  return <SubscriptionsEditViewClient />;
}
