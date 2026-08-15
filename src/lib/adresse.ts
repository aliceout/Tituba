/**
 * L'adresse publique du site, lue à l'exécution.
 *
 * ─── Pourquoi cette fonction existe ─────────────────────────────────
 *
 * Astro fige `site` au moment de la construction : la valeur passée à
 * `astro.config.mjs` est recopiée dans le bundle, et `Astro.site` la rend
 * telle quelle à chaque requête. Une image Docker construite pour un
 * domaine ne pouvait donc servir que celui-là — il fallait reconstruire
 * pour changer d'adresse, et la chaîne d'intégration devait connaître le
 * domaine pour fabriquer l'image.
 *
 * Le site est rendu à la demande (`output: 'server'`), donc rien
 * n'oblige à figer quoi que ce soit : l'adresse peut se lire dans
 * l'environnement du conteneur, au moment où l'on rend la page. C'est
 * déjà ce que fait `lib/payload.ts` pour l'URL des médias.
 *
 * Conséquence : la même image sert n'importe quel domaine, et la
 * construction n'a plus besoin d'aucun secret.
 *
 * ─── Ce qu'elle attend ──────────────────────────────────────────────
 *
 * `ADDRESS`, avec ou sans schème — la convention Infisical est de
 * stocker le domaine nu, et `https://` est ajouté s'il manque. Le repli
 * `http://localhost:4321` est celui du développement, où la variable
 * n'est pas toujours posée.
 *
 * Volontairement pas de valeur mise en cache au chargement du module :
 * un module se charge une fois par process, et on veut que la variable
 * relue à chaque appel reflète l'environnement réel du conteneur — y
 * compris si quelqu'un la change et redémarre.
 */
const REPLI = 'http://localhost:4321';

/** Racine publique, sans barre oblique finale. */
export function adresseSite(): string {
  const brut = (process.env.ADDRESS ?? '').trim() || REPLI;
  const avecScheme = /^https?:\/\//.test(brut) ? brut : `https://${brut}`;
  return avecScheme.replace(/\/+$/, '');
}

/**
 * Une URL absolue vers un chemin du site.
 *
 * Le chemin est résolu contre la racine publique, jamais contre l'hôte
 * de la requête : un site derrière un proxy voit arriver des requêtes
 * sur `localhost`, et une URL canonique qui pointe sur `localhost` ne
 * vaut rien — c'est précisément ce qu'une canonique doit empêcher.
 */
export function urlAbsolue(chemin: string): string {
  return new URL(chemin, `${adresseSite()}/`).toString();
}
