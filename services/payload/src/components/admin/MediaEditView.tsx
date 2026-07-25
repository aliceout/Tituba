// MediaEditView — wrapper server pour la vue d'édition custom d'un
// média (collection upload). Branché via
// Media.admin.components.views.edit.root.

import React from 'react';

import MediaEditViewClient from './MediaEditView.client';

export default function MediaEditView(props: {
  routeSegments?: string[];
}): React.ReactElement {
  const segments = props.routeSegments ?? [];
  const last = segments[segments.length - 1];
  const id = !last || last === 'create' ? null : last;
  return <MediaEditViewClient docId={id} />;
}
