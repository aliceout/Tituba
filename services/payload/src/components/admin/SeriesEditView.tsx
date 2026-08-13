// SeriesEditView — wrapper server pour la vue d'édition custom d'une
// série. Branché via Series.admin.components.views.edit.root.
//
// Remplace le rendu natif Payload par le gabarit maison (CarnetTopbar,
// hero, champs), au même titre que ThemeEditView dont il reprend la
// structure.

import React from 'react';

import SeriesEditViewClient from './SeriesEditView.client';

export default function SeriesEditView(props: {
  routeSegments?: string[];
}): React.ReactElement {
  const segments = props.routeSegments ?? [];
  const last = segments[segments.length - 1];
  const id = !last || last === 'create' ? null : last;
  return <SeriesEditViewClient docId={id} />;
}
