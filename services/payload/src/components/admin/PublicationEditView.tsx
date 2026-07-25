// PublicationEditView — wrapper server pour la vue d'édition custom
// d'une publication. Branché via <collection>.admin.components.views.edit.root.
//
// Remplace entièrement le rendu natif Payload (form stacked + sidebar
// fields) par le layout éditorial du handoff (header + ed-card center
// + meta sidebar 300px). Cf Design/design_handoff_admin/tituba-admin.html
// → ScreenDoc.
//
// Partagé par les cinq formats de Tituba : ce qui les distingue est
// décrit dans publications/registry.ts et résolu depuis le slug.

import React from 'react';

import PublicationEditViewClient from './PublicationEditView.client';

export default function PublicationEditView(props: {
  routeSegments?: string[];
}): React.ReactElement {
  // routeSegments est passé par Payload : pour
  // /admin/collections/<slug>/<id> → ['<slug>', '<id>'] ; pour
  // /admin/collections/<slug>/create → ['<slug>', 'create'].
  // Le premier segment est donc le slug de la collection, ce qui évite
  // d'avoir à écrire un wrapper par format.
  const segments = props.routeSegments ?? [];
  const collectionSlug = segments[0] ?? null;
  const last = segments[segments.length - 1];
  const id = !last || last === 'create' || last === collectionSlug ? null : last;
  return <PublicationEditViewClient docId={id} collectionSlug={collectionSlug} />;
}
