// Au boot : promeut le premier user existant en root s'il n'a pas
// encore de rôle attribué (cas d'une base créée avant l'ajout du
// système de rôles). Idempotent.

import type { Payload } from 'payload';

export async function bootstrapRootUser(payload: Payload): Promise<void> {
  try {
    const allUsers = await payload.find({
      collection: 'users',
      limit: 2,
      overrideAccess: true,
      depth: 0,
      pagination: false,
    });
    if (allUsers.totalDocs === 0) return; // Premier setup, register-first-user fera le boulot.

    const hasRoot = (allUsers.docs as Array<{ role?: string }>).some((u) => u.role === 'root');
    if (hasRoot) return;

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
