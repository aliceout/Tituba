/**
 * Créer les entrées manquantes d'une bibliographie importée.
 *
 *   POST /cms/api/import-bibliographie   { "textes": ["…", "…"] }
 *
 * L'endpoint ne reçoit que du texte, jamais des champs déjà découpés :
 * il relit lui-même chaque référence. Faire confiance au découpage venu
 * du navigateur reviendrait à laisser écrire n'importe quoi dans la
 * bibliographie par une requête forgée, alors que la relecture ici ne
 * coûte rien — c'est le même code qui a servi à l'affichage.
 *
 * Ce qui est écrit est ce qui se lit, et rien d'autre. Une référence
 * dont le nom ou l'année ne se laissent pas lire n'est pas créée à
 * trous : elle est refusée, avec la raison. Le texte d'origine est
 * toujours conservé dans l'entrée — quoi qu'il arrive, on peut revenir
 * à ce qui était écrit dans le document.
 */
import type { Endpoint } from 'payload';

import { errorResponse, jsonResponse, readJsonBody, requireUser } from '../auth/helpers';
import { analyserReference, slugDeReference } from '../lib/import-references';

/** Une bibliographie de mémoire en compte cent ; au-delà, on doute. */
const MAX_REFERENCES = 400;

type Resultat = {
  texte: string;
  /** Entrée créée, ou retrouvée si elle existait déjà. */
  id?: number | string;
  label?: string;
  /** Vrai quand l'entrée existait : rien n'a été écrit. */
  deja?: boolean;
  /** Refus motivé — la référence reste à saisir à la main. */
  erreur?: string;
};

/** Forme comparable d'un titre : la ponctuation et la casse ne comptent pas. */
function titreNormalise(titre: string): string {
  return titre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 60);
}

/**
 * L'entrée existe-t-elle déjà ?
 *
 * Le dernier rempart, et le seul qui tienne : le panneau propose ce
 * qu'il croit manquer, mais il travaille sur un état lu à un instant
 * donné. Deux imports du même document à vingt minutes d'écart — ce qui
 * arrive dès qu'on s'y reprend à deux fois — créaient deux fois la même
 * source, une fois sous « Agier Michel », une fois sous « Agier, M. ».
 *
 * On compare sur l'année et le titre plutôt que sur le nom : c'est
 * l'écriture du nom qui varie d'une citation à l'autre, jamais l'œuvre.
 */
async function dejaPresente(
  payload: Parameters<NonNullable<Endpoint['handler']>>[0]['payload'],
  annee: number,
  titre: string,
): Promise<{ id: number | string; label: string } | null> {
  const cible = titreNormalise(titre);
  if (!cible) return null;

  const res = await payload.find({
    collection: 'bibliography',
    where: { year: { equals: annee } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  });
  const trouve = (
    res.docs as Array<{ id: number | string; title?: string | null; displayLabel?: string | null }>
  ).find((d) => titreNormalise(d.title ?? '') === cible);

  return trouve ? { id: trouve.id, label: trouve.displayLabel?.trim() || String(trouve.title) } : null;
}

/**
 * Clé libre pour l'ancre `#bib-…`.
 *
 * Deux ouvrages du même auteur la même année sont courants : on suffixe
 * alors, plutôt que d'échouer sur la contrainte d'unicité ou d'écraser
 * l'entrée existante.
 */
async function slugLibre(
  payload: Parameters<NonNullable<Endpoint['handler']>>[0]['payload'],
  base: string,
): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const candidat = i === 0 ? base : `${base}-${i + 1}`;
    const dejaLa = await payload.find({
      collection: 'bibliography',
      where: { slug: { equals: candidat } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    if (dejaLa.totalDocs === 0) return candidat;
  }
  // Cinquante homonymes la même année : ce n'est plus un cas d'usage.
  throw new Error('Trop de références partagent cette clé.');
}

export const importBibliographieEndpoint: Endpoint = {
  path: '/import-bibliographie',
  method: 'post',
  handler: async (req) => {
    if (!requireUser(req)) return errorResponse('Non authentifié.', 401, 'unauthenticated');

    // Le texte, et rien d'autre — sauf ce que quelqu'un a explicitement
    // saisi pour combler un manque. Accepter des champs déjà découpés
    // laisserait écrire n'importe quoi dans la bibliographie par une
    // requête forgée ; accepter un nom et une année tapés à la main est
    // autre chose : c'est précisément ce qu'on a demandé de fournir.
    const body = await readJsonBody<{ textes?: unknown; references?: unknown }>(req);
    const brutes = Array.isArray(body?.references)
      ? body.references
      : Array.isArray(body?.textes)
        ? body.textes.map((t) => ({ texte: t }))
        : [];

    const textes = brutes
      .map((r) => {
        const o = r as { texte?: unknown; nom?: unknown; annee?: unknown };
        if (typeof o?.texte !== 'string' || !o.texte.trim()) return null;
        const annee = Number(o.annee);
        return {
          texte: o.texte,
          nom: typeof o.nom === 'string' && o.nom.trim() ? o.nom.trim().slice(0, 120) : null,
          annee: Number.isInteger(annee) && annee >= 1700 && annee <= 3000 ? annee : null,
        };
      })
      .filter((r): r is { texte: string; nom: string | null; annee: number | null } => r !== null);

    if (textes.length === 0) return errorResponse('Aucune référence reçue.', 400, 'no_refs');
    if (textes.length > MAX_REFERENCES) {
      return errorResponse(
        `Trop de références en une fois (${MAX_REFERENCES} au maximum).`,
        400,
        'too_many',
      );
    }

    const resultats: Resultat[] = [];

    for (const entree of textes) {
      const lu = analyserReference(entree.texte);
      // Ce qui a été saisi l'emporte sur ce qui a été deviné : la
      // personne a le document sous les yeux, pas nous.
      const ref = {
        ...lu,
        nom: entree.nom ?? lu.nom,
        annee: entree.annee ?? lu.annee,
      };
      const manques = [
        !ref.nom && !ref.anonyme ? 'nom' : null,
        ref.annee == null ? 'année' : null,
      ].filter((m): m is string => m !== null);

      if (manques.length > 0 || ref.annee == null) {
        resultats.push({
          texte: ref.texte,
          erreur: `${manques.join(' et ')} introuvable${manques.length > 1 ? 's' : ''} — à saisir à la main.`,
        });
        continue;
      }

      try {
        // Rien à écrire si l'œuvre est déjà là : on rend l'entrée
        // existante, que l'appelant rattachera au billet comme si elle
        // venait d'être créée.
        const titre = ref.titre ?? ref.texte;
        const existante = await dejaPresente(req.payload, ref.annee, titre);
        if (existante) {
          resultats.push({
            texte: ref.texte,
            id: existante.id,
            label: existante.label,
            deja: true,
          });
          continue;
        }

        // Sans auteur·ice, la clé se dérive de la revue puis du titre :
        // il en faut une, et l'ancre doit rester lisible.
        const base = ref.nom ?? ref.editeur ?? (ref.titre ?? ref.texte).split(/\s+/).slice(0, 3).join(' ');
        const slug = await slugLibre(req.payload, slugDeReference(base, ref.annee));
        const doc = await req.payload.create({
          collection: 'bibliography',
          overrideAccess: true,
          data: {
            slug,
            type: ref.type,
            year: ref.annee,
            // Vide pour un texte non signé : la revue est la revue, elle
            // n'en devient pas l'autrice.
            authors: ref.nom
              ? [
                  // Autrice par défaut : c'est ce qu'annonce une
                  // bibliographie sauf mention contraire, et la mention
                  // contraire ne se lit pas dans une ligne de texte.
                  { lastName: ref.nom, firstName: ref.prenom ?? undefined, role: 'author' as const },
                ]
              : [],
            // Faute de titre isolé, la référence entière en tient lieu :
            // l'entrée reste reconnaissable et se corrige, là où un titre
            // inventé se serait fait passer pour une lecture.
            title: ref.titre ?? ref.texte.slice(0, 250),
            publisher: ref.editeur ?? undefined,
            url: ref.url ?? undefined,
            // Le texte d'origine, toujours. C'est lui qui fait foi si la
            // lecture s'est trompée.
            annotation: `Importé d’un document :\n${ref.texte}`,
            source: 'manual',
          },
        });
        resultats.push({
          texte: ref.texte,
          id: doc.id,
          label: `${ref.nom} (${ref.annee})`,
        });
      } catch (err) {
        req.payload.logger.warn(
          { err: (err as Error).message, texte: ref.texte.slice(0, 80) },
          'Création de référence impossible',
        );
        resultats.push({ texte: ref.texte, erreur: (err as Error).message });
      }
    }

    const crees = resultats.filter((r) => r.id != null).length;
    return jsonResponse(
      { ok: true, crees, refuses: resultats.length - crees, resultats },
      { status: 200 },
    );
  },
};
