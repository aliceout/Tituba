// IdentityEditView — wrapper server pour la vue d'édition custom du
// global Identity. Branché via Identity.admin.components.views.edit.root.

import React from 'react';

import IdentityEditViewClient from './IdentityEditView.client';

export default function IdentityEditView(): React.ReactElement {
  return <IdentityEditViewClient />;
}
