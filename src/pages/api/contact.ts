/**
 * Proxy Astro → Payload pour le formulaire de contact.
 *
 *   GET  /api/contact  → tire un défi (jeton signé + preuve à résoudre)
 *   POST /api/contact  → envoie le message
 *
 * Même rôle que /api/subscribe : le navigateur ne parle jamais
 * directement à Payload, ce qui évite d'avoir à gérer une URL absolue
 * côté client et de configurer CORS.
 *
 * Une différence importante avec le proxy d'abonnement : celui-ci
 * transmet l'IP réelle de l'appelant. Sans elle, la limitation « par
 * IP » de Payload voit toutes les requêtes arriver du même endroit et
 * devient un plafond global — le défaut que porte /api/subscribe
 * depuis toujours.
 *
 * Les deux routes répondent `no-store` : la réponse du GET contient un
 * défi à usage unique, qu'un cache servirait à plusieurs personnes —
 * la première enverrait son message, les suivantes se verraient
 * refuser un défi déjà consommé, sans que rien ne le signale.
 */
import type { APIRoute } from 'astro';

import { entetesProxy, getPayloadRaw, postPayload } from '../../lib/payload';

const ENTETES_JSON = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
} as const;

export const GET: APIRoute = async ({ request, clientAddress }) => {
  try {
    const { status, body } = await getPayloadRaw<unknown>(
      '/contact-challenge',
      entetesProxy(request, clientAddress),
    );
    return new Response(JSON.stringify(body), { status, headers: ENTETES_JSON });
  } catch (err) {
    console.warn('[api/contact] tirage du défi impossible :', (err as Error).message);
    return new Response(JSON.stringify({ ok: false, code: 'proxy_error' }), {
      status: 502,
      headers: ENTETES_JSON,
    });
  }
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let corps: unknown = {};
  try {
    corps = await request.json();
  } catch {
    /* corps illisible → Payload répondra invalid_body */
  }

  try {
    const { status, body } = await postPayload<unknown>(
      '/contact',
      corps,
      entetesProxy(request, clientAddress),
    );
    return new Response(JSON.stringify(body), { status, headers: ENTETES_JSON });
  } catch (err) {
    console.warn('[api/contact] envoi impossible :', (err as Error).message);
    return new Response(JSON.stringify({ ok: false, code: 'proxy_error' }), {
      status: 502,
      headers: ENTETES_JSON,
    });
  }
};
