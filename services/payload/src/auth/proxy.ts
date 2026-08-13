/**
 * Garde d'accès direct — refuse ce qui n'a pas transité par le site.
 *
 * nginx expose `/cms/*` en même temps que le site : les endpoints
 * publics de Payload sont donc joignables sans passer par Astro. Or
 * c'est Astro qui pose `x-real-ip`. Sans cette garde, on appelle
 * l'endpoint en direct, on écrit soi-même l'IP qu'on veut, et toute
 * limitation « par IP » tombe — il suffit d'un compteur qui s'incrémente
 * dans l'en-tête.
 *
 * Le secret est partagé entre les deux moitiés de l'application par
 * INTERNAL_PROXY_SECRET, qu'`entetesProxy()` joint côté Astro.
 *
 * Facultatif, délibérément : l'exiger ferait répondre 403 à tout
 * déploiement qui ne l'a pas encore posé — un formulaire muet est pire
 * qu'un formulaire moins gardé. Son absence est signalée une fois par
 * route dans les journaux.
 *
 * Ce fichier vivait dans endpoints/contact.ts, où il ne gardait qu'une
 * route ; l'abonnement en avait autant besoin.
 */
import { safeEqualHex } from './crypto';

const signales = new Set<string>();

/**
 * @param route  Nom de la route, pour le journal d'absence de secret.
 */
export function proxyLegitime(headers: Headers, route: string): boolean {
  const attendu = process.env.INTERNAL_PROXY_SECRET;
  if (!attendu) {
    if (!signales.has(route)) {
      signales.add(route);
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'proxy_secret_absent',
          route,
          message: `INTERNAL_PROXY_SECRET non défini : ${route} est joignable sans passer par le site, la limitation par IP est contournable.`,
        }),
      );
    }
    return true;
  }
  return safeEqualHex(headers.get('x-tituba-proxy'), attendu);
}
