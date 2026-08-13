// Primitives crypto pour le système d'auth (invitations, OTP email, devices).
//
// Toutes les valeurs sensibles vont en base sous forme hachée :
//  - Tokens d'invitation, codes OTP email, fingerprints de devices
//    → hash SHA-256 (pas besoin de bcrypt : grande entropie, courte
//    durée de vie).
//
// Les comparaisons de tokens se font en temps constant.

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

const HEX = /^[0-9a-fA-F]+$/;

/**
 * Comparaison en temps constant de deux condensats HEXADÉCIMAUX.
 *
 * Le contrôle de forme n'est pas de la coquetterie, c'est ce qui empêche
 * la fonction de mentir. `Buffer.from(x, 'hex')` ne lève rien sur une
 * chaîne qui n'est pas de l'hexadécimal : il s'arrête au premier
 * caractère invalide et rend ce qu'il a lu — donc zéro octet si le
 * premier caractère ne convient pas. Et `timingSafeEqual` sur deux
 * tampons vides répond `true`.
 *
 * Conséquence, mesurée : deux chaînes quelconques de même longueur et
 * sans hexadécimal en tête étaient déclarées ÉGALES. Là où les deux
 * côtés sortent de `hashToken`/`hmacHex`, le défaut ne pouvait pas se
 * produire ; il a mordu là où l'un des deux venait d'une variable
 * d'environnement (cf. auth/proxy.ts, qui emploie désormais `safeEqual`).
 *
 * Pour comparer autre chose que de l'hexadécimal — un secret partagé,
 * une phrase — c'est `safeEqual` qu'il faut.
 */
export function safeEqualHex(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  if (!HEX.test(a) || !HEX.test(b)) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Comparaison en temps constant de deux chaînes quelconques.
 *
 * Compare les octets du texte lui-même, sans décodage préalable : rien
 * à supposer sur la forme de ce qu'on lui donne. C'est ce qu'il faut
 * pour un secret partagé, dont on ne choisit pas toujours l'alphabet.
 *
 * La longueur, elle, fuit — comme dans toute comparaison de ce genre.
 * Sur un secret tiré au hasard, ça ne renseigne sur rien.
 */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// Token d'invitation, lien de reset, identifiant de device : 32 octets en
// base64url (43 chars). Entropie 256 bits, URL-safe, lisible dans un mail.
export function generateUrlSafeToken(): string {
  return randomBytes(32).toString('base64url');
}

// Code OTP email : 6 chiffres. randomInt évite le biais modulo.
export function generateNumericCode(digits = 6): string {
  const max = 10 ** digits;
  return randomInt(0, max).toString().padStart(digits, '0');
}

// HMAC-SHA256 hex pour signer un identifiant. Utilisé pour le lien de
// désabonnement dans les mails d'alerte de nouveau billet : pas besoin
// de stocker un token séparé en DB, on signe l'id du subscriber avec
// PAYLOAD_SECRET et on vérifie au clic. Pas de rejouabilité (l'action
// est idempotente — désabo flip vers `unsubscribed` quoi qu'il arrive).
export function hmacHex(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message, 'utf8').digest('hex');
}
