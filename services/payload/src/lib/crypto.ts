/**
 * Chiffrement applicatif des secrets stockés en DB (clés API tierces,
 * tokens, etc.) — AES-256-GCM avec une clé dérivée de PAYLOAD_SECRET.
 *
 * Format des valeurs chiffrées : `zenc:<base64(iv | authtag | ciphertext)>`.
 * Le préfixe `zenc:` permet de distinguer une valeur déjà chiffrée d'une
 * valeur en clair fraîchement saisie (idempotence du hook beforeChange :
 * si la valeur arrive avec `zenc:`, on la laisse passer sans rechiffrer).
 *
 * Le secret de référence est `process.env.PAYLOAD_SECRET` (déjà utilisé
 * par Payload pour signer les JWT). On en dérive une clé AES via SHA-256
 * — déterministe, pas de salt, donc rotation = perte des données chiffrées
 * existantes (acceptable pour notre cas : si on régénère PAYLOAD_SECRET
 * en prod on doit re-saisir les clés API, c'est documenté).
 *
 * NE JAMAIS exposer la clé déchiffrée via l'API REST. Les afterRead hooks
 * remplacent la valeur par un placeholder masqué — le déchiffrement
 * effectif n'a lieu qu'au sein des endpoints serveur qui ont besoin de
 * la valeur claire (ex. le sync Zotero).
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const PREFIX = 'zenc:';
const ALGO = 'aes-256-gcm';
const IV_LEN = 16; // 96 bits recommandés pour GCM (12), mais 128 acceptés et plus simples ici
const TAG_LEN = 16;

function getKey(): Buffer {
  const secret = process.env.PAYLOAD_SECRET;
  if (!secret) {
    throw new Error(
      'PAYLOAD_SECRET manquant — impossible de chiffrer/déchiffrer les secrets applicatifs.',
    );
  }
  return createHash('sha256').update(secret).digest();
}

/**
 * Indique si une chaîne est déjà au format chiffré (préfixe `zenc:`).
 * Utilisé par les hooks beforeChange pour rester idempotents.
 */
export function isEncrypted(s: unknown): s is string {
  return typeof s === 'string' && s.startsWith(PREFIX);
}

/**
 * Chiffre une valeur en clair avec AES-256-GCM. Renvoie une string
 * `zenc:<base64>` qui peut être stockée telle quelle en DB. Si la valeur
 * est déjà au format chiffré, elle est renvoyée inchangée (idempotence).
 */
export function encrypt(plaintext: string): string {
  if (isEncrypted(plaintext)) return plaintext;
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

/**
 * Déchiffre une valeur au format `zenc:<base64>`. Lève une erreur si
 * le format est invalide ou si l'auth tag ne matche pas (clé fausse,
 * payload altéré). Renvoie la string en clair sinon.
 */
export function decrypt(token: string): string {
  if (!isEncrypted(token)) {
    throw new Error('decrypt() : valeur non chiffrée (préfixe `zenc:` manquant).');
  }
  const raw = Buffer.from(token.slice(PREFIX.length), 'base64');
  if (raw.length < IV_LEN + TAG_LEN) {
    throw new Error('decrypt() : payload trop court.');
  }
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = raw.subarray(IV_LEN + TAG_LEN);
  const key = getKey();
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/**
 * Masque une clé chiffrée pour affichage admin : renvoie un placeholder
 * du type `••••••••XXXX` où XXXX = 4 derniers caractères de la valeur
 * en clair. Utilisé par les afterRead hooks pour donner un indice visuel
 * sans exposer la clé.
 *
 * Si la valeur n'est pas chiffrée (cas legacy ou déjà masquée), renvoie
 * tel quel.
 */
export function maskSecret(token: unknown): string {
  if (!isEncrypted(token)) {
    return typeof token === 'string' ? token : '';
  }
  try {
    const plain = decrypt(token);
    if (plain.length <= 4) return '••••';
    return '••••••••' + plain.slice(-4);
  } catch {
    return '••••••••';
  }
}
