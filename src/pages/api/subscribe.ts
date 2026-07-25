/**
 * Proxy Astro → Payload pour l'inscription publique aux alertes mail.
 *
 *   POST /api/subscribe  body { email }
 *
 * Pourquoi ce proxy plutôt qu'un fetch direct depuis le navigateur vers
 * `/cms/api/subscribers/subscribe` :
 *
 *  - En dev, Astro tourne sur `:4321` et Payload sur `:3001` → un
 *    fetch relatif côté browser cible Astro, qui n'a pas la route et
 *    renvoie 404. Le proxy résout via `process.env.PAYLOAD_INTERNAL_URL`
 *    côté serveur (Astro SSR), qui pointe sur le bon hôte.
 *  - En prod (Astro + Payload sur le même domaine via nginx), le proxy
 *    est juste un hop de plus mais simplifie le code client (pas
 *    d'URL absolue à gérer).
 *  - Bonus : l'origine du navigateur n'est jamais exposée à Payload, ce
 *    qui simplifie la config CORS (rien à autoriser).
 *
 * Le rate-limit / la validation / l'envoi du mail sont faits côté
 * Payload (cf endpoints/subscribers.ts). Ce proxy se contente de
 * forwarder le body et la réponse.
 */
import type { APIRoute } from 'astro';

import { postPayload } from '../../lib/payload';

export const POST: APIRoute = async ({ request }) => {
  let email = '';
  try {
    const data = (await request.json()) as { email?: unknown };
    email = String(data?.email ?? '').trim();
  } catch {
    /* body non-JSON → email reste vide, Payload renverra invalid_email */
  }

  try {
    const { status, body } = await postPayload<unknown>(
      '/subscribers/subscribe',
      { email },
    );
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.warn('[api/subscribe] proxy failed:', (err as Error).message);
    return new Response(
      JSON.stringify({ ok: false, code: 'proxy_error' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
