// Script de chrome, pas de page : il ne s'accroche pas à
// `astro:page-load`. La barre étant persistée, ré-exécuter ce bloc à
// chaque navigation empilerait les écouteurs sur les mêmes éléments.
// Le drapeau sur `window` le garantit même si le module venait à être
// rejoué.
(function () {
  type Episode = { src: string; titre: string; cover?: string | null; href?: string };
  type Fenetre = Window & {
    titubaPodcast?: {
      ouvrir(ep: Episode): void;
      basculer(): void;
      joue(src: string): boolean;
    };
    __titubaDockPret?: boolean;
  };
  const fenetre = window as Fenetre;
  if (fenetre.__titubaDockPret) return;
  fenetre.__titubaDockPret = true;

  const dock = document.querySelector<HTMLElement>('[data-podcast-dock]');
  if (!dock) return;
  const audio = dock.querySelector<HTMLAudioElement>('[data-audio]')!;
  const seek = dock.querySelector<HTMLInputElement>('[data-seek]')!;
  const now = dock.querySelector<HTMLElement>('[data-now]')!;
  const total = dock.querySelector<HTMLElement>('[data-total]')!;
  const play = dock.querySelector<HTMLButtonElement>('[data-play]')!;
  const close = dock.querySelector<HTMLButtonElement>('[data-close]')!;
  const speed = dock.querySelector<HTMLButtonElement>('[data-speed]')!;
  const cover = dock.querySelector<HTMLImageElement>('[data-cover]')!;
  const titre = dock.querySelector<HTMLAnchorElement>('[data-titre]')!;
  const piste = dock.querySelector<HTMLElement>('[data-piste]')!;
  const trace = dock.querySelector<SVGPathElement>('[data-trace]')!;
  const traceReste = dock.querySelector<SVGPathElement>('[data-trace-reste]')!;
  const clip = dock.querySelector<SVGRectElement>('[data-clip]')!;

  // ─── Tracé ondulé ────────────────────────────────────────────────
  // Longueur d'onde et amplitude en pixels, indépendantes de la
  // largeur de la barre : une onde qui s'étirerait avec la fenêtre
  // n'aurait pas le même grain sur un téléphone et sur un écran large.
  const PAS = 30;
  const AMPLITUDE = 3.5;

  /**
   * Sinusoïde échantillonnée en segments droits. Une courbe de Bézier
   * donnerait le même dessin en moins de points, mais au prix d'un
   * calcul de tangentes ; à dix points par période l'œil ne distingue
   * pas la différence.
   */
  function construireOnde(largeur: number): string {
    const pasEchantillon = PAS / 10;
    let d = '';
    for (let x = 0; x <= largeur; x += pasEchantillon) {
      const y = 7 - Math.sin((x / PAS) * Math.PI * 2) * AMPLITUDE;
      d += `${d ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    const yFin = 7 - Math.sin((largeur / PAS) * Math.PI * 2) * AMPLITUDE;
    d += `L${largeur.toFixed(2)} ${yFin.toFixed(2)}`;
    return d;
  }

  function chrono(s: number): string {
    if (!Number.isFinite(s) || s < 0) return '--:--';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const deux = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${deux(m)}:${deux(sec)}` : `${m}:${deux(sec)}`;
  }

  // Découpe l'onde à la position lue. En pixels et non en pourcentage :
  // la découpe et le tracé doivent tomber au même point, or le tracé
  // est construit en pixels (longueur d'onde constante).
  function peindre(): void {
    const max = Number(seek.max) || 1;
    const part = Math.min(Math.max(Number(seek.value) / max, 0), 1);
    clip.setAttribute('width', String(part * piste.clientWidth));
  }

  function redessiner(): void {
    const d = construireOnde(piste.clientWidth);
    trace.setAttribute('d', d);
    // Même tracé pour les deux couches : c'est une seule onde, dont
    // seule la couleur change de part et d'autre de la position lue.
    traceReste.setAttribute('d', d);
    // La découpe est en pixels : à largeur changée, elle ne
    // désignerait plus la même fraction de l'épisode.
    peindre();
  }
  new ResizeObserver(redessiner).observe(piste);

  // La barre recouvre le bas de la page : on rend au document la
  // hauteur qu'elle lui prend, sans quoi les dernières lignes du pied
  // deviennent inatteignables. Reposé après chaque navigation, le
  // <body> étant neuf à chaque fois.
  function caler(): void {
    document.body.style.paddingBottom = dock!.hidden ? '' : `${dock!.offsetHeight}px`;
  }
  window.addEventListener('resize', caler);
  document.addEventListener('astro:page-load', caler);

  /**
   * Prévient les boutons de la page de l'état courant — lecture en
   * cours, et où elle en est. La position sert à l'anneau de
   * progression qui cercle le rond de lecture (cf PodcastLaunch) :
   * sans elle, les boutons ne sauraient que jouer/en pause.
   */
  function annoncer(): void {
    const duree = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    document.dispatchEvent(
      new CustomEvent('tituba:podcast', {
        detail: {
          src: audio.currentSrc || audio.src,
          joue: !audio.paused,
          part: duree ? Math.min(Math.max(audio.currentTime / duree, 0), 1) : 0,
        },
      }),
    );
  }

  // ─── Lecture ─────────────────────────────────────────────────────
  audio.addEventListener('loadedmetadata', () => {
    // La durée du fichier fait foi sur celle de la fiche : c'est la
    // seule des deux que le lecteur ne peut pas contredire.
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      seek.max = String(audio.duration);
      total.textContent = chrono(audio.duration);
      peindre();
    }
  });

  // Vrai pendant un glissement de la poignée : le suivi du temps est
  // alors suspendu, sans quoi chaque `timeupdate` repositionnerait la
  // poignée sous le doigt qui la déplace.
  let enTrainDeDeplacer = false;

  audio.addEventListener('timeupdate', () => {
    if (enTrainDeDeplacer) return;
    seek.value = String(audio.currentTime);
    now.textContent = chrono(audio.currentTime);
    peindre();
    // Environ quatre fois par seconde : de quoi faire avancer l'anneau
    // des boutons de la page sans qu'on voie de saccade.
    annoncer();
  });

  audio.addEventListener('play', () => {
    dock.dataset.joue = '';
    play.setAttribute('aria-label', "Mettre l'épisode en pause");
    annoncer();
  });
  audio.addEventListener('pause', () => {
    delete dock.dataset.joue;
    play.setAttribute('aria-label', "Lire l'épisode");
    annoncer();
  });
  audio.addEventListener('ended', () => {
    delete dock.dataset.joue;
    audio.currentTime = 0;
    annoncer();
  });

  play.addEventListener('click', () => {
    if (audio.paused) void audio.play();
    else audio.pause();
  });

  close.addEventListener('click', () => {
    audio.pause();
    dock.hidden = true;
    caler();
    annoncer();
  });

  seek.addEventListener('pointerdown', () => {
    enTrainDeDeplacer = true;
  });
  // Sur `window` et non sur la poignée : un glissement se termine
  // souvent le curseur sorti de la piste, et l'écouteur local
  // manquerait alors le relâchement — la lecture resterait figée.
  window.addEventListener('pointerup', () => {
    if (!enTrainDeDeplacer) return;
    enTrainDeDeplacer = false;
    audio.currentTime = Number(seek.value);
  });
  seek.addEventListener('input', () => {
    now.textContent = chrono(Number(seek.value));
    peindre();
    // Au clavier, les flèches émettent `input` sans jamais passer par
    // un pointeur : le déplacement doit alors s'appliquer tout de
    // suite, sinon la touche ne fait rien d'audible.
    if (!enTrainDeDeplacer) audio.currentTime = Number(seek.value);
  });

  dock.querySelectorAll<HTMLButtonElement>('[data-skip]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pas = Number(btn.dataset.skip ?? 0);
      const max = Number.isFinite(audio.duration) ? audio.duration : Number(seek.max);
      audio.currentTime = Math.min(Math.max(audio.currentTime + pas, 0), max);
    });
  });

  const vitesses = [1, 1.25, 1.5, 2];
  let iVitesse = 0;
  speed.addEventListener('click', () => {
    iVitesse = (iVitesse + 1) % vitesses.length;
    audio.playbackRate = vitesses[iVitesse];
    // Virgule décimale française, et pas de « ,00 » pour 1× et 2× : la
    // vitesse se lit d'un coup d'œil, elle n'a pas à être gabaritée
    // comme un montant.
    speed.textContent = `${String(vitesses[iVitesse]).replace('.', ',')}×`;
  });

  // ─── Interface offerte aux boutons de page ───────────────────────
  fenetre.titubaPodcast = {
    ouvrir(ep) {
      const memeEpisode = audio.src && new URL(audio.src, location.href).href ===
        new URL(ep.src, location.href).href;
      if (!memeEpisode) {
        audio.src = ep.src;
        audio.currentTime = 0;
        seek.value = '0';
        total.textContent = '--:--';
        now.textContent = '0:00';
      }
      titre.textContent = ep.titre;
      titre.href = ep.href ?? '#';
      if (ep.cover) {
        cover.src = ep.cover;
        cover.hidden = false;
      } else {
        cover.hidden = true;
      }
      if (dock.hidden) {
        dock.hidden = false;
        caler();
        // Le tracé se construit sur une largeur mesurée : tant que la
        // barre était masquée, cette largeur valait zéro.
        redessiner();
      }
    },
    basculer() {
      if (audio.paused) void audio.play();
      else audio.pause();
    },
    joue(src) {
      if (audio.paused || !audio.src) return false;
      return new URL(audio.src, location.href).href === new URL(src, location.href).href;
    },
  };
})();
