/**
 * Réponse à servir quand le CMS ne répond pas.
 *
 * Les pages d'index savaient déjà se rabattre sur des valeurs par
 * défaut : privées de contenu, elles s'affichent vides mais entières.
 * Les pages d'entité, elles, n'ont rien à afficher sans leur objet — et
 * l'appel qui va le chercher n'était pas protégé. Une panne de Payload y
 * remontait donc une erreur brute, et le visiteur voyait une trace de
 * pile. La page « introuvable » elle-même en faisait partie, si bien
 * qu'aucune sortie propre n'existait.
 *
 * 503 et non 404 : la ressource existe peut-être très bien, c'est nous
 * qui ne pouvons pas la lire. La distinction compte pour les moteurs de
 * recherche, qui désindexent un 404 et repassent après un 503.
 *
 * `Retry-After` en secondes : un redémarrage de Payload prend environ
 * deux minutes (cf CLAUDE.md).
 */
export function serviceIndisponible(ou: string, err: unknown): Response {
  console.warn(`[${ou}] CMS injoignable :`, (err as Error)?.message ?? err);
  return new Response(
    "Le site ne parvient pas à joindre sa base de contenu. C'est temporaire — " +
      'réessayez dans un instant.',
    {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Retry-After': '120',
        // Une panne ne doit jamais être mise en cache : la page
        // reviendrait vide longtemps après le retour du CMS.
        'Cache-Control': 'no-store',
      },
    },
  );
}
