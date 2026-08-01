/**
 * Constructeur des collections de publication de Tituba.
 *
 * Tituba publie cinq formats — articles de recherche, billets d'analyse,
 * billets d'actu, podcasts, outils — dans cinq collections distinctes.
 * Elles partagent le même socle de champs et le même comportement ; ce
 * module assemble ce socle, chaque collection n'ayant plus à déclarer
 * que ce qui lui est propre (ses champs de format, ses libellés, sa
 * racine d'URL).
 *
 * Le socle est volontairement identique partout : c'est ce qui permet à
 * la recherche plein texte, aux exports de citation et aux flux
 * fusionnés de traiter les cinq collections de la même façon, en lisant
 * les champs par leur nom.
 */

import type { CollectionAfterChangeHook, CollectionConfig, Field } from 'payload';

import { authenticated } from '../../access/authenticated';
import { makeDefaultAuthor, makePublicId } from './hooks';
import {
  authorsField,
  bibliographyField,
  bodyField,
  draftField,
  featuredField,
  hasDraftZonesField,

  ledeField,
  notificationsSentAtField,

  publicIdField,
  publishedAtField,
  readingTimeField,

  subtypeField,
  tagsField,
  themesField,
  titleField,
} from './fields';

export type BuildPublicationArgs = {
  /** Slug de la collection, ex. `articles`. Pilote aussi l'URL d'API. */
  slug: string;
  labels: { singular: string; plural: string };
  /**
   * Sous-genre optionnel, rendu en select dans la sidebar. Hérité du
   * Tituba ; les collections Tituba n'en déclarent pas, le format étant
   * porté par la collection elle-même.
   */
  subtypes?: { options: { label: string; value: string }[]; defaultValue: string };
  /** Champs propres au format (audio d'un podcast, lien d'un outil…). */
  extraFields?: Field[];
  /**
   * Rend le chapô et/ou le corps facultatifs. Un outil peut n'être
   * qu'un lien accompagné d'une description, un podcast qu'un fichier
   * audio avec ses notes d'épisode : leur imposer un corps rédigé
   * n'aurait pas de sens.
   */
  ledeRequired?: boolean;
  bodyRequired?: boolean;
  /** Hooks `afterChange` — indexation recherche, notifications mail. */
  afterChange?: CollectionAfterChangeHook[];
  admin?: CollectionConfig['admin'];
};

export function buildPublicationCollection(args: BuildPublicationArgs): CollectionConfig {
  const {
    slug,
    labels,
    subtypes,
    extraFields = [],
    afterChange = [],
    admin,
    ledeRequired = true,
    bodyRequired = true,
  } = args;

  return {
    slug,
    labels,
    access: {
      read: () => true,
      create: authenticated,
      update: authenticated,
      delete: authenticated,
    },
    hooks: {
      beforeValidate: [makePublicId(slug), makeDefaultAuthor()],
      afterChange,
    },
    admin,
    fields: [
      publicIdField(),
      titleField(),
      ...(subtypes ? [subtypeField(subtypes.options, subtypes.defaultValue)] : []),
      themesField(),
      tagsField(),
      authorsField(),
      publishedAtField(),
      ledeField(ledeRequired),
      bodyField(bodyRequired),
      bibliographyField(),
      // Champs de format insérés après le socle éditorial et avant les
      // champs calculés, pour qu'ils tombent au bon endroit dans l'ordre
      // de déclaration (et donc dans les colonnes générées).
      ...extraFields,
      readingTimeField(),
      featuredField(),
      draftField(),
      notificationsSentAtField(),
      hasDraftZonesField(),
    ],
  };
}
