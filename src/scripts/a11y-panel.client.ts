/**
 * Pilotage du panneau. Trois responsabilités, et rien d'autre :
 * poser les attributs sur <html>, les écrire dans localStorage,
 * refléter l'état dans les contrôles.
 *
 * Sur `astro:page-load` comme les autres scripts du chrome : avec le
 * ClientRouter, un module ne s'exécute qu'une fois par URL, et les
 * écouteurs posés à la première page seraient perdus dès la seconde.
 */
type Reglages = Record<string, string>;

/** Valeur qui vaut « éteint » pour chaque réglage — celle qu'on ne
 *  stocke pas et qui ne pose aucun attribut. */
const DEFAUTS: Reglages = {
  taille: '100',
  espacement: 'normal',
  police: 'defaut',
  contraste: 'normal',
  couleurs: 'normal',
  liens: 'normal',
  animations: 'normal',
  guide: 'off',
};

const CLE = 'a11y';

function lire(): Reglages {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return {};
    const obj = JSON.parse(brut) as unknown;
    return obj && typeof obj === 'object' ? (obj as Reglages) : {};
  } catch {
    return {};
  }
}

function ecrire(r: Reglages): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(r));
  } catch {
    /* Navigation privée : le réglage vaut pour cette session, ce qui
       est déjà mieux que rien. */
  }
}

/** Pose (ou retire) l'attribut correspondant sur <html>. */
function appliquer(cle: string, valeur: string): void {
  const attr = `data-a11y-${cle}`;
  if (!valeur || valeur === DEFAUTS[cle]) document.documentElement.removeAttribute(attr);
  else document.documentElement.setAttribute(attr, valeur);
}

document.addEventListener('astro:page-load', function () {
  const panneau = document.getElementById('panneau-accessibilite');
  const bouton = document.querySelector<HTMLButtonElement>('[data-a11y-menu]');
  if (!panneau || !bouton) return;

  let reglages = lire();

  // Le tiroir et le bouton sont remplacés à chaque navigation (ils ne
  // portent pas `transition:persist`), donc leurs écouteurs meurent
  // avec eux. Ceux posés sur `document`, en revanche, survivraient et
  // s'empileraient page après page en pointant vers des éléments
  // depuis longtemps détruits — d'où ce signal, coupé net à l'échange
  // de document. Même dispositif que la barre de progression.
  const ac = new AbortController();
  document.addEventListener('astro:before-swap', () => ac.abort(), { once: true });

  function refleter(): void {
    // Groupes de boutons radio.
    panneau!.querySelectorAll<HTMLInputElement>('[data-a11y-set]').forEach((el) => {
      const cle = el.dataset.a11ySet!;
      el.checked = (reglages[cle] ?? DEFAUTS[cle]) === el.value;
    });
    // Bascules.
    panneau!.querySelectorAll<HTMLInputElement>('[data-a11y-toggle]').forEach((el) => {
      const cle = el.dataset.a11yToggle!;
      el.checked = (reglages[cle] ?? DEFAUTS[cle]) === el.dataset.a11yOn;
    });
  }

  function poser(cle: string, valeur: string): void {
    if (valeur === DEFAUTS[cle]) delete reglages[cle];
    else reglages[cle] = valeur;
    appliquer(cle, valeur);
    ecrire(reglages);
    refleter();
    if (cle === 'guide') guide(valeur === 'on');
  }

  // ── Ouverture / fermeture ─────────────────────────────────────
  function ouvrir(): void {
    panneau!.hidden = false;
    panneau!.setAttribute('aria-hidden', 'false');
    // Deux images successives : sans ce délai, le navigateur groupe
    // le retrait de `hidden` et l'ajout de la classe, et la
    // translation n'est pas animée.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => (panneau!.dataset.ouvert = '')),
    );
    bouton!.setAttribute('aria-expanded', 'true');
    panneau!.querySelector<HTMLElement>('[data-a11y-close]')?.focus();
  }

  function fermer(rendreFocus = true): void {
    delete panneau!.dataset.ouvert;
    panneau!.setAttribute('aria-hidden', 'true');
    bouton!.setAttribute('aria-expanded', 'false');
    // `hidden` seulement une fois le mouvement fini, sinon le tiroir
    // disparaîtrait d'un coup au lieu de sortir par la droite.
    window.setTimeout(() => {
      if (!panneau!.hasAttribute('data-ouvert')) panneau!.hidden = true;
    }, 240);
    if (rendreFocus) bouton!.focus();
  }

  bouton.addEventListener('click', () => {
    if (panneau.hasAttribute('data-ouvert')) fermer();
    else ouvrir();
  });
  panneau.querySelector('[data-a11y-close]')?.addEventListener('click', () => fermer());

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && panneau.hasAttribute('data-ouvert')) fermer();
    },
    { signal: ac.signal },
  );

  // Clic hors du tiroir — sur le bouton lui-même, c'est son propre
  // écouteur qui bascule, sans quoi les deux se neutraliseraient.
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!panneau.hasAttribute('data-ouvert')) return;
      const cible = e.target as Node;
      if (panneau.contains(cible) || bouton.contains(cible)) return;
      fermer(false);
    },
    { signal: ac.signal },
  );

  // ── Contrôles ─────────────────────────────────────────────────
  panneau.querySelectorAll<HTMLInputElement>('[data-a11y-set]').forEach((el) => {
    el.addEventListener('change', () => {
      if (el.checked) poser(el.dataset.a11ySet!, el.value);
    });
  });
  panneau.querySelectorAll<HTMLInputElement>('[data-a11y-toggle]').forEach((el) => {
    el.addEventListener('change', () => {
      const cle = el.dataset.a11yToggle!;
      poser(cle, el.checked ? el.dataset.a11yOn! : DEFAUTS[cle]);
    });
  });
  panneau.querySelector('[data-a11y-reset]')?.addEventListener('click', () => {
    Object.keys(DEFAUTS).forEach((cle) => appliquer(cle, DEFAUTS[cle]));
    reglages = {};
    ecrire(reglages);
    refleter();
    guide(false);
  });

  // ── Guide de lecture ──────────────────────────────────────────
  // Le seul réglage qui demande du script à l'exécution : il suit le
  // pointeur. Écouteur posé à l'allumage et retiré à l'extinction,
  // plutôt que laissé en place à tester une condition — un mousemove
  // est l'évènement le plus fréquent d'une page.
  const cadre = document.querySelector<HTMLElement>('.a11y-guide');
  const haut = cadre?.querySelector<HTMLElement>('.a11y-guide__voile--haut');
  const fenetre = cadre?.querySelector<HTMLElement>('.a11y-guide__fenetre');
  const bas = cadre?.querySelector<HTMLElement>('.a11y-guide__voile--bas');
  const HAUTEUR = 96;

  function suivre(e: PointerEvent): void {
    if (!haut || !fenetre || !bas) return;
    const y = e.clientY;
    const h0 = Math.max(0, y - HAUTEUR / 2);
    haut.style.top = '0px';
    haut.style.height = h0 + 'px';
    fenetre.style.top = h0 + 'px';
    fenetre.style.height = HAUTEUR + 'px';
    bas.style.top = h0 + HAUTEUR + 'px';
    bas.style.bottom = '0px';
  }

  function guide(actif: boolean): void {
    if (actif)
      document.addEventListener('pointermove', suivre, { passive: true, signal: ac.signal });
    else document.removeEventListener('pointermove', suivre);
  }

  refleter();
  guide((reglages.guide ?? DEFAUTS.guide) === 'on');
});
