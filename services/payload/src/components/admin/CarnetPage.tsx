'use client';

// Wrapper de page admin partagé — UN seul pattern utilisé par toutes
// les vues custom (listview, editview, postedit). Garantit que :
//   - le container racine (.carnet-{variant}) n'a PAS de padding
//     horizontal, donc la topbar enfant est full-bleed naturellement,
//     sans marge négative
//   - la topbar est rendue à l'intérieur via <CarnetTopbar/>
//   - le contenu est enveloppé dans .carnet-page__body qui porte le
//     padding latéral (--carnet-pad-x)
//
// Variante fullWidth : pas de padding sur le body — utile pour la vue
// PostEdit dont le grid __doc / __center / __meta gère son propre
// padding interne et doit prendre toute la largeur.

import React from 'react';

import CarnetTopbar, { type Crumb } from './CarnetTopbar';

export type CarnetPageVariant = 'listview' | 'editview' | 'postedit';

export interface CarnetPageProps {
  variant: CarnetPageVariant;
  // Modificateur appliqué au container : carnet-{variant}--{modifier}
  // (ex. 'posts', 'themes', 'theme', 'account', 'media').
  modifier?: string;
  crumbs: Crumb[];
  // Élément libre rendu juste après les crumbs dans la topbar
  // (ex. chip de statut sur PostEdit). Cf <CarnetTopbar status>.
  topbarStatus?: React.ReactNode;
  // Boutons d'action à droite de la topbar (Sauvegarder / Publier /
  // Nouveau X / Exporter / etc., plus indicateurs « dirty » /
  // « sauvegardé »).
  topbarActions?: React.ReactNode;
  // Désactive le padding horizontal du body — pour les pages dont le
  // contenu est lui-même un grid full-width (ex. PostEdit __doc).
  fullWidth?: boolean;
  // Hydration mismatch sur les attributs disabled des boutons d'action
  // (cf. CarnetTopbar). Utilisé par PostEdit dont le state initial
  // diverge entre SSR et premier mount client.
  suppressHydrationWarningOnActions?: boolean;
  children: React.ReactNode;
}

export default function CarnetPage({
  variant,
  modifier,
  crumbs,
  topbarStatus,
  topbarActions,
  fullWidth,
  suppressHydrationWarningOnActions,
  children,
}: CarnetPageProps): React.ReactElement {
  const containerClass = modifier
    ? `carnet-${variant} carnet-${variant}--${modifier}`
    : `carnet-${variant}`;
  const bodyClass = fullWidth
    ? 'carnet-page__body carnet-page__body--full'
    : 'carnet-page__body';

  return (
    <div className={containerClass}>
      <CarnetTopbar
        crumbs={crumbs}
        status={topbarStatus}
        suppressHydrationWarningOnActions={suppressHydrationWarningOnActions}
      >
        {topbarActions}
      </CarnetTopbar>
      <div className={bodyClass}>{children}</div>
    </div>
  );
}
