// UserEditView — wrapper server pour la vue d'édition custom d'un user
// (Utilisateurs admin). Branchée via Users.admin.components.views.edit.root.

import React from 'react';

import UserEditViewClient from './UserEditView.client';

export default function UserEditView(props: {
  routeSegments?: string[];
}): React.ReactElement {
  const segments = props.routeSegments ?? [];
  const last = segments[segments.length - 1];
  const id = !last || last === 'create' ? null : last;
  return <UserEditViewClient docId={id} />;
}
