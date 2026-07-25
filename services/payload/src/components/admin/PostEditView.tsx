// PostEditView — wrapper server pour la vue d'édition custom d'un Post.
// Branché via Posts.admin.components.views.edit.root.
//
// Remplace entièrement le rendu natif Payload (form stacked + sidebar
// fields) par le layout éditorial du handoff (header + ed-card center
// + meta sidebar 300px). Cf Design/design_handoff_admin/carnet-admin.html
// → ScreenDoc.

import React from 'react';

import PostEditViewClient from './PostEditView.client';

export default function PostEditView(props: {
  routeSegments?: string[];
}): React.ReactElement {
  // routeSegments est passé par Payload : pour /admin/collections/posts/<id>
  // → ['posts', '<id>'] (post-edit) ; pour /admin/collections/posts/create
  // → ['posts', 'create'].
  const segments = props.routeSegments ?? [];
  const last = segments[segments.length - 1];
  const id = !last || last === 'create' ? null : last;
  return <PostEditViewClient docId={id} />;
}
