// SubscriptionsEditView — wrapper server pour la vue d'édition custom
// du global Subscriptions. Branché via
// Subscriptions.admin.components.views.edit.root.

import React from 'react';

import SubscriptionsEditViewClient from './SubscriptionsEditView.client';

export default function SubscriptionsEditView(): React.ReactElement {
  return <SubscriptionsEditViewClient />;
}
