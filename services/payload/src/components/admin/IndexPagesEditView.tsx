// IndexPagesEditView — wrapper server pour la vue d'édition custom du
// global IndexPages. Branché via IndexPages.admin.components.views.edit.root.
//
// Logique form (fetch + dirty + save) côté client. Pas de version
// GIT_TAG/GIT_COMMIT ici (réservée à Site).

import React from 'react';

import IndexPagesEditViewClient from './IndexPagesEditView.client';

export default function IndexPagesEditView(): React.ReactElement {
  return <IndexPagesEditViewClient />;
}
