// Compact sticky : la classe `is-scrolled` est posée dès qu'on a quitté
// le haut de page. Listener passif + rAF pour éviter le jank.
(function () {
  const el = document.getElementById('site-header');
  if (!el) return;
  let ticking = false;
  function update() {
    ticking = false;
    el!.classList.toggle('is-scrolled', window.scrollY > 4);
  }
  document.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  update();
})();
