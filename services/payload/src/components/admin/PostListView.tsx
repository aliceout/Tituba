// PostListView — wrapper server pour la list view custom de Posts.
// Branché via Posts.admin.components.views.list.
//
// La logique (fetch + filtres + pagination) est côté client : on a
// besoin de re-fetch à chaque changement de filtre, de toute façon
// le user est authentifié donc le navigateur peut taper /cms/api/posts
// avec ses cookies de session.
//
// Réf : Design/design_handoff_admin/carnet-admin.html → ScreenList.

import React from 'react';

import PostListViewClient from './PostListView.client';

export default function PostListView(): React.ReactElement {
  return <PostListViewClient />;
}
