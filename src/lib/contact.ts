/**
 * Les messages d'erreur du formulaire de contact, partagés par la page
 * et son proxy.
 *
 * Le transport de l'IP et l'authentification du proxy vivaient ici ;
 * ils ont rejoint lib/payload.ts (`entetesProxy`), parce qu'ils ne
 * concernent pas le contact mais toute route qui relaie vers Payload —
 * l'abonnement en avait besoin aussi.
 */

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
