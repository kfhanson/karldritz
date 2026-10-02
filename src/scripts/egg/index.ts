// Easter egg: spam the nav logo and the page cracks like glass, then shatters
// into a hidden arcade. Only this listener ships with every page — the glass,
// the arcade and the game are imported the first time someone starts spamming.

const STREAK_GAP = 700; // ms between clicks that still counts as spamming
const CRACK_FROM = 3; // click that draws the first crack
const SHATTER_AT = 7; // click that breaks the glass
const HEAL_AFTER = 1600; // ms of no clicks before the cracks fade

type Glass = typeof import('./glass');

let glass: Promise<Glass> | null = null;
let streak = 0;
let lastClick = 0;
let impact: { x: number; y: number } | null = null;
let healTimer: ReturnType<typeof setTimeout> | undefined;
let broken = false; // shattered, or the arcade is open

const loadGlass = () => (glass ??= import('./glass'));

function onClick(e: MouseEvent) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const brand = document.querySelector<HTMLAnchorElement>('#site-nav .nav-brand');
  if (!brand) return;
  // Count by position, not target: mid view-transition the click lands on
  // <html>, and a streak started on another page shouldn't lose those hits.
  const r = brand.getBoundingClientRect();
  const onBrand = e.detail === 0
    ? (e.target as Element | null)?.closest?.('.nav-brand') === brand
    : e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  // While broken the glass or the arcade covers the logo anyway.
  if (!onBrand || broken) return;

  // The event's own timestamp, not "now": if the main thread is busy for a
  // moment, queued clicks still count as the streak they were.
  const now = e.timeStamp;
  streak = now - lastClick < STREAK_GAP ? streak + 1 : 1;
  lastClick = now;

  // A single click is still just the home link. Once it turns into a streak,
  // the logo stops navigating and starts taking hits. Already home, there's
  // nowhere to go: scroll up instead of replaying the intro under the cursor.
  const here = new URL(brand.href).pathname === location.pathname;
  if (streak === 1) {
    if (here) {
      e.preventDefault();
      if (scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return;
  }
  e.preventDefault();

  if (streak === 2) {
    loadGlass().then((g) => g.warm());
    return;
  }

  // Keyboard activation has no pointer position — crack from the logo's centre.
  if (!impact) {
    impact = e.detail === 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: e.clientX, y: e.clientY };
  }
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
    });
    return;
  }

  loadGlass().then((g) => g.crack(hit, at));
  healTimer = setTimeout(() => {
    streak = 0;
    impact = null;
    glass?.then((g) => g.heal());
  }, HEAL_AFTER);
}

export function initEasterEgg() {
  // Capture phase, so this runs before Astro's router decides to navigate.
  document.addEventListener('click', onClick, true);
}
