// Menus déroulants du header (NavDropdown) : ouverture au clic, fermeture
// au clic extérieur, à Échap et à l'ouverture d'un autre menu. L'état vit
// dans aria-expanded et l'attribut hidden — pas de classe parallèle, donc
// l'accessibilité et le visuel ne peuvent pas diverger. Un seul contrôleur
// partagé entre toutes les instances de NavDropdown plutôt qu'un script
// par instance : "fermer les autres" a besoin de les connaître toutes.
(function () {
  const menus = Array.from(document.querySelectorAll<HTMLElement>('[data-nav-menu]'));
  if (!menus.length) return;

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
    menu.addEventListener('focusout', (e) => {
      if (!menu.contains(e.relatedTarget as Node)) close(menu);
    });
  }

  document.addEventListener('click', (e) => {
    if (!menus.some((m) => m.contains(e.target as Node))) closeAll(null);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const openMenu = menus.find((m) => btnOf(m)?.getAttribute('aria-expanded') === 'true');
    if (!openMenu) return;
    close(openMenu);
    // On rend le focus au bouton : sans ça, Échap laisse le focus dans
    // le vide et la navigation clavier repart du début du document.
    btnOf(openMenu)?.focus();
  });
})();
