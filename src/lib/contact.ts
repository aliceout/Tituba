/**
 * Ce que la page /contact/ et son proxy partagent : la transmission de
 * l'IP réelle jusqu'à Payload, et l'authentification du proxy.
 *
 * Les deux chemins d'envoi — la soumission native sans JavaScript,
 * traitée dans le frontmatter de la page, et l'appel fetch, passé par
 * /api/contact — doivent poser exactement les mêmes en-têtes. Les
 * écrire deux fois, c'est se garantir qu'ils divergeront.
 */

/**
 * IP réelle de l'appelant, telle qu'on peut la connaître derrière un
 * proxy inverse.
 *
 * `x-forwarded-for` est une liste, du client vers le proxy le plus
 * proche : le premier saut est le seul qui nous intéresse. Il est
 * falsifiable par le client, mais nginx le réécrit — la valeur ne vaut
 * donc que ce que vaut la configuration du serveur, et c'est pourquoi
 * le coupe-circuit global existe à côté de la limitation par IP.
 */
export function ipReelle(request: Request, clientAddress?: string): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const premier = xff.split(',')[0]?.trim();
    if (premier) return premier;
  }
  return request.headers.get('x-real-ip')?.trim() || clientAddress || 'unknown';
}

/**
 * En-têtes à transmettre à Payload : l'IP, et la preuve que l'appel
 * vient bien du site.
 *
 * Le secret partagé n'est posé que s'il est configuré. Payload, de son
 * côté, ne l'exige que dans le même cas — les deux se mettent d'accord
 * sur son absence plutôt que de tomber en panne (cf. endpoints/contact.ts).
 */
export function entetesContact(request: Request, clientAddress?: string): Record<string, string> {
  const entetes: Record<string, string> = { 'x-real-ip': ipReelle(request, clientAddress) };
  const secret = process.env.INTERNAL_PROXY_SECRET;
  if (secret) entetes['x-tituba-proxy'] = secret;
  return entetes;
}

/** Réponses possibles de l'endpoint, et ce qu'on en dit à la personne. */
export const MESSAGES_ERREUR: Record<string, string> = {
  rate_limited:
    'Vous avez déjà envoyé plusieurs messages récemment. Réessayez dans une heure — nous avons bien reçu les précédents.',
  saturated:
    'Le formulaire reçoit trop de messages en ce moment et s’est mis en pause. Réessayez dans une heure.',
  too_fast: 'Le formulaire a été envoyé trop vite. Réessayez, il devrait passer.',
  expired_token:
    'Le formulaire est resté ouvert trop longtemps. Renvoyez-le : votre message est conservé ci-dessous.',
  already_used: 'Ce message a déjà été envoyé.',
  invalid_token: 'Le formulaire n’est plus valide. Rechargez la page et réessayez.',
  invalid_proof: 'La vérification anti-robot a échoué. Rechargez la page et réessayez.',
  invalid_nom: 'Merci d’indiquer votre nom.',
  invalid_email: 'Cette adresse e-mail ne semble pas valide.',
  invalid_objet: 'L’objet est trop long.',
  invalid_message: 'Votre message doit faire au moins dix caractères.',
  send_failed:
    'Le message n’a pas pu être envoyé — c’est notre serveur de courrier, pas vous. Réessayez dans quelques minutes.',
  no_recipient:
    'Le formulaire n’est pas encore configuré de notre côté. Réessayez plus tard, nous en sommes informé·es.',
  direct_access: 'Requête refusée.',
  proxy_error: 'Le service est momentanément indisponible. Réessayez dans quelques minutes.',
};

export function messageErreur(code: string | undefined): string {
  return (
    (code && MESSAGES_ERREUR[code]) ||
    'Le message n’a pas pu être envoyé. Réessayez dans quelques minutes.'
  );
}
