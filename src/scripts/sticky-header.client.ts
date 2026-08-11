// Compact sticky : l’attribut `data-defile` est posé dès qu'on a quitté
// le haut de page. Listener passif + rAF pour éviter le jank.
//
// Un attribut et non une classe : la mise en forme du header est en
// utilitaires Tailwind, qui ne génère que les classes lues dans les
// sources — une classe née ici n’existerait dans aucune feuille.
//
// Rejoué sur `astro:page-load` : avec le ClientRouter, un module ne
// s'exécute qu'une fois par URL, et le header est reconstruit à chaque
// échange de document — sans ça, il resterait figé dans son état haut
// après la première navigation, quelle que soit la position de lecture.
document.addEventListener('astro:page-load', () => {
  const el = document.getElementById('site-header');
  if (!el) return;

  // L'écouteur porte sur `document`, qui survit à la navigation : sans
  // révocation il s'en empilerait un par page visitée, tous pointant
  // vers un header détruit depuis longtemps.
  const ac = new AbortController();
  document.addEventListener('astro:before-swap', () => ac.abort(), { once: true });

  let ticking = false;
  function update() {
    ticking = false;
    if (window.scrollY > 4) el!.dataset.defile = '';
    else delete el!.dataset.defile;
  }
  document.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true, signal: ac.signal },
  );
  update();
});
