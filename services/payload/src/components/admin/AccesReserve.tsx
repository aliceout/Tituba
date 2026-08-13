// Garde-fou de vue — réserve un écran de l'admin aux administratrices.
//
// La nav masque déjà les sections « Config site » et « Gestion » aux
// autres rôles, mais masquer une entrée n'empêche pas d'atteindre son
// URL. Les règles d'accès des collections et des globaux, elles,
// refusent bien l'écriture — un `editor` qui forçait l'adresse voyait
// donc un formulaire qu'il ne pouvait pas enregistrer, ce qui ne se
// distingue pas d'une panne.
//
// Le contrôle est fait côté serveur, dans l'enveloppe de chaque vue :
// le composant client n'est jamais rendu, donc pas de formulaire qui
// s'affiche puis disparaît après hydratation.
//
// Ce n'est pas la sécurité — celle-ci vit dans `access` (cf
// access/roles.ts), et y restera même si cet écran change. C'est ce qui
// évite de proposer une action impossible.

import React from 'react';
import { getPayload } from 'payload';
import { headers } from 'next/headers';

import config from '@/payload.config';
import CarnetPage from './CarnetPage';

/** Rôle de la personne connectée, résolu depuis les cookies. */
export async function roleCourant(): Promise<string | null> {
  try {
    const payload = await getPayload({ config });
    const auth = await payload.auth({ headers: await headers() });
    return (auth?.user as { role?: string } | undefined)?.role ?? null;
  } catch {
    // Session illisible : on traite comme non autorisé plutôt que de
    // laisser passer. Le pire cas est un écran de refus injustifié, pas
    // un accès accordé par erreur.
    return null;
  }
}

export async function estAdministratrice(): Promise<boolean> {
  const r = await roleCourant();
  return r === 'admin' || r === 'root';
}

/** Écran de refus, dans le gabarit du reste de l'admin. */
export default function AccesReserve({ titre }: { titre: string }): React.ReactElement {
  return (
    <CarnetPage
      variant="editview"
      modifier="reserve"
      crumbs={[{ href: '/cms/admin', label: 'Tituba' }, { label: titre }]}
    >
      <div className="tituba-editview__hero">
        <h1 className="tituba-h1">Accès réservé</h1>
      </div>
      <section className="tituba-editview__section">
        <p className="tituba-editview__section-help">
          Cet écran est réservé aux administratrices du site. Votre compte peut publier et modifier
          du contenu, mais pas toucher à la configuration ni aux comptes.
        </p>
        <p className="tituba-editview__section-help">
          Si vous pensez devoir y accéder, demandez à une administratrice de faire évoluer votre
          rôle.
        </p>
      </section>
    </CarnetPage>
  );
}
