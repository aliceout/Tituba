/**
 * Registre des collections de publication, côté admin.
 *
 * Les vues d'édition et de liste sont partagées par les cinq formats de
 * Tituba. Elles ne reçoivent de Payload que le slug de la collection ;
 * tout ce qui les distingue est décrit ici.
 *
 * Pourquoi un module séparé plutôt que des props dans payload.config :
 * la config Payload est importée par les deux bundles (serveur et
 * client), donc les props qui y transitent doivent être sérialisables.
 * Un slug l'est ; un descripteur de champs avec des fonctions ne l'est
 * pas. La config ne transporte donc que le slug, et la table de vérité
 * vit ici, importée directement par les composants clients.
 *
 * ─── Le point critique : `extraFields` ───────────────────────────────
 *
 * `extraFields` est un **schéma déclaratif**, pas une table de libellés.
 * C'est délibéré. La vue d'édition énumère les champs à quatre endroits
 * indépendants : le brouillon vierge, le corps de la requête de
 * sauvegarde, la renormalisation de la réponse, et la validation
 * cliente. Un champ oublié dans l'une de ces listes n'émet aucune
 * erreur — il est simplement **perdu à la sauvegarde**. En dérivant les
 * quatre depuis ce schéma, on rend l'oubli impossible.
 */

/** Descripteur d'un champ propre à un format. */
export type FieldSpec = {
  name: string;
  label: string;
  /** Aide affichée sous le champ. */
  help?: string;
  placeholder?: string;
} & (
  | { type: 'text' | 'url' | 'textarea' }
  | { type: 'number'; min?: number; max?: number }
  | { type: 'select'; options: { label: string; value: string }[] }
);

/** Comment présenter la durée d'une publication. */
export type ReadingLabel = 'minutes' | 'duration' | 'none';

export type PublicationSpec = {
  /** Base de l'API REST, ex. `/cms/api/articles`. */
  apiBase: string;
  /** Base des routes admin, ex. `/cms/admin/collections/articles`. */
  adminBase: string;
  /** Racine publique côté Astro, ex. `/articles`. Sans slash final. */
  routePrefix: string;
  labelSingular: string;
  labelPlural: string;
  /**
   * Sous-genre optionnel, rendu en select dans la sidebar. Absent pour
   * les collections Tituba : le format est porté par la collection.
   */
  subtypes?: { options: { label: string; value: string }[]; defaultValue: string };
  /** Champs propres au format. Cf. l'avertissement en tête de fichier. */
  extraFields: FieldSpec[];
  /** Champs obligatoires vérifiés côté client avant l'envoi. */
  required: string[];
  readingLabel: ReadingLabel;
};

const BASE_REQUIRED = ['title', 'slug', 'lede', 'body'];

export const PUBLICATIONS: Record<string, PublicationSpec> = {
  // Collection héritée du Carnet, en sursis le temps de la bascule vers
  // les cinq formats de Tituba. Seule entrée à déclarer des `subtypes`.
  posts: {
    apiBase: '/cms/api/posts',
    adminBase: '/cms/admin/collections/posts',
    routePrefix: '/billets',
    labelSingular: 'Billet',
    labelPlural: 'Billets',
    subtypes: {
      defaultValue: 'analyse',
      options: [
        { label: 'Article', value: 'analyse' },
        { label: 'Note de lecture', value: 'note' },
        { label: 'Fiche', value: 'fiche' },
      ],
    },
    extraFields: [],
    required: BASE_REQUIRED,
    readingLabel: 'minutes',
  },
};

/** Repli neutre — évite un crash si un slug inconnu atteint la vue. */
const FALLBACK: PublicationSpec = {
  apiBase: '/cms/api/posts',
  adminBase: '/cms/admin/collections/posts',
  routePrefix: '/billets',
  labelSingular: 'Publication',
  labelPlural: 'Publications',
  extraFields: [],
  required: BASE_REQUIRED,
  readingLabel: 'minutes',
};

export function getPublicationSpec(slug: string | null | undefined): PublicationSpec {
  if (!slug) return FALLBACK;
  return PUBLICATIONS[slug] ?? FALLBACK;
}

/**
 * Valeurs initiales des champs de format pour un brouillon vierge.
 * `number` démarre à null plutôt qu'à 0 : 0 est une durée légitime mais
 * trompeuse, l'absence de valeur est plus honnête.
 */
export function emptyExtraValues(spec: PublicationSpec): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of spec.extraFields) {
    out[f.name] = f.type === 'number' ? null : f.type === 'select' ? f.options[0]?.value ?? '' : '';
  }
  return out;
}

/**
 * Extrait les champs de format d'un document, pour le corps d'une
 * requête de sauvegarde. Les chaînes vides deviennent `null` afin de ne
 * pas enregistrer d'URL vide là où Payload attend une absence.
 */
export function pickExtraValues(
  spec: PublicationSpec,
  doc: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of spec.extraFields) {
    const raw = doc[f.name];
    if (f.type === 'number') {
      const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
      out[f.name] = typeof n === 'number' && Number.isFinite(n) ? n : null;
    } else {
      const s = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw);
      out[f.name] = s === '' ? null : s;
    }
  }
  return out;
}
