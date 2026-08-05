// Menus déroulants du header (NavDropdown) : ouverture au clic, fermeture
// au clic extérieur, à Échap et à l'ouverture d'un autre menu. L'état vit
// dans aria-expanded et l'attribut hidden — pas de classe parallèle, donc
// l'accessibilité et le visuel ne peuvent pas diverger. Un seul contrôleur
// partagé entre toutes les instances de NavDropdown plutôt qu'un script
// par instance : "fermer les autres" a besoin de les connaître toutes.
//
// Rejoué sur `astro:page-load` : avec le ClientRouter, un module ne
// s'exécute qu'une fois par URL, et le header — reconstruit à chaque
// échange de document — repartait sans écouteur dès la deuxième page.
// Les menus ne s'ouvraient alors plus du tout.
document.addEventListener('astro:page-load', () => {
  const menus = Array.from(document.querySelectorAll<HTMLElement>('[data-nav-menu]'));
  if (!menus.length) return;

  // Les écouteurs de clic et de touche portent sur `document`, qui
  // survit à la navigation : sans révocation il s'en empilerait un par
  // page visitée, chacun refermant des menus détruits depuis longtemps.
  const ac = new AbortController();
  document.addEventListener('astro:before-swap', () => ac.abort(), { once: true });

  function panelOf(menu: HTMLElement) {
    return menu.querySelector<HTMLElement>('[data-nav-menu-panel]');
  }
  function btnOf(menu: HTMLElement) {
    return menu.querySelector<HTMLButtonElement>('[data-nav-menu-btn]');
  }
  function close(menu: HTMLElement) {
    const p = panelOf(menu);
    const b = btnOf(menu);
    if (!p || !b) return;
    p.hidden = true;
    b.setAttribute('aria-expanded', 'false');
  }
  function closeAll(except: HTMLElement | null) {
    for (const m of menus) if (m !== except) close(m);
  }
  function open(menu: HTMLElement) {
    const p = panelOf(menu);
    const b = btnOf(menu);
    if (!p || !b) return;
    closeAll(menu);
    p.hidden = false;
    b.setAttribute('aria-expanded', 'true');
  }

  for (const menu of menus) {
    const b = btnOf(menu);
    if (!b) continue;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = b.getAttribute('aria-expanded') === 'true';
      if (isOpen) close(menu);
      else open(menu);
    });
    // Le focus qui sort du menu le referme : indispensable au clavier,
    // sinon on tabule dans un panneau invisible plus bas dans la page.
    //
    // Mais un clic de souris sur un lien du panneau commence lui aussi
    // par faire sortir le focus du bouton, et `relatedTarget` vaut alors
    // le lien ou `null` selon le navigateur — tous ne donnent pas le
    // focus à un lien au clic. Dans le second cas, fermer aussitôt
    // escamotait le lien entre l'enfoncement et le relâchement : le clic
    // n'atteignait plus rien et la navigation n'avait pas lieu.
    //
    // On ne ferme donc pas tant qu'un pointeur est enfoncé dans le menu,
    // et la décision est reportée d'une image — le temps que le focus
    // soit réellement posé quelque part. On interroge `activeElement`
    // plutôt que `relatedTarget`, qui n'est renseigné de façon fiable
    // par aucun navigateur dans ce cas de figure.
    let pointeurDansMenu = false;
    menu.addEventListener('pointerdown', () => {
      pointeurDansMenu = true;
    });
    document.addEventListener(
      'pointerup',
      () => {
        pointeurDansMenu = false;
      },
      { signal: ac.signal },
    );
    menu.addEventListener('focusout', () => {
      if (pointeurDansMenu) return;
      requestAnimationFrame(() => {
        if (!menu.contains(document.activeElement)) close(menu);
      });
    });
  }

  document.addEventListener(
    'click',
    (e) => {
      if (!menus.some((m) => m.contains(e.target as Node))) closeAll(null);
    },
    { signal: ac.signal },
  );
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const openMenu = menus.find((m) => btnOf(m)?.getAttribute('aria-expanded') === 'true');
    if (!openMenu) return;
    close(openMenu);
    // On rend le focus au bouton : sans ça, Échap laisse le focus dans
    // le vide et la navigation clavier repart du début du document.
    btnOf(openMenu)?.focus();
  }, { signal: ac.signal });
});
