// Easter egg: spam the nav logo and the page cracks like glass, then shatters
// into a hidden arcade. Only this listener ships with every page — the glass,
// the arcade and the game are imported the first time someone starts spamming.

const STREAK_GAP = 700; // ms between clicks that still counts as spamming
const CRACK_FROM = 3; // click that draws the first crack
const SHATTER_AT = 7; // click that breaks the glass
const HEAL_AFTER = 3000; // ms of no clicks before the cracks start to heal

type Glass = typeof import('./glass');

let glass: Promise<Glass> | null = null;
let streak = 0;
let lastClick = 0;
let impact: { x: number; y: number } | null = null;
let healTimer: ReturnType<typeof setTimeout> | undefined;
let broken = false; // shattered, or the arcade is open
let keyNav = false; // the logo was pressed from the keyboard and is taking us home

// When the page will be still enough to photograph: after a navigation has
// landed, and after a fresh load's intro has played (performance.now() counts
// from the load).
const INTRO_MS = 2700;
let settled = INTRO_MS;

const loadGlass = () => (glass ??= import('./glass'));

// Click two: a hairline crack where it landed, fading about as fast as the
// streak would lapse. Enough to say the logo is glass before the real crack
// on click three grows from the same spot. Drawn here, not by the glass
// module, which is only starting to load.
let hairline: SVGSVGElement | null = null;
let hairlineAt: { x: number; y: number } | null = null;

function tease(at: { x: number; y: number }) {
  hairline?.remove();
  hairlineAt = at;
  let d = '';
  const n = 4 + Math.round(Math.random());
  for (let k = 0; k < n; k++) {
    // A ray with one kink, like the main cracks.
    const a = ((k + Math.random() * 0.6) / n) * Math.PI * 2;
    const len = 8 + Math.random() * 9;
    const bend = a + (Math.random() - 0.5) * 0.7;
    const mx = Math.cos(a) * len * 0.55;
    const my = Math.sin(a) * len * 0.55;
    d += `M0 0L${mx.toFixed(1)} ${my.toFixed(1)}L${(mx + Math.cos(bend) * len * 0.45).toFixed(1)} ${(my + Math.sin(bend) * len * 0.45).toFixed(1)}`;
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '-20 -20 40 40');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = `position:fixed;left:${at.x - 20}px;top:${at.y - 20}px;width:40px;height:40px;z-index:2147483000;pointer-events:none;overflow:visible`;
  // A light line beside a dark one, so it reads on any background.
  svg.innerHTML =
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${d}" pathLength="1" transform="translate(.6 .6)" stroke="rgba(255,255,255,.85)" stroke-width="1.6"/>` +
    `<path d="${d}" pathLength="1" stroke="rgba(17,17,17,.55)" stroke-width="1"/></g>` +
    `<circle r="1.3" fill="rgba(255,255,255,.9)" stroke="rgba(17,17,17,.5)" stroke-width=".6"/>`;
  document.documentElement.appendChild(svg);
  hairline = svg;
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const path of svg.querySelectorAll('path')) {
      path.style.strokeDasharray = '1';
      path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 90, easing: 'ease-out', fill: 'both' });
    }
  }
  svg.animate([{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }], { duration: 1000, fill: 'forwards' }).onfinish = () => {
    svg.remove();
    if (hairline === svg) hairline = null;
  };
}

function onClick(e: MouseEvent) {
  // While broken the glass or the arcade covers the logo anyway.
  if (broken || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  // Every click on every page comes through here. Only ones on the logo, or on
  // <html> mid-transition, are worth the layout read below.
  const target = e.target as Element | null;
  if (target !== document.documentElement && !target?.closest?.('.nav-brand')) return;
  const brand = document.querySelector<HTMLAnchorElement>('#site-nav .nav-brand');
  if (!brand) return;
  // Count by position, not target: mid view-transition the click lands on
  // <html>, and a streak started on another page shouldn't lose those hits.
  const r = brand.getBoundingClientRect();
  const onBrand = e.detail === 0
    ? (e.target as Element | null)?.closest?.('.nav-brand') === brand
    : e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (!onBrand) return;

  // The event's own timestamp, not "now": if the main thread is busy for a
  // moment, queued clicks still count as the streak they were.
  // Once the glass shows a crack, the streak lives as long as the crack does.
  const now = e.timeStamp;
  streak = impact || now - lastClick < STREAK_GAP ? streak + 1 : 1;
  lastClick = now;

  // A single click is still just the home link. Once it turns into a streak,
  // the logo stops navigating and starts taking hits. Already home, there's
  // nowhere to go: scroll up instead of replaying the intro under the cursor.
  const here = new URL(brand.href).pathname === location.pathname;
  if (streak === 1) {
    hairlineAt = null;
    if (here) {
      e.preventDefault();
      if (scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
    } else keyNav = e.detail === 0;
    return;
  }
  e.preventDefault();

  // Keyboard activation has no pointer position — crack from the logo's centre.
  const point = e.detail === 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: e.clientX, y: e.clientY };
  if (streak === 2) {
    tease(point);
    loadGlass().then((g) => g.warm(settled));
    return;
  }

  // The crack grows from where the hairline was.
  impact ??= hairlineAt ?? point;
  const at = impact;
  const hit = streak - CRACK_FROM + 1;
  clearTimeout(healTimer);

  if (streak >= SHATTER_AT) {
    broken = true;
    streak = 0;
    impact = null;
    loadGlass().then(async (g) => {
      await g.shatter(at);
      broken = false;
      // Back from the arcade: focus returns to what opened it.
      document.querySelector<HTMLElement>('#site-nav .nav-brand')?.focus({ preventScroll: true });
    });
    return;
  }

  loadGlass().then((g) => {
    g.crack(hit, at);
    // The real crack paints on the next frame; the hairline goes with it.
    const h = hairline;
    hairline = null;
    if (h) requestAnimationFrame(() => h.remove());
  });
  healTimer = setTimeout(async () => {
    const g = await loadGlass();
    // A hit while it mends picks the streak back up; only a full heal ends it.
    if (await g.heal()) {
      streak = 0;
      impact = null;
    }
  }, HEAL_AFTER);
}

export function initEasterEgg() {
  // Capture phase, so this runs before Astro's router decides to navigate.
  document.addEventListener('click', onClick, true);
  // A streak that starts on another page navigates home first.
  document.addEventListener('astro:before-preparation', () => {
    settled = Infinity;
    glass?.then((g) => g.settle(Infinity));
  });
  document.addEventListener('astro:after-swap', () => {
    settled = performance.now() + 900;
    glass?.then((g) => g.settle(settled));
  });
  // The swap drops focus to the page. Someone pressing Enter on the logo
  // gets it back there, so the next press still lands on it (the router's
  // live region still announces the new page).
  document.addEventListener('astro:page-load', () => {
    if (!keyNav) return;
    keyNav = false;
    document.querySelector<HTMLElement>('#site-nav .nav-brand')?.focus({ preventScroll: true });
  });
}
