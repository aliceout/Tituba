// SiteEditView — wrapper server pour la vue d'édition custom du global
// Site (label « Options »). Branché via Site.admin.components.views.edit.root.
//
// La logique form (fetch + dirty + save) est côté client. Les infos de
// version (GIT_TAG / GIT_COMMIT) sont désormais affichées dans le
// footer de la sidebar (cf. Nav.tsx) plutôt qu'ici.

import React from 'react';

import SiteEditViewClient from './SiteEditView.client';

export default function SiteEditView(): React.ReactElement {
  return <SiteEditViewClient />;
}
