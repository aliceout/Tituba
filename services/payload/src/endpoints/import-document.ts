/**
 * Import d'un document rédigé ailleurs — l'endpoint.
 *
 *   POST /cms/api/import-document   (multipart, champ « fichier »)
 *
 * Reçoit un .docx ou un .odt, en tire le corps au format de l'éditeur,
 * les notes, et la bibliographie détachée — chaque référence accompagnée
 * des entrées existantes qui pourraient lui correspondre.
 *
 * L'endpoint ne modifie RIEN. Il lit, convertit, propose. C'est la vue
 * d'édition qui décide d'insérer, après que quelqu'un a vu ce qui
 * allait l'être : un import qui écrase un texte en cours de rédaction
 * serait une perte irréparable, et une confirmation coûte deux
 * secondes.
 *
 * Réservé aux personnes connectées : convertir un document coûte du
 * temps de calcul, et rien ne justifie de l'offrir au tout-venant.
 */
import type { Endpoint } from 'payload';

import { errorResponse, jsonResponse, requireUser } from '../auth/helpers';
import { lireNotes } from '../lib/import-citations';
import { EXTENSIONS, lireDocument, type LigneBiblio } from '../lib/import-docx';
import { cleDeDoublon } from '../lib/import-references';
import { htmlVersLexical } from '../lib/import-lexical';

/** Au-delà, ce n'est plus un article — et la conversion durerait. */
const TAILLE_MAX = 15 * 1024 * 1024;

type Candidat = {
  id: number | string;
  label: string;
  /** Vrai quand le nom ET l'année concordent — proposé d'emblée. */
  sur: boolean;
};

/**
 * Une référence proposée, avec sa clé : c'est elle qui reliera plus
 * tard l'entrée créée aux notes qui la citent.
 */
type LigneProposee = LigneBiblio & { cle: string; candidats: Candidat[] };

/**
 * Cherche, pour chaque référence du document, les entrées de la
 * bibliothèque qui pourraient être la même.
 *
 * On interroge sur le nom de famille, et l'on marque « sûr » quand
 * l'année concorde aussi. Rien n'est relié automatiquement : une
 * référence mal appariée est plus coûteuse à repérer qu'à saisir, et
 * c'est la personne qui tranche.
 */
async function proposer(
  req: Parameters<NonNullable<Endpoint['handler']>>[0],
  lignes: LigneBiblio[],
): Promise<LigneProposee[]> {
  const out: LigneProposee[] = [];

  for (const ligne of lignes) {
    if (!ligne.nom) {
      out.push({ ...ligne, cle: cleDeDoublon(ligne), candidats: [] });
      continue;
    }
    try {
      const res = await req.payload.find({
        collection: 'bibliography',
        where: { 'authors.lastName': { like: ligne.nom } },
        limit: 5,
        depth: 0,
        overrideAccess: true,
      });
      const candidats = (
        res.docs as Array<{
          id: number | string;
          displayLabel?: string | null;
          authorLabel?: string | null;
          title?: string | null;
          year?: number | null;
        }>
      ).map((d) => ({
        id: d.id,
        label:
          d.displayLabel?.trim() ||
          [d.authorLabel, d.year, d.title].filter(Boolean).join(' — ') ||
          `#${d.id}`,
        sur: ligne.annee != null && d.year === ligne.annee,
      }));
      // Les concordances certaines d'abord : c'est ce qu'on veut voir.
      candidats.sort((a, b) => Number(b.sur) - Number(a.sur));
      out.push({ ...ligne, cle: cleDeDoublon(ligne), candidats });
    } catch (err) {
      req.payload.logger.warn(
        { err: (err as Error).message },
        'Recherche bibliographique impossible pendant un import',
      );
      out.push({ ...ligne, cle: cleDeDoublon(ligne), candidats: [] });
    }
  }
  return out;
}

/**
 * Configuration de l'éditeur du champ `body`.
 *
 * Prise sur le champ et non sur l'éditeur racine : c'est celle du champ
 * qui déclare les blocs du site — notes, citations, figures. Un arbre
 * bâti avec la configuration par défaut serait refusé à
 * l'enregistrement, faute de connaître ces blocs.
 */
function configEditeurCorps(
  req: Parameters<NonNullable<Endpoint['handler']>>[0],
  collection: string,
): unknown {
  // Le nom de collection vient d'une requête : il n'est pas garanti
  // d'être l'un de ceux que connaît le typage. On passe donc par une
  // vue indexable, et l'absence est traitée par l'appelant.
  const registre = req.payload.collections as Record<
    string,
    { config?: { fields?: unknown[] } } | undefined
  >;
  const champs = registre[collection]?.config?.fields ?? [];
  const champ = (champs as Array<{ name?: string; editor?: { editorConfig?: unknown } }>).find(
    (f) => f?.name === 'body',
  );
  return champ?.editor?.editorConfig;
}

export const importDocumentEndpoint: Endpoint = {
  path: '/import-document',
  method: 'post',
  handler: async (req) => {
    if (!requireUser(req)) return errorResponse('Non authentifié.', 401, 'unauthenticated');

    let fichier: File | null = null;
    let collection = 'articles';
    try {
      const form = await req.formData?.();
      const f = form?.get('fichier');
      if (f && typeof f === 'object' && 'arrayBuffer' in f) fichier = f as File;
      const c = form?.get('collection');
      if (typeof c === 'string' && c) collection = c;
    } catch {
      return errorResponse('Envoi illisible.', 400, 'invalid_body');
    }

    if (!fichier) return errorResponse('Aucun fichier reçu.', 400, 'no_file');

    const nom = fichier.name ?? '';
    if (!EXTENSIONS.some((e) => nom.toLowerCase().endsWith(e))) {
      return errorResponse(
        `Format non pris en charge. Formats acceptés : ${EXTENSIONS.join(', ')}.`,
        400,
        'bad_format',
      );
    }
    if (fichier.size > TAILLE_MAX) {
      return errorResponse('Document trop volumineux (15 Mo maximum).', 400, 'too_large');
    }

    const editorConfig = configEditeurCorps(req, collection);
    if (!editorConfig) {
      return errorResponse('Collection inconnue.', 400, 'bad_collection');
    }

    try {
      const buffer = Buffer.from(await fichier.arrayBuffer());
      const lu = await lireDocument(buffer, nom);
      const body = htmlVersLexical(lu.html, lu.notes, editorConfig as never);

      return jsonResponse(
        {
          ok: true,
          body,
          titre: lu.titre,
          // De quoi annoncer ce qui a été trouvé avant d'insérer.
          resume: {
            titres: (lu.html.match(/<h[2-6][^>]*>/g) ?? []).length,
            paragraphes: (lu.html.match(/<p[^>]*>/g) ?? []).length,
            notes: lu.notes.length,
          },
          biblio: await proposer(req, lu.biblio),
          notesRefs: await proposer(req, lu.notesRefs),
          renvois: lu.renvois,
          // Ce que chaque note cite, et avec quelle pagination : de quoi
          // la remplacer par une citation qui renvoie à la bibliographie
          // plutôt que de la recopier.
          notesLues: lireNotes(lu.notes),
          avertissements: lu.avertissements,
        },
        { status: 200 },
      );
    } catch (err) {
      // Un document illisible n'est pas une panne du serveur : on dit ce
      // qui s'est passé plutôt que de renvoyer une erreur muette.
      req.payload.logger.warn(
        { err: (err as Error).message, nom },
        'Import de document impossible',
      );
      return jsonResponse(
        { ok: false, code: 'unreadable', message: (err as Error).message },
        { status: 422 },
      );
    }
  },
};
