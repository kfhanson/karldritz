import { initShader } from './shader';
import { initEasterEgg } from './egg';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

// ── Scroll-reveal: .reveal, .cascade and the About headline ──
// All CSS transitions toggled by one class, so the compositor animates them.
// .cascade siblings get a --d stagger so a column that enters together still
// reads as a sequence.
let revealObserver: IntersectionObserver | null = null;

function initReveal() {
  revealObserver?.disconnect();
  const elements = document.querySelectorAll<HTMLElement>('.reveal, .cascade, [data-about-title]');
  if (!elements.length) return;

  const seen = new Map<Element, number>();
  elements.forEach((el) => {
    if (!el.classList.contains('cascade')) return;
    const parent = el.parentElement ?? document.body;
    const i = seen.get(parent) ?? 0;
    seen.set(parent, i + 1);
    el.style.setProperty('--d', `${i * 70}ms`);
  });

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

// ── Gallery accordion: active slide takes the row, the rest collapse to tabs ──
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
  const caption = document.querySelector<HTMLElement>('[data-cf-caption]');
  const indexEl = document.querySelector<HTMLElement>('[data-cf-index]');
  const textEl = document.querySelector<HTMLElement>('[data-cf-text]');
  const GAP = 12; // must match .coverflow-track gap
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const n = slides.length;
  let active = 0;

  const render = (animate = true) => {
    const W = el.clientWidth;
    if (!W) return; // not laid out yet — the ResizeObserver re-fires
    if (!animate) el.classList.add('no-anim');

    // Tabs share ~30% of the row, clamped so they stay legible; the active
    // slide gets everything else.
    const tabW = W < 640 ? 44 : Math.min(112, Math.max(56, Math.floor((W * 0.3) / Math.max(1, n - 1))));
    const activeW = W - (n - 1) * (tabW + GAP);
    // Row height follows a 16:9 active slide, capped so it never becomes a wall.
    const h = Math.min(Math.round((activeW * 9) / 16), Math.round(window.innerHeight * 0.62), 620);
    el.style.height = `${h}px`;

    slides.forEach((s, i) => {
      const isActive = i === active;
      s.style.width = `${isActive ? activeW : tabW}px`;
      s.classList.toggle('is-active', isActive);
      s.setAttribute('aria-current', isActive ? 'true' : 'false');
      // Only the open slide's video plays; the rest pause on their poster.
      const vid = s.querySelector('video');
      if (vid) {
        if (isActive && !reduce) vid.play().catch(() => {});
        else vid.pause();
      }
    });

    prev?.toggleAttribute('disabled', active === 0);
    next?.toggleAttribute('disabled', active === n - 1);

    if (!animate) {
      void track.offsetWidth; // flush layout before re-enabling transitions
      el.classList.remove('no-anim');
    }
  };

  const setCaption = () => {
    if (indexEl) indexEl.textContent = `${pad2(active + 1)} / ${pad2(n)}`;
    if (textEl) textEl.textContent = slides[active].dataset.caption ?? '';
  };
  let captionTimer: ReturnType<typeof setTimeout> | undefined;
  const swapCaption = () => {
    if (!caption || reduce) return setCaption();
    caption.classList.add('is-swapping');
    clearTimeout(captionTimer);
    captionTimer = setTimeout(() => {
      setCaption();
      caption.classList.remove('is-swapping');
    }, 220);
  };

  const go = (i: number) => {
    const target = Math.max(0, Math.min(n - 1, i));
    if (target === active) return;
    active = target;
    render();
    swapCaption();
  };

  render(false); // first paint: snap into place, no animation
  setCaption();

  if (n > 1) {
    slides.forEach((s, i) => s.addEventListener('click', () => i !== active && go(i)));
    prev?.addEventListener('click', () => go(active - 1));
    next?.addEventListener('click', () => go(active + 1));

    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Project gallery — use arrow keys');
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

  // Re-render whenever the row gets or changes width (also covers the case
  // where it has no width yet at init).
  const ro = new ResizeObserver(() => render(false));
  ro.observe(el);

  // Only decode video while the gallery is actually on screen. Without this the
  // active clip keeps playing (1080p, 60fps) the whole time the reader is
  // scrolling through the case study below it.
  const io = new IntersectionObserver(
    ([entry]) => {
      const vid = slides[active].querySelector('video');
      if (!vid) return;
      if (entry.isIntersecting && !reduce) vid.play().catch(() => {});
      else vid.pause();
    },
    { threshold: 0.15 }
  );
  io.observe(el);

  coverflowCleanup = () => {
    ro.disconnect();
    io.disconnect();
    clearTimeout(captionTimer);
  };
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

// ── About: experience timeline ──
// The spine fills to a "reading line" ~70% down the viewport; nodes light once
// that line passes them and stay lit. One rAF-throttled scroll listener.
let timelineCleanup: (() => void) | null = null;

function initTimeline() {
  timelineCleanup?.();
  timelineCleanup = null;

  const tl = document.querySelector<HTMLElement>('[data-timeline]');
  if (!tl) return;
  const spine = tl.querySelector<HTMLElement>('.tl-spine');
  const items = Array.from(tl.querySelectorAll<HTMLElement>('.tl-item'));
  if (!spine || !items.length) return;

  if (prefersReducedMotion) {
    tl.style.setProperty('--tl-progress', '1');
    items.forEach((it) => it.classList.add('is-lit'));
    return;
  }

  const nodes = items.map((it) => it.querySelector<HTMLElement>('.tl-node')!);
  let progress = 0;
  let raf = 0;

  const update = () => {
    raf = 0;
    const line = window.innerHeight * 0.7;
    const r = spine.getBoundingClientRect();
    // Monotonic: the line never retreats, so lit nodes stay consistent with it.
    progress = Math.max(progress, Math.min(1, Math.max(0, (line - r.top) / r.height)));
    tl.style.setProperty('--tl-progress', progress.toFixed(4));
    nodes.forEach((n, i) => {
      const b = n.getBoundingClientRect();
      if (b.top + b.height / 2 <= line) items[i].classList.add('is-lit');
    });
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();

  timelineCleanup = () => {
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    cancelAnimationFrame(raf);
  };
}

// ── Animated SVG thumbnails: run only while on screen ──
// CSS keeps every animation inside [data-anim-thumb] paused until data-playing
// is set, so off-screen cards cost nothing.
let thumbObserver: IntersectionObserver | null = null;

function initAnimatedThumbs() {
  thumbObserver?.disconnect();
  const thumbs = document.querySelectorAll<HTMLElement>('[data-anim-thumb]');
  if (!thumbs.length) return;

  thumbObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        (entry.target as HTMLElement).dataset.playing = entry.isIntersecting ? 'true' : 'false';
      }
    },
    // Play only when a good chunk of the card is actually visible, so at most
    // one or two thumbs animate at a time.
    { threshold: 0.3 }
  );
  thumbs.forEach((el) => thumbObserver!.observe(el));
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
// Stop the shader's rAF before the swap so it doesn't contend for the main
// thread while the cross-fade paints.
document.addEventListener('astro:before-swap', () => {
  shaderCleanup?.();
  shaderCleanup = null;
});

// Document-level listener: survives view transitions, so it's bound once.
initEasterEgg();

// astro:page-load fires on initial load and after every view transition.
document.addEventListener('astro:page-load', () => {
  initNav();
  initReveal();
  initHeroShader();
  initCoverflow();
  initGridHoverVideos();
  initAnimatedThumbs();
  initTimeline();
});
