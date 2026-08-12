/**
 * Amélioration progressive du formulaire de contact.
 *
 * Sans ce script la page fonctionne : le <form> a un `action` et un
 * `method`, la soumission native part en POST et le frontmatter la
 * traite. Ce script ajoute deux choses — la preuve de travail, et
 * l'envoi sans rechargement.
 *
 * La preuve de travail démarre au premier focus dans un champ, pas au
 * chargement : inutile de faire chauffer le processeur de tous les
 * gens qui passent sans écrire. Comme il faut ensuite plusieurs
 * dizaines de secondes pour rédiger, elle est prête bien avant
 * l'envoi et ne coûte rien d'attendre.
 */
document.addEventListener('astro:page-load', function () {
  const form = document.querySelector<HTMLFormElement>('[data-contact-form]');
  if (!form) return;

  const champSolution = form.querySelector<HTMLInputElement>('[data-contact-solution]');
  const statut = form.querySelector<HTMLElement>('[data-contact-statut]');
  const bouton = form.querySelector<HTMLButtonElement>('button[type="submit"]');

  const sel = form.dataset.sel ?? '';
  const cible = form.dataset.cible ?? '';
  const max = Number(form.dataset.max ?? 0);

  /** Résolution en cours ou terminée. `null` = pas encore lancée. */
  let resolution: Promise<number | null> | null = null;

  function hex(buf: ArrayBuffer): string {
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Cherche le nombre dont le haché vaut la cible.
   *
   * Recherche bornée : au pire `max` hachés, jamais plus. C'est ce
   * qui rend le temps d'attente prévisible, là où une recherche de
   * zéros en tête peut s'éterniser sans plafond sur un appareil lent.
   *
   * Pas de Web Worker : `crypto.subtle.digest` est asynchrone, chaque
   * `await` rend la main à la boucle d'évènements, donc l'interface
   * ne gèle pas pendant le calcul.
   */
  async function resoudre(): Promise<number | null> {
    if (!sel || !cible || !max || !globalThis.crypto?.subtle) return null;
    const encodeur = new TextEncoder();
    const debut = performance.now();
    for (let n = 0; n <= max; n += 1) {
      const h = hex(await crypto.subtle.digest('SHA-256', encodeur.encode(sel + n)));
      if (h === cible) return n;
      // Garde-fou : sur un appareil très lent ou une implémentation
      // pathologique, on abandonne plutôt que de bloquer l'envoi. Le
      // serveur accepte un envoi sans preuve.
      if (n % 2000 === 0 && performance.now() - debut > 15000) return null;
    }
    return null;
  }

  function lancer(): void {
    if (!resolution) resolution = resoudre();
  }

  /**
   * L'objet envoyé : le libellé lisible de l'option choisie, ou le
   * texte libre si « Autre ». C'est le libellé et non la valeur
   * technique qui part, puisqu'il devient l'objet du mail reçu — et
   * il est lu sur l'option elle-même plutôt que redupliqué ici, pour
   * qu'ajouter une entrée à la liste n'oblige pas à toucher ce script.
   */
  function objetChoisi(choix: string, autre: string): string {
    if (choix === 'autre') return autre;
    if (!choix) return '';
    const select = form!.querySelector<HTMLSelectElement>('[name="objetChoix"]');
    return select?.selectedOptions[0]?.text.trim() ?? '';
  }
  form.addEventListener('focusin', lancer, { once: true });

  form.addEventListener('submit', async function (e) {
    // `crypto.subtle` n'existe pas hors contexte sécurisé : on laisse
    // alors la soumission native faire son travail.
    if (!globalThis.crypto?.subtle || !globalThis.fetch) return;
    e.preventDefault();

    const donnees = new FormData(form);
    const lire = (c: string) => String(donnees.get(c) ?? '').trim();

    // Validation côté client, pour éviter un aller-retour inutile —
    // le serveur revérifie tout de toute façon.
    const manquant = (['nom', 'email', 'message'] as const).find((c) => !lire(c));
    if (manquant) {
      const champ = form.querySelector<HTMLElement>(`[name="${manquant}"]`);
      champ?.setAttribute('aria-invalid', 'true');
      champ?.focus();
      if (statut) statut.textContent = 'Merci de remplir les champs obligatoires.';
      return;
    }
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));

    if (bouton) bouton.disabled = true;
    lancer();
    if (statut) statut.textContent = 'Vérification puis envoi…';

    const solution = await resolution;
    if (champSolution) champSolution.value = solution === null ? '' : String(solution);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: lire('nom'),
          email: lire('email'),
          objet: objetChoisi(lire('objetChoix'), lire('objetAutre')),
          message: lire('message'),
          reference: lire('reference'),
          jeton: lire('jeton'),
          solution,
        }),
      });
      const corps = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string };
      if (corps.ok) {
        // Le formulaire disparaît au profit de la confirmation : le
        // laisser en place inviterait à renvoyer le même message, que
        // le défi consommé ferait de toute façon échouer.
        const ok = document.createElement('p');
        ok.className = form.dataset.classeSucces ?? '';
        ok.setAttribute('role', 'status');
        ok.innerHTML =
          '<strong>Message envoyé.</strong> Nous vous répondrons à l’adresse indiquée. Merci d’avoir pris le temps de nous écrire.';
        form.replaceWith(ok);
        ok.focus?.();
        return;
      }
      if (statut) statut.textContent = messageErreur(corps.code);
    } catch {
      if (statut) {
        statut.textContent =
          'L’envoi a échoué — vérifiez votre connexion. Votre message est toujours là.';
      }
    } finally {
      if (bouton) bouton.disabled = false;
    }
  });

  /** Doublon volontaire de src/lib/contact.ts : ce script est envoyé
   *  au navigateur, il ne peut pas importer un module serveur. */
  function messageErreur(code: string | undefined): string {
    const table: Record<string, string> = {
      rate_limited:
        'Vous avez déjà envoyé plusieurs messages récemment. Réessayez dans une heure — nous avons bien reçu les précédents.',
      saturated:
        'Le formulaire reçoit trop de messages en ce moment et s’est mis en pause. Réessayez dans une heure.',
      too_fast: 'Le formulaire a été envoyé trop vite. Patientez un instant et réessayez.',
      expired_token:
        'Le formulaire est resté ouvert trop longtemps. Rechargez la page — votre message est toujours affiché, vous pourrez le recoller.',
      already_used: 'Ce message a déjà été envoyé.',
      invalid_token: 'Le formulaire n’est plus valide. Rechargez la page et réessayez.',
      invalid_proof: 'La vérification anti-robot a échoué. Rechargez la page et réessayez.',
      invalid_nom: 'Merci d’indiquer votre nom.',
      invalid_email: 'Cette adresse e-mail ne semble pas valide.',
      invalid_message: 'Votre message doit faire au moins dix caractères.',
      send_failed:
        'Le message n’a pas pu être envoyé — c’est notre serveur de courrier, pas vous. Réessayez dans quelques minutes.',
      no_recipient:
        'Le formulaire n’est pas encore configuré de notre côté. Réessayez plus tard.',
    };
    return (
      (code && table[code]) || 'Le message n’a pas pu être envoyé. Réessayez dans quelques minutes.'
    );
  }
});
