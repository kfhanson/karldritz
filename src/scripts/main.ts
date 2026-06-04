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

// ── Hero shader ──
let shaderCleanup: (() => void) | null = null;

function initHeroShader() {
  shaderCleanup?.();
  shaderCleanup = null;
  const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-shader]');
  if (canvas) shaderCleanup = initShader(canvas);
}

// ── First-load intro: once the hero entrance has played, compress replays ──
function markIntroPlayed() {
  if (!document.querySelector('.hero-intro')) return;
  if (document.documentElement.classList.contains('intro-played')) return;
  // Wait until the full sequence (~2.6s) has finished before flipping the
  // class, so the running animation's delays aren't re-evaluated mid-play.
  window.setTimeout(() => {
    document.documentElement.classList.add('intro-played');
    try {
      sessionStorage.setItem('introPlayed', '1');
    } catch {}
  }, 2800);
}

// astro:page-load fires on initial load and after every view transition.
document.addEventListener('astro:page-load', () => {
  initNav();
  initReveal();
  initHeroShader();
  markIntroPlayed();
});
