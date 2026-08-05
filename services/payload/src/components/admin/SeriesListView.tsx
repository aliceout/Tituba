// SeriesListView — wrapper server pour la vue Liste custom des séries.
// Branché via Series.admin.components.views.list.
//
// La porte d'entrée (émissions ou séries d'articles) est lue côté client
// dans le paramètre `format` de l'URL : c'est la nav qui le pose, et une
// seule collection sert les deux entrées (cf Series.ts).

import React from 'react';

import SeriesListViewClient from './SeriesListView.client';

export default function SeriesListView(): React.ReactElement {
  return <SeriesListViewClient />;
}
