// Au boot : promeut le premier user existant en root s'il n'a pas
// encore de rôle attribué (cas d'une base créée avant l'ajout du
// système de rôles). Idempotent.

import type { Payload } from 'payload';

export async function bootstrapRootUser(payload: Payload): Promise<void> {
  try {
    // « Y a-t-il un root ? » se demande à la collection entière.
    //
    // La question était posée à un échantillon de deux comptes, pris
    // dans l'ordre par défaut — donc les deux plus récents. Un root plus
    // ancien qu'eux passait inaperçu : la promotion se rejouait à chaque
    // démarrage, et sur le plus ancien compte, quel qu'il soit. Sans
    // conséquence tant que ce compte était déjà le root ; mais elle
    // repose aussi `status: 'active'`, si bien qu'un compte désactivé à
    // dessein se serait rouvert tout seul, avec les pleins droits, au
    // premier redémarrage venu.
    const roots = await payload.find({
      collection: 'users',
      where: { role: { equals: 'root' } },
      limit: 1,
      overrideAccess: true,
      depth: 0,
    });
    if (roots.totalDocs > 0) return;

    // Aucun root mais des users existent → on prend le plus ancien et
    // on le promeut. status=active.
    const oldest = await payload.find({
      collection: 'users',
      limit: 1,
      overrideAccess: true,
      depth: 0,
      sort: 'createdAt',
    });
    const candidate = oldest.docs[0] as
      | { id: number | string; email: string; role?: string }
      | undefined;
    if (!candidate) return;

    await payload.update({
      collection: 'users',
      id: candidate.id,
      overrideAccess: true,
      data: {
        role: 'root',
        status: 'active',
      },
    });
    payload.logger.info(
      { email: candidate.email },
      'bootstrap_promoted_first_user_to_root',
    );
  } catch (err) {
    payload.logger.error({ err }, 'bootstrap_root_user_failed');
  }
}
