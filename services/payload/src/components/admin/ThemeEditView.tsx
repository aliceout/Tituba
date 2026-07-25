// ThemeEditView — wrapper server pour la vue d'édition custom d'un
// Thème. Branché via Themes.admin.components.views.edit.root.
//
// Remplace le rendu natif Payload par le layout du handoff
// (CarnetTopbar + h1 hero + champs nom/slug/description + used-in).

import React from 'react';

import ThemeEditViewClient from './ThemeEditView.client';

export default function ThemeEditView(props: {
  routeSegments?: string[];
}): React.ReactElement {
  const segments = props.routeSegments ?? [];
  const last = segments[segments.length - 1];
  const id = !last || last === 'create' ? null : last;
  return <ThemeEditViewClient docId={id} />;
}
