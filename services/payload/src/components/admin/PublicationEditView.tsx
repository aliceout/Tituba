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
  // routeSegments est passé par Payload à partir de la racine de
  // l'admin, **préfixe `collections` compris** : pour
  // /admin/collections/<slug>/<id> → ['collections', '<slug>', '<id>'] ;
  // pour /admin/collections/<slug>/create → ['collections', '<slug>',
  // 'create']. On retire ce préfixe pour que le premier segment soit le
  // slug de la collection, ce qui évite d'avoir à écrire un wrapper par
  // format.
  //
  // Le `slice` est conditionnel et non systématique : si une version de
  // Payload repasse un jour les segments sans préfixe, les deux formes
  // restent lues correctement. Se tromper ici est silencieux —
  // getPublicationSpec replie sur un spec par défaut (articles) au lieu
  // d'échouer, donc la vue chargeait le doc depuis la mauvaise
  // collection et n'affichait qu'un « HTTP 404 » sans rapport apparent.
  const raw = props.routeSegments ?? [];
  const segments = raw[0] === 'collections' ? raw.slice(1) : raw;
  const collectionSlug = segments[0] ?? null;
  const last = segments[segments.length - 1];
  const id = !last || last === 'create' || last === collectionSlug ? null : last;
  return <PublicationEditViewClient docId={id} collectionSlug={collectionSlug} />;
}
