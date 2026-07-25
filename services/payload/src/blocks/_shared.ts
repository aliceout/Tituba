// Champs réutilisables entre les blocs.
//
// Le carnet a une charte sobre et monochrome (un seul accent violet) —
// pas de palette multi-fonds comme un site associatif. Ce fichier reste
// donc minimal et expose surtout des helpers de typage.
//
// `satisfies Field` (vs `: Field`) préserve les types littéraux —
// nécessaire pour que les blocs qui spread (`{ ...alignField, name: 'x' }`)
// gardent le narrowing sur `type: 'select'` au lieu de tomber sur le type
// union.

import type { Field } from 'payload';

/** Alignement standard pour les blocs qui en ont besoin (figure, citation). */
export const alignField = {
  name: 'align',
  type: 'select',
  required: false,
  defaultValue: 'left',
  options: [
    { label: 'Gauche', value: 'left' },
    { label: 'Centré', value: 'center' },
    { label: 'Pleine largeur', value: 'wide' },
  ],
} satisfies Field;
