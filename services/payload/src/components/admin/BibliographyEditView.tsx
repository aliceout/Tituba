// BibliographyEditView — wrapper server pour la vue d'édition custom
// d'une référence bibliographique. Branché via
// Bibliography.admin.components.views.edit.root.
//
// Remplace entièrement le rendu natif Payload (form stacked + champs UI
// fantômes pour les sections / la preview) par le layout du handoff :
// CarnetTopbar + h1 « Référence bibliographique » + sections
// Identification / Publication / Notes + aperçu + used-in.

import React from 'react';

import BibliographyEditViewClient from './BibliographyEditView.client';

export default function BibliographyEditView(props: {
  routeSegments?: string[];
}): React.ReactElement {
  const segments = props.routeSegments ?? [];
  const last = segments[segments.length - 1];
  const id = !last || last === 'create' ? null : last;
  return <BibliographyEditViewClient docId={id} />;
}
