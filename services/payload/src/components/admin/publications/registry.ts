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
  /**
   * Colonne où rendre le champ. Par défaut la barre latérale, qui
   * accueille les réglages d'un billet. `main` le place dans la colonne
   * centrale, en panneau propre entre le corps et les notes — pour ce
   * qui n'est pas un réglage mais le contenu lui-même : le fichier d'un
   * épisode de podcast n'est pas une métadonnée, c'est ce qu'on vient
   * publier.
   */
  zone?: 'sidebar' | 'main';
  /**
   * Champ enregistré mais jamais affiché. Réservé aux valeurs dérivées
   * — la durée d'un épisode est lue dans le fichier au dépôt, la
   * montrer en saisie ne proposerait qu'une occasion de la fausser.
   *
   * Il reste déclaré ici, et non retiré du registre : c'est de cette
   * liste que `pickExtraValues` tire le corps de la requête de
   * sauvegarde. L'en retirer ne l'aurait pas caché, l'aurait
   * silencieusement cessé d'enregistrer.
   */
  hidden?: boolean;
} & (
  | { type: 'text' | 'url' | 'textarea' }
  | { type: 'number'; min?: number; max?: number }
  | { type: 'select'; options: { label: string; value: string }[] }
  | { type: 'checkbox' }
  /** Relation vers `media` (id). Rendu par UnsplashImagePicker, pas un
   *  <input> — cf branche dédiée dans PublicationEditView.client.tsx.
   *  `aspect` est la proportion de l'emplacement qui recevra l'image
   *  (largeur / hauteur), qui pilote le cadrage proposé : 1 par défaut,
   *  car le hero d'un billet montre un carré. Une actu, elle, l'affiche
   *  en bandeau — cadrer en carré ce qui sortira en 16/9 ne montrerait
   *  pas ce qui est gardé. */
  | { type: 'upload'; aspect?: number }
  /** Relation vers `audio` (id). Rendu par AudioUploadField — même
   *  principe que `upload`, mais un fichier audio ne se cherche pas
   *  chez un tiers et se contrôle à l'oreille : dépôt et écoute sur
   *  place, plus la durée lue dans le fichier. */
  | { type: 'audio' }
  /** Liste de valeurs libres, saisies une par une (Entrée) et rendues
   *  en pastilles — cf ChipsInput. Stockée en `hasMany` côté Payload,
   *  donc un vrai tableau : une chaîne à virgules obligerait chaque
   *  lecteur à la redécouper, et se casserait sur un nom qui en
   *  contient une. */
  | { type: 'list' }
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
  /**
   * Le format se met-il en série ? Doit rester aligné sur l'option
   * `series` du constructeur de collection (cf build-publication) : le
   * champ n'existe côté base que pour les formats qui l'activent, et le
   * proposer ailleurs enverrait une valeur que l'API ignore.
   *
   * Hors `extraFields` : la série n'est pas un champ propre à un format
   * mais un rattachement partagé par trois d'entre eux, de même nature
   * que les thématiques — et c'est à côté d'elles qu'elle se rend.
   */
  series?: boolean;
  /** Champs propres au format. Cf. l'avertissement en tête de fichier. */
  extraFields: FieldSpec[];
  /** Champs obligatoires vérifiés côté client avant l'envoi. */
  required: string[];
  readingLabel: ReadingLabel;
};

const BASE_REQUIRED = ['title', 'lede', 'body'];

export const PUBLICATIONS: Record<string, PublicationSpec> = {
  articles: {
    apiBase: '/cms/api/articles',
    adminBase: '/cms/admin/collections/articles',
    routePrefix: '/articles',
    labelSingular: 'Article de recherche',
    labelPlural: 'Articles de recherche',
    series: true,
    extraFields: [
      {
        name: 'doi',
        type: 'text',
        label: 'DOI',
        placeholder: '10.5281/zenodo.1234567',
        help: "Si l'article est aussi déposé sur HAL, Zenodo ou dans une revue. Repris dans les exports de citation.",
      },
    ],
    required: BASE_REQUIRED,
    readingLabel: 'minutes',
  },
  analyses: {
    apiBase: '/cms/api/analyses',
    adminBase: '/cms/admin/collections/analyses',
    routePrefix: '/analyses',
    labelSingular: "Billet d'analyse",
    labelPlural: "Billets d'analyse",
    series: true,
    extraFields: [
      {
        name: 'image',
        type: 'upload',
        label: 'Image de couverture',
      },
    ],
    required: BASE_REQUIRED,
    readingLabel: 'minutes',
  },
  actus: {
    apiBase: '/cms/api/actus',
    adminBase: '/cms/admin/collections/actus',
    routePrefix: '/actus',
    labelSingular: "Billet d'actu",
    labelPlural: "Billets d'actu",
    extraFields: [
      {
        name: 'image',
        type: 'upload',
        label: 'Image',
        aspect: 16 / 9,
        help: 'Facultative. En bandeau au-dessus du titre, et en vignette dans les listes.',
      },
    ],
    required: BASE_REQUIRED,
    readingLabel: 'minutes',
  },
  podcasts: {
    apiBase: '/cms/api/podcasts',
    adminBase: '/cms/admin/collections/podcasts',
    routePrefix: '/podcasts',
    labelSingular: 'Podcast',
    labelPlural: 'Podcasts',
    series: true,
    extraFields: [
      {
        name: 'audio',
        type: 'audio',
        label: 'Fichier audio',
        zone: 'main',
      },
      // En barre latérale, comme sur les billets d'analyse : le fichier
      // est le contenu de l'épisode, sa couverture reste un habillage.
      {
        name: 'image',
        type: 'upload',
        label: 'Image de couverture',
      },
      {
        name: 'durationSeconds',
        type: 'number',
        min: 0,
        label: 'Durée',
        hidden: true,
      },
      {
        name: 'guests',
        type: 'list',
        label: 'Invité·es',
        placeholder: 'Un nom, Entrée pour ajouter…',
        help: 'Les personnes reçues dans l’épisode. Distinct des auteur·ices, qui signent la production.',
      },
    ],
    // Un épisode n'a pas forcément de corps rédigé : l'audio est le
    // contenu, le corps ne sert qu'aux notes d'épisode.
    required: ['title', 'lede', 'audio'],
    readingLabel: 'duration',
  },
  outils: {
    apiBase: '/cms/api/outils',
    adminBase: '/cms/admin/collections/outils',
    routePrefix: '/outils',
    labelSingular: 'Outil',
    labelPlural: 'Outils',
    extraFields: [
      {
        name: 'resourceUrl',
        type: 'url',
        label: 'Lien de la ressource',
        placeholder: 'https://…/guide.pdf',
        help: 'Fichier à télécharger ou page qui l’héberge.',
      },
      {
        name: 'audience',
        type: 'select',
        label: 'Public visé',
        options: [
          { label: 'Tous publics', value: 'tous' },
          { label: 'Militant·es et collectifs', value: 'militantes' },
          { label: 'Professionnel·les', value: 'pros' },
          { label: 'Structures et institutions', value: 'structures' },
        ],
      },
    ],
    // Une ressource peut se suffire de son lien et de son chapô.
    required: ['title', 'lede', 'resourceUrl'],
    readingLabel: 'none',
  },
};

/** Repli neutre — évite un crash si un slug inconnu atteint la vue. */
const FALLBACK: PublicationSpec = {
  apiBase: '/cms/api/articles',
  adminBase: '/cms/admin/collections/articles',
  routePrefix: '/articles',
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
    out[f.name] =
      f.type === 'number' || f.type === 'upload' || f.type === 'audio'
        ? null
        : f.type === 'list'
        ? []
        : f.type === 'checkbox'
        ? false
        : f.type === 'select'
        ? f.options[0]?.value ?? ''
        : '';
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
    if (f.type === 'checkbox') {
      out[f.name] = raw === true || raw === 'true';
    } else if (f.type === 'number') {
      const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
      out[f.name] = typeof n === 'number' && Number.isFinite(n) ? n : null;
    } else if (f.type === 'list') {
      // Les entrées vides sont écartées ici plutôt qu'à la saisie : on
      // n'interrompt pas quelqu'un qui tape, mais on n'enregistre pas
      // une pastille sans nom.
      out[f.name] = Array.isArray(raw)
        ? raw.map((v) => String(v).trim()).filter(Boolean)
        : [];
    } else if (f.type === 'upload' || f.type === 'audio') {
      // La valeur peut être un id brut (déjà sélectionné puis re-tapé
      // via patch()) ou le document lié peuplé par depth>0 au
      // chargement — dans les deux cas on ne sauvegarde que l'id.
      out[f.name] =
        raw && typeof raw === 'object' && 'id' in (raw as Record<string, unknown>)
          ? (raw as { id: unknown }).id
          : raw || null;
    } else {
      const s = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw);
      out[f.name] = s === '' ? null : s;
    }
  }
  return out;
}
