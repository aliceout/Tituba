// PublicationListView — wrapper server pour la list view custom d'une
// collection de publication. Branché via
// <collection>.admin.components.views.list.
//
// La logique (fetch + filtres + pagination) est côté client : on a
// besoin de re-fetch à chaque changement de filtre, et de toute façon
// l'utilisateur·rice est authentifié·e, donc le navigateur peut taper
// l'API avec ses cookies de session.
//
// Réf : Design/design_handoff_admin/tituba-admin.html → ScreenList.

import React from 'react';

import PublicationListViewClient from './PublicationListView.client';

export default function PublicationListView(props: {
  collectionSlug?: string;
  collectionConfig?: { slug?: string };
}): React.ReactElement {
  // Payload passe `collectionConfig` aux vues de liste ; on accepte
  // aussi `collectionSlug` en prop directe pour rester testable.
  const slug = props.collectionSlug ?? props.collectionConfig?.slug ?? null;
  return <PublicationListViewClient collectionSlug={slug} />;
}
