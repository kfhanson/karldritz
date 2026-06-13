import Lenis from 'lenis';
import { initShader } from './shader';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Lenis smooth scroll: one instance for the whole session ──
const lenis = new Lenis({
  duration: 1.0,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  orientation: 'vertical',
  gestureOrientation: 'vertical',
  smoothWheel: !prefersReducedMotion,
});

function raf(time: number) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// ── Navigation scroll / dark-hero state ──
let navCleanup: (() => void) | null = null;

function initNav() {
  navCleanup?.();
  const nav = document.getElementById('site-nav');
  if (!nav) return;

  // Pages with a dark hero (the home page) mark the nav themselves.
  const darkHero = nav.dataset.darkHero === 'true';
  // Over the dark hero the nav stays unstyled for a full viewport;
  // on light pages it gets its backdrop almost immediately.
  const threshold = darkHero ? window.innerHeight - 80 : 10;

  const onScroll = () => {
    const scrolled = window.scrollY > threshold;
    nav.classList.toggle('nav-scrolled', scrolled);
    nav.classList.toggle('nav-dark', darkHero && !scrolled);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  navCleanup = () => window.removeEventListener('scroll', onScroll);
}

// ── Scroll-reveal fade-ups ──
let revealObserver: IntersectionObserver | null = null;

function initReveal() {
  revealObserver?.disconnect();
  const elements = document.querySelectorAll<HTMLElement>('.reveal');
  if (!elements.length) return;

  revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver!.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '-60px 0px' }
  );
  elements.forEach((el) => revealObserver!.observe(el));
}

// ── Coverflow carousel: active card expands, neighbours collapse to slats ──
let coverflowCleanup: (() => void) | null = null;

function initCoverflow() {
  coverflowCleanup?.();
  coverflowCleanup = null;

  const el = document.getElementById('coverflow');
  const track = el?.querySelector<HTMLElement>('[data-track]');
  if (!el || !track) return;
  const slides = Array.from(track.querySelectorAll<HTMLElement>('[data-slide]'));
  if (!slides.length) return;

  const prev = document.getElementById('cf-prev');
  const next = document.getElementById('cf-next');
  const SIDE_W = [0, 92, 66, 46]; // widths by distance 1..3 (px)
  const HR = [1, 0.9, 0.84, 0.78]; // height ratio (of active height) by distance 0..3
  const GAP = 16; // px between visible cards
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active = 0;

  const activeWidth = () => Math.min(760, Math.max(300, el.clientWidth * 0.9));

  const render = (animate = true) => {
    if (!el.clientWidth) return; // not laid out yet — the ResizeObserver re-fires
    if (!animate) el.classList.add('no-anim');

    const aw = activeWidth();
    const ah = Math.round((aw * 9) / 16); // active card is 16:9
    el.style.height = `${ah}px`; // container follows the active card

    const widths = slides.map((_, i) => {
      const ad = Math.abs(i - active);
      return ad === 0 ? aw : ad <= 3 ? SIDE_W[ad] : 0;
    });

    slides.forEach((s, i) => {
      const ad = Math.abs(i - active);
      const visible = ad <= 3;
      s.style.width = `${widths[i]}px`;
      s.style.height = `${Math.round((visible ? HR[ad] : HR[3]) * ah)}px`;
      s.style.marginLeft = s.style.marginRight = visible ? `${GAP / 2}px` : '0px';
      s.style.opacity = visible ? '1' : '0';
      s.style.cursor = visible && ad !== 0 ? 'pointer' : 'default';
      s.style.pointerEvents = visible ? 'auto' : 'none';
      // Depth shadow only on the centred card (overflow:hidden can't clip it,
      // so on the thin slats it would bleed out).
      s.style.boxShadow = ad === 0 ? '0 24px 55px -22px rgb(0 0 0 / 0.4)' : 'none';
      // Only the centred card's video plays; the rest pause (poster shown).
      const vid = s.querySelector('video');
      if (vid) {
        if (ad === 0 && !reduce) vid.play().catch(() => {});
        else vid.pause();
      }
    });

    // Translate the track so the active card sits dead-centre.
    let leftEdge = 0;
    for (let i = 0; i < active; i++) {
      leftEdge += widths[i] + (Math.abs(i - active) <= 3 ? GAP : 0);
    }
    const activeCenter = leftEdge + GAP / 2 + widths[active] / 2;
    track.style.transform = `translateX(${el.clientWidth / 2 - activeCenter}px)`;

    prev?.toggleAttribute('disabled', active === 0);
    next?.toggleAttribute('disabled', active === slides.length - 1);

    if (!animate) {
      void track.offsetWidth; // flush layout before re-enabling transitions
      el.classList.remove('no-anim');
    }
  };

  const go = (n: number) => {
    active = Math.max(0, Math.min(slides.length - 1, n));
    render();
  };

  render(false); // first paint: snap into place, no animation

  if (slides.length > 1) {
    slides.forEach((s, i) => s.addEventListener('click', () => i !== active && go(i)));
    prev?.addEventListener('click', () => go(active - 1));
    next?.addEventListener('click', () => go(active + 1));

    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Project image carousel — use arrow keys');
    el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(active - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(active + 1); }
    });

    let startX = 0;
    let dragging = false;
    el.addEventListener('pointerdown', (e) => { startX = e.clientX; dragging = true; });
    el.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 40) go(active + (dx < 0 ? 1 : -1));
    });
  }

  // Re-render whenever the carousel gets or changes width. This also covers the
  // case where it has no width yet at init (intermittent "blank until refresh").
  const ro = new ResizeObserver(() => render(false));
  ro.observe(el);
  coverflowCleanup = () => ro.disconnect();
}

// ── Grid hover videos: play while the card is hovered, reset on leave ──
function initGridHoverVideos() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; // poster stays
  const videos = document.querySelectorAll<HTMLVideoElement>('video[data-hover-video]');
  videos.forEach((v) => {
    if (v.dataset.bound) return;
    v.dataset.bound = '1';
    const card = v.closest<HTMLElement>('.group\\/img') ?? v.parentElement;
    if (!card) return;
    card.addEventListener('pointerenter', () => v.play().catch(() => {}));
    card.addEventListener('pointerleave', () => {
      v.pause();
      v.currentTime = 0;
    });
  });
}

// ── Hero shader ──
let shaderCleanup: (() => void) | null = null;

function initHeroShader() {
  shaderCleanup?.();
  shaderCleanup = null;
  const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-shader]');
  if (canvas) shaderCleanup = initShader(canvas);
}

// ── View-transition lifecycle ──
// Lenis vs. scroll reset. Lenis drives scroll from a rAF loop with a cached
//    position. On navigation Astro resets scroll to the top, but Lenis keeps
//    writing the OLD page's offset every frame — the two fight while the
//    cross-fade paints, which reads as a stutter/jump. So freeze Lenis (and
//    stop the shader's rAF, which otherwise contends for the main thread during
//    the snapshot) before the swap, then resync Lenis to the new page and resume.
document.addEventListener('astro:before-swap', () => {
  lenis.stop();
  shaderCleanup?.();
  shaderCleanup = null;
});

document.addEventListener('astro:after-swap', () => {
  // Jump Lenis's internal state to the freshly-reset scroll position so it
  // doesn't lerp back toward the previous page's offset.
  lenis.scrollTo(0, { immediate: true, force: true });
  lenis.resize();
  lenis.start();
});

// astro:page-load fires on initial load and after every view transition.
document.addEventListener('astro:page-load', () => {
  initNav();
  initReveal();
  initHeroShader();
  initCoverflow();
  initGridHoverVideos();
});
