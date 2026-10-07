// The glass: a crack that grows with every hit and keeps creeping on its own,
// then a snapshot of the viewport cut along exactly those cracks into shards
// that fall away to reveal the arcade. Left alone, the crack heals back from
// its tips to the point of impact. Closing the arcade plays the fall in reverse.
import { burst, tone } from './audio';

type Pt = { x: number; y: number };

// One straight piece of crack. It draws in from `a` as the crack's front
// passes t0, and is whole once the front reaches t1.
interface Seg {
  a: Pt;
  b: Pt;
  t0: number; // fractions of the web radius
  t1: number;
  w: number; // 1 for the main cracks, finer in the crush zone
  hit: number; // first hit it can appear on
}

// A chipped fragment in the crush zone, tinted lighter or darker than the
// glass around it as if catching the light at a different angle.
interface Facet {
  poly: Pt[];
  fill: string;
  hit: number;
  t: number;
}

interface Web {
  o: Pt;
  R: number;
  crush: number; // radius of the pulverised zone, px
  segs: Seg[];
  facets: Facet[];
  cells: Pt[][]; // shard outlines: every edge is one of the segs
  core: Pt[]; // the crater
  specks: Pt[]; // glass dust
  maxT: number;
}

interface Shard {
  img: HTMLCanvasElement;
  w: number; // CSS-px size of the image (it's rendered at snapshot scale)
  h: number;
  ox: number; // where the shard's image sits on screen at rest
  oy: number;
  cx: number; // rotation pivot, relative to the image
  cy: number;
  d: number; // distance from impact
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  tilt: number;
  vt: number;
  delay: number;
}

const RAYS = 17;
const RINGS = 8;
const REACH = [0, 0.12, 0.27, 0.48, 0.72]; // how far a hit sends the crack, 0..1 of the web radius
const CREEP = 0.5; // after each hit the crack creeps this far toward the next hit's reach
const CREEP_MS = 1600; // …easing in over about this long
const RUN_MS = 220; // a hit's crack runs out this fast
const BREAK_MS = 420; // the last hit's crack crosses the screen, then it breaks
const HEAL_MS = 1900;
const MAX_CELL = 34000; // px²: bigger cells crack again
const GRAVITY = 2600;
const TAU = Math.PI * 2;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeOut = (p: number) => 1 - (1 - p) ** 3;
const easeInOut = (p: number) => 0.5 - Math.cos(Math.PI * p) / 2;

let layer: HTMLDivElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let web: Web | null = null;
let hits = 0;
let shattered = false; // past the crack stage: nothing to redraw on resize
let raf = 0;
let snapshot: Promise<HTMLCanvasElement | null> | null = null;
let snapAt = { x: 0, y: 0, w: 0, h: 0 };
let arcadeModule: Promise<typeof import('./arcade')> | null = null;

// The crack's front, animated: a quick run to `to`, then a slow creep on
// toward `creepTo`. Healing runs it back down to zero.
const reach = { from: 0, to: 0, creepTo: 0, t0: 0, dur: 1, ease: easeOut };
let healing: ((healed: boolean) => void) | null = null;
let lastTick = 0;

function front(now: number): number {
  const p = Math.min(1, Math.max(0, (now - reach.t0) / reach.dur));
  let v = reach.from + (reach.to - reach.from) * reach.ease(p);
  if (p >= 1 && reach.creepTo > reach.to) {
    v += (reach.creepTo - reach.to) * (1 - Math.exp(-(now - reach.t0 - reach.dur) / (CREEP_MS / 2.5)));
  }
  return v;
}

function runTo(to: number, dur: number, creepTo = to, ease = easeOut) {
  const now = performance.now();
  reach.from = web ? front(now) : 0;
  Object.assign(reach, { to, creepTo, t0: now, dur, ease });
}

// ── Layer ──
// Mounted on <html>, not <body>: Astro swaps <body> on navigation, and the
// glass (and later the arcade) must survive that.
function ensureLayer() {
  if (layer) return;
  layer = document.createElement('div');
  layer.className = 'egg-glass';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;';
  canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  layer.appendChild(canvas);
  document.documentElement.appendChild(layer);
  ctx = canvas.getContext('2d');
  sizeCanvas();
  window.addEventListener('resize', onResize);
}

function sizeCanvas() {
  if (!canvas || !ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function onResize() {
  sizeCanvas();
  if (web && !shattered) drawCracks(ctx!, performance.now());
}

// Clear the whole backing store. innerWidth/innerHeight can shift under us
// (scroll lock, mobile toolbars), so never clear by viewport size.
function wipe(c: CanvasRenderingContext2D) {
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, c.canvas.width, c.canvas.height);
  c.restore();
}

function removeLayer() {
  pin(false);
  cancelAnimationFrame(raf);
  window.removeEventListener('resize', onResize);
  layer?.remove();
  layer = canvas = null;
  ctx = null;
  web = null;
  hits = 0;
  shattered = false;
  snapshot = null;
  warming = null; // the contexts were used up; a next time makes new ones
  Object.assign(reach, { from: 0, to: 0, creepTo: 0 });
}

// ── Crack geometry ──
// Straight radial cracks crossed by rings that tighten toward the impact,
// like tempered glass. Inside the first ring is the crush zone: a finer web of
// the same kind. Shard outlines are built from exactly the drawn cracks, so
// the glass breaks where it was seen to crack.

function area(p: Pt[]) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s / 2);
}

function weave(o: Pt): Web {
  const corners = [
    { x: 0, y: 0 },
    { x: innerWidth, y: 0 },
    { x: 0, y: innerHeight },
    { x: innerWidth, y: innerHeight },
  ];
  const R = Math.max(...corners.map((c) => dist(o, c))) * 1.1;
  const crush = Math.min(60, Math.max(38, Math.min(innerWidth, innerHeight) * 0.07));
  const tOf = (p: Pt, lag = 1) => (dist(p, o) / R) * lag;
  const segs: Seg[] = [];
  const add = (a: Pt, b: Pt, lag: number, w = 1, hit = 1) =>
    segs.push({ a, b, t0: tOf(a, lag), t1: Math.max(tOf(a, lag) + 0.001, tOf(b, lag)), w, hit });
  const cells: Pt[][] = [];
  const facets: Facet[] = [];

  // ── Main web ──
  const radii = [0, crush];
  for (let j = 2; j <= RINGS; j++) radii.push(crush + (R - crush) * ((j - 1) / (RINGS - 1)) ** 1.6);
  const step = TAU / RAYS;
  const pts = Array.from({ length: RAYS }, (_, i) => {
    let angle = i * step + rand(-0.32, 0.32) * step;
    return radii.map((r, j) => {
      if (j === 0) return o;
      angle += rand(-0.05, 0.05); // rays bend slightly as they run
      const jr = j === RINGS ? 0 : (radii[j] - radii[j - 1]) * rand(-0.18, 0.18);
      return { x: o.x + Math.cos(angle) * (r + jr), y: o.y + Math.sin(angle) * (r + jr) };
    });
  });
  // Some rays trail behind the rest, so the star never looks stamped.
  const lag = pts.map(() => (Math.random() < 0.35 ? rand(1.25, 1.6) : rand(1, 1.12)));
  for (let i = 0; i < RAYS; i++) for (let j = 2; j <= RINGS; j++) add(pts[i][j - 1], pts[i][j], lag[i]);

  // Rings: the first one bounds the crush zone and is always whole; further
  // out they're broken. A missing ring piece just makes a longer shard.
  const ringOn = (j: number) => j === 1 || j === RINGS || Math.random() < (j <= 3 ? 0.8 : 0.45);
  const ring: boolean[][] = [];
  for (let j = 1; j <= RINGS; j++) {
    ring[j] = [];
    for (let i = 0; i < RAYS; i++) {
      ring[j][i] = ringOn(j);
      if (ring[j][i] && j < RINGS) {
        const a = pts[i][j];
        const b = pts[(i + 1) % RAYS][j];
        const t0 = (radii[j] / R) * 1.2 + 0.02;
        segs.push({ a, b, t0, t1: t0 + dist(a, b) / R / 2, w: 1, hit: 1 });
      }
    }
  }

  // Cells between neighbouring rays, from one standing ring piece to the next.
  for (let i = 0; i < RAYS; i++) {
    const n = (i + 1) % RAYS;
    let start = 1;
    for (let j = 2; j <= RINGS; j++) {
      if (!ring[j][i]) continue;
      const poly: Pt[] = [];
      for (let k = start; k <= j; k++) poly.push(pts[i][k]);
      for (let k = j; k >= start; k--) poly.push(pts[n][k]);
      crackApart(poly, cells, segs, o, R, 0);
      start = j;
    }
  }

  // ── Crush zone ──
  // Fine fractures from the impact to the first ring: every main ray carries
  // on in to the centre, with one or two more between each pair.
  const spokes: Pt[] = [];
  for (let i = 0; i < RAYS; i++) {
    const a = pts[i][1];
    const b = pts[(i + 1) % RAYS][1];
    spokes.push(a);
    const extra = Math.random() < 0.5 ? [rand(0.3, 0.7)] : [rand(0.2, 0.45), rand(0.55, 0.8)];
    for (const s of extra) spokes.push(lerp(a, b, s));
  }
  const fractions = [0.13, 0.3, 0.52, 0.76];
  const isMain = new Set(pts.map((p) => p[1]));
  const grid = spokes.map((end) => [o, ...fractions.map((f) => lerp(o, end, f * rand(0.92, 1.08))), end]);
  grid.forEach((line, s) => {
    const main = isMain.has(line[line.length - 1]);
    for (let k = 1; k < line.length; k++) {
      // The crater covers the centre, so lines start just outside it.
      const a = k === 1 ? lerp(o, line[1], 0.35) : line[k - 1];
      add(a, line[k], 1, main ? 1 : 0.5, main || k <= 2 ? 1 : Math.min(4, k - 1));
    }
  });
  const crushRing = fractions.map((_, k) => grid.map(() => Math.random() < 0.85 - k * 0.12));
  grid.forEach((line, s) => {
    const next = grid[(s + 1) % grid.length];
    let start = 0;
    for (let k = 1; k < line.length; k++) {
      const edge = k === line.length - 1; // the first ring of the main web
      if (!edge) {
        if (!crushRing[k - 1][s]) continue;
        segs.push({ a: line[k], b: next[k], t0: tOf(line[k]) * 1.1, t1: tOf(line[k]) * 1.1 + 0.004, w: 0.5, hit: Math.min(4, k) });
      }
      const poly = start === 0 ? [o, ...line.slice(1, k + 1), ...next.slice(1, k + 1).reverse()] : [...line.slice(start, k + 1), ...next.slice(start, k + 1).reverse()];
      cells.push(poly);
      // Chipped facets, more of them nearer the centre.
      if (Math.random() < 0.7 - start * 0.12) {
        const light = Math.random() < 0.55;
        facets.push({
          poly,
          fill: light ? `rgba(255,255,255,${rand(0.18, 0.5).toFixed(2)})` : `rgba(17,17,17,${rand(0.08, 0.22).toFixed(2)})`,
          hit: Math.min(4, start + 1),
          t: tOf(line[Math.max(1, start)]),
        });
      }
      start = k;
    }
  });

  const core = Array.from({ length: 9 }, (_, k) => {
    const a = (k / 9) * TAU + rand(-0.25, 0.25);
    const r = rand(2, 4);
    return { x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r };
  });
  const specks = Array.from({ length: 24 }, () => {
    const a = rand(0, TAU);
    const r = rand(5, crush * 0.6);
    return { x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r };
  });
  const maxT = Math.max(...segs.map((s) => s.t1));
  return { o, R, crush, segs, facets, cells, core, specks, maxT };
}

// Big cells crack again: a straight crack across the cell, from a point on its
// longest side to a point on the side facing it. These cracks appear as the
// final hit runs out, so they're on screen before the glass falls.
function crackApart(poly: Pt[], out: Pt[][], segs: Seg[], o: Pt, R: number, depth: number) {
  const offscreen = poly.every((p) => p.x < 0) || poly.every((p) => p.y < 0) ||
    poly.every((p) => p.x > innerWidth) || poly.every((p) => p.y > innerHeight);
  if (offscreen || depth > 4 || area(poly) < MAX_CELL) return void out.push(poly);

  const n = poly.length;
  let k1 = 0;
  for (let k = 1; k < n; k++) if (dist(poly[k], poly[(k + 1) % n]) > dist(poly[k1], poly[(k1 + 1) % n])) k1 = k;
  const m1 = lerp(poly[k1], poly[(k1 + 1) % n], rand(0.35, 0.65));
  // Cut across the cell, not along it: aim for the side that runs most
  // nearly opposite to the long one, close by.
  const dir = (k: number) => {
    const a = poly[k];
    const b = poly[(k + 1) % n];
    const l = dist(a, b) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };
  const d1 = dir(k1);
  const span = Math.sqrt(area(poly));
  let k2 = -1;
  let best = Infinity;
  for (let k = 0; k < n; k++) {
    if (k === k1) continue;
    const dk = dir(k);
    const score = d1.x * dk.x + d1.y * dk.y + (0.3 * dist(m1, lerp(poly[k], poly[(k + 1) % n], 0.5))) / span;
    if (score < best) [best, k2] = [score, k];
  }
  const m2 = lerp(poly[k2], poly[(k2 + 1) % n], rand(0.3, 0.7));

  const [near, away] = dist(m1, o) < dist(m2, o) ? [m1, m2] : [m2, m1];
  const t0 = (dist(near, o) / R) * 1.1 + 0.03;
  // These only show on the breaking hit, as the last crack runs out.
  segs.push({ a: near, b: away, t0, t1: t0 + (dist(near, away) / R) * 0.7, w: 1, hit: 5 });

  const a: Pt[] = [m1];
  for (let k = (k1 + 1) % n; ; k = (k + 1) % n) {
    a.push(poly[k]);
    if (k === k2) break;
  }
  a.push(m2);
  const b: Pt[] = [m2];
  for (let k = (k2 + 1) % n; ; k = (k + 1) % n) {
    b.push(poly[k]);
    if (k === k1) break;
  }
  b.push(m1);
  crackApart(a, out, segs, o, R, depth + 1);
  crackApart(b, out, segs, o, R, depth + 1);
}

// ── Drawing ──
function drawCracks(c: CanvasRenderingContext2D, now: number, full = false): void {
  if (!web) return;
  if (!full) wipe(c);
  const f = full ? Infinity : front(now);
  const lvl = full ? 4 : Math.min(4, hits);
  const { o, crush } = web;
  // The crush zone's shading comes and goes with the crack itself, so it's the
  // first thing to appear and the last to heal.
  const presence = full ? 1 : Math.min(1, f / ((crush * 0.6) / web.R));
  if (presence <= 0) return;
  const shown = (hit: number, t: number) => full || (hit <= hits && t <= f);

  // Depth: a soft shadow where the glass is pushed in, under a frosted haze.
  c.globalAlpha = presence;
  const sr = 14 + lvl * 5;
  const shadow = c.createRadialGradient(o.x, o.y, 3, o.x, o.y, sr);
  shadow.addColorStop(0, 'rgba(17,17,17,0)');
  shadow.addColorStop(0.45, 'rgba(17,17,17,0.12)');
  shadow.addColorStop(1, 'rgba(17,17,17,0)');
  c.fillStyle = shadow;
  c.beginPath();
  c.arc(o.x, o.y, sr, 0, TAU);
  c.fill();
  const hr = 8 + lvl * 3;
  const haze = c.createRadialGradient(o.x, o.y, 0, o.x, o.y, hr);
  haze.addColorStop(0, 'rgba(255,255,255,0.55)');
  haze.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = haze;
  c.beginPath();
  c.arc(o.x, o.y, hr, 0, TAU);
  c.fill();
  c.globalAlpha = 1;

  for (const fc of web.facets) {
    if (!shown(fc.hit, fc.t)) continue;
    c.fillStyle = fc.fill;
    c.beginPath();
    fc.poly.forEach((p, k) => (k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.fill();
  }

  // Each crack is a dark line with a light one beside it, so it reads over
  // both the cream pages and the dark hero. Grouped by width: a few strokes.
  const main = new Path2D();
  const fine = new Path2D();
  for (const s of web.segs) {
    if (!full && (s.hit > hits || f <= s.t0)) continue;
    const p = full ? 1 : Math.min(1, (f - s.t0) / (s.t1 - s.t0));
    const path = s.w < 1 ? fine : main;
    path.moveTo(s.a.x, s.a.y);
    path.lineTo(s.a.x + (s.b.x - s.a.x) * p, s.a.y + (s.b.y - s.a.y) * p);
  }
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const [path, w] of [[main, 1], [fine, 0.5]] as const) {
    c.save();
    c.translate(w < 1 ? 0.4 : 0.6, w < 1 ? 0.4 : 0.6);
    c.strokeStyle = w < 1 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.85)';
    c.lineWidth = w < 1 ? 0.9 : 1.6;
    c.stroke(path);
    c.restore();
    c.strokeStyle = w < 1 ? 'rgba(17,17,17,0.45)' : 'rgba(17,17,17,0.55)';
    c.lineWidth = w;
    c.stroke(path);
  }

  // The crater: opaque crushed glass with a dark rim, a pit, and dust.
  c.globalAlpha = presence;
  c.fillStyle = 'rgba(255,255,255,0.92)';
  c.strokeStyle = 'rgba(17,17,17,0.45)';
  c.lineWidth = 0.75;
  c.beginPath();
  web.core.forEach((p, k) => (k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = 'rgba(17,17,17,0.55)';
  c.beginPath();
  c.arc(o.x + 0.3, o.y + 0.3, 1.1, 0, TAU);
  c.fill();
  const dust = full ? web.specks.length : Math.min(web.specks.length, hits * 6);
  c.fillStyle = 'rgba(255,255,255,0.8)';
  for (let k = 0; k < dust; k++) c.fillRect(web.specks[k].x - 0.5, web.specks[k].y - 0.5, 1.2, 1.2);
  c.globalAlpha = 1;
}

// One loop for running, creeping and healing. It stops once nothing moves.
function animateCracks() {
  cancelAnimationFrame(raf);
  const frame = (now: number) => {
    if (!ctx || shattered) return;
    drawCracks(ctx, now);
    const elapsed = now - reach.t0;
    if (healing) {
      if (elapsed >= reach.dur) {
        const done = healing;
        healing = null;
        removeLayer();
        done(true);
        return;
      }
    } else if (elapsed > reach.dur && elapsed < reach.dur + CREEP_MS * 2) {
      // Stress ticks while the crack creeps, fading as it settles.
      const settle = Math.exp(-(elapsed - reach.dur) / CREEP_MS);
      if (now - lastTick > 140 && Math.random() < 0.08 * settle) {
        lastTick = now;
        burst(0.02, 4200, 0.05 + 0.08 * settle);
      }
    } else if (elapsed >= reach.dur + CREEP_MS * 2) {
      return; // settled
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}

// While the glass is cracked the page shakes on every hit. Promote it to its
// own layer once for the whole phase, rather than once per shake.
function pin(on: boolean) {
  window.dispatchEvent(new CustomEvent('egg:hold', { detail: on })); // pause the hero animation underneath
  for (const id of ['main-content', 'site-nav']) {
    const el = document.getElementById(id);
    if (el) el.style.willChange = on ? 'transform' : '';
  }
}

// A short, decaying tremor through the page and the glass together.
function shake(strength: number, ms: number) {
  if (reduceMotion()) return;
  const frames: Keyframe[] = [];
  const n = 7;
  for (let k = 0; k <= n; k++) {
    const decay = 1 - k / n;
    const a = k === n ? 0 : strength * decay;
    const ang = rand(0, TAU);
    frames.push({ transform: `translate(${(Math.cos(ang) * a).toFixed(2)}px,${(Math.sin(ang) * a).toFixed(2)}px)` });
  }
  for (const el of [document.getElementById('main-content'), document.getElementById('site-nav'), canvas]) {
    el?.animate(frames, { duration: ms, easing: 'linear' });
  }
}

// ── Snapshot ──
async function capture(): Promise<HTMLCanvasElement | null> {
  const { snapshot: shoot } = await import('./snapshot');
  return shoot(Math.min(window.devicePixelRatio || 1, 1.5)); // matches the 3D canvases; less to upload
}

// The snapshot (and the GL contexts after it) wait for the page to settle:
// not mid-navigation, not mid-intro. Otherwise they'd fight the page load for
// the GPU, and the picture could catch the intro half-faded.
let settleAt = 0;
let prepTimer: ReturnType<typeof setTimeout> | undefined;

function prepare(force = false) {
  arcadeModule ??= import('./arcade');
  clearTimeout(prepTimer);
  const wait = settleAt - performance.now();
  if (!force && wait > 0) {
    if (Number.isFinite(wait)) prepTimer = setTimeout(() => prepare(), wait);
    return;
  }
  const moved = snapAt.x !== scrollX || snapAt.y !== scrollY || snapAt.w !== innerWidth || snapAt.h !== innerHeight;
  if (snapshot && !moved) return;
  snapAt = { x: scrollX, y: scrollY, w: innerWidth, h: innerHeight };
  const shot = capture().catch((err) => {
    console.warn('[egg] snapshot failed', err);
    return null;
  });
  snapshot = shot;
  shot.then(() => warmGL());
}

/** The page is changing (Infinity) or will be still from time `t`; any snapshot is stale. */
export function settle(t: number) {
  settleAt = t;
  snapshot = null;
  snapAt = { x: -1, y: -1, w: 0, h: 0 };
  if (Number.isFinite(t) && (web || layer)) prepare();
}

// One slow job per frame: each WebGL context gets its own.
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
let warming: Promise<void> | null = null;
function warmGL() {
  if (reduceMotion() || warming) return;
  warming = (async () => {
    const fall = await import('./shards3d');
    await nextFrame();
    fall.prewarm3D();
    const menu = await import('./shardmenu');
    await nextFrame();
    menu.prewarmMenu();
  })();
}

// ── Public: hits ──
/** Second click: nothing to see yet, but get the expensive bits going. */
export function warm(settled: number) {
  arcadeModule ??= import('./arcade');
  import('./snapshot');
  import('./shards3d');
  // The slow work starts as soon as the page is still — ideally before the
  // first crack: the snapshot, then the two WebGL contexts.
  settleAt = Math.max(settleAt === Infinity ? 0 : settleAt, settled);
  prepare();
}

// Run after the next frame is on screen. The first sound builds the audio
// engine and the snapshot clones the page; both take long enough to be felt,
// so the crack gets painted before either starts.
const afterPaint = (fn: () => void, delay = 0) => requestAnimationFrame(() => setTimeout(fn, delay));

export function crack(hit: number, at: Pt) {
  ensureLayer();
  if (!web) web = weave(at);
  if (healing) {
    // Struck again mid-heal: the crack stops receding and runs back out.
    const h = healing;
    healing = null;
    h(false);
  }
  hits = Math.max(hits, hit);
  const to = REACH[Math.min(hit, REACH.length - 1)];
  const next = REACH[hit + 1] ?? 1;
  runTo(to, RUN_MS, to + (next - to) * CREEP);
  animateCracks();
  shake(2 + hit * 1.2, 240);
  burst(0.09 + hit * 0.03, 2400 - hit * 250, 0.35 + hit * 0.08);
  tone(1800 + Math.random() * 600, 900, 0.05, 0.05, 'triangle');
  afterPaint(() => prepare(), 80); // no-op unless the view moved since the warm-up
  if (hit === 1) pin(true);
}

/** Let the glass mend, tips first. Resolves true once it's gone, false if struck again first. */
export function heal(): Promise<boolean> {
  if (!web || shattered) return Promise.resolve(true);
  healing?.(false);
  runTo(0, HEAL_MS, 0, easeInOut);
  tone(2600, 1700, 0.9, 0.02, 'sine');
  const done = new Promise<boolean>((r) => (healing = r));
  animateCracks();
  return done;
}

// ── Public: break ──
export async function shatter(at: Pt): Promise<void> {
  ensureLayer();
  if (!web) web = weave(at);
  if (healing) {
    const h = healing;
    healing = null;
    h(false);
  }
  prepare(true); // breaking now: no more waiting for the page to settle
  const arcadeLoad = (arcadeModule ??= import('./arcade'));

  // The last hit sends the crack across the whole screen — every line the
  // glass will break along — and only then does it give.
  hits = 5;
  runTo(web.maxT + 0.01, BREAK_MS);
  animateCracks();
  shake(8, 380);
  burst(0.35, 1400, 0.9);

  const [snap, { openArcade }] = await Promise.all([
    Promise.race([snapshot!, wait(3000).then(() => null)]),
    arcadeLoad,
    wait(BREAK_MS + 120),
  ]);
  cancelAnimationFrame(raf);
  shattered = true;
  layer!.style.pointerEvents = 'auto'; // nothing underneath is clickable from here on
  const brand = document.querySelector<HTMLElement>('#site-nav .nav-brand');

  if (!snap || reduceMotion()) {
    const arcade = openArcade({ fade: true });
    layer!.style.transition = 'opacity 0.3s ease';
    layer!.style.opacity = '0';
    layer!.style.pointerEvents = 'none';
    await arcade.exit;
    await arcade.destroy(true);
    removeLayer();
    brand?.focus();
    return;
  }

  // Bake the cracks into the snapshot so every shard carries its lines.
  const sx = snap.width / innerWidth;
  const sc = snap.getContext('2d')!;
  sc.save();
  sc.scale(sx, sx);
  drawCracks(sc, 0, true);
  sc.restore();

  // Prefer real 3D; without WebGL, the flat 2D fall. Three good shards stay
  // behind to become the menu.
  const { create3D, clipToView } = await import('./shards3d');
  const keep = menuShards(web!.cells, clipToView);
  const scene = create3D(layer!, snap, web!.cells.filter((_, i) => !keep.includes(i)), web!.o, web!.R);
  const shards = scene ? [] : cut(snap, sx);
  if (scene) scene.rest();
  wipe(ctx!);
  const arcade = openArcade({
    fade: false,
    shardSource: scene ? { polys: keep.map((i) => clipToView(web!.cells[i], innerWidth, innerHeight)), snap } : undefined,
  });
  burst(0.9, 3000, 0.5);
  for (let k = 0; k < 6; k++) tone(rand(2200, 4200), rand(1800, 3000), 0.12, 0.04, 'sine', 0.05 + k * 0.07);
  if (scene) {
    flash();
    await scene.fall();
  } else {
    await fall(shards);
  }
  layer!.style.pointerEvents = 'none';
  if (canvas) canvas.style.visibility = 'hidden'; // empty until the rewind; don't composite it

  await arcade.exit;
  if (canvas) canvas.style.visibility = '';
  const sameView = snapAt.w === innerWidth && snapAt.h === innerHeight;
  if (sameView && !reduceMotion()) {
    layer!.style.pointerEvents = 'auto';
    tone(600, 1400, 0.5, 0.06, 'sine');
    await Promise.all([scene ? scene.rise() : rise(shards), arcade.reassemble()]);
    await arcade.destroy(false);
    layer!.style.transition = 'opacity 0.5s ease';
    layer!.style.opacity = '0';
    await wait(520);
  } else {
    await arcade.destroy(true);
  }
  scene?.destroy();
  removeLayer();
  brand?.focus();
}

// The menu's shards are real pieces of the page: pick three that make good
// buttons. Fairly large, solid (filling most of their own box), and longer
// than tall once laid flat.
function menuShards(cells: Pt[][], clip: (p: Pt[], w: number, h: number) => Pt[]): number[] {
  const scored: { i: number; score: number }[] = [];
  cells.forEach((cell, i) => {
    const poly = clip(cell, innerWidth, innerHeight);
    if (poly.length < 3) return;
    const a = area(poly);
    if (a < 2500) return;
    let best = 0;
    for (let k = 0; k < 36; k++) {
      const t = (k / 36) * Math.PI;
      const xs = poly.map((p) => p.x * Math.cos(t) - p.y * Math.sin(t));
      const ys = poly.map((p) => p.x * Math.sin(t) + p.y * Math.cos(t));
      const w = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      const solid = a / (w * h);
      const ratio = w / h;
      if (solid > 0.45 && ratio > 1.7 && ratio < 6) best = Math.max(best, solid * Math.min(ratio, 3.2));
    }
    if (best) scored.push({ i, score: best * Math.sqrt(Math.min(a, 40000)) });
  });
  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, 3).map((s) => s.i);
}

// A burst of light at the point of impact as the glass gives.
function flash() {
  const c = ctx!;
  const { o } = web!;
  const start = performance.now();
  const frame = (now: number) => {
    const t = Math.max(0, now - start);
    wipe(c);
    if (t >= 140) return;
    c.fillStyle = `rgba(255,255,255,${0.8 * (1 - t / 140)})`;
    c.beginPath();
    c.arc(o.x, o.y, 60 + t * 2, 0, TAU);
    c.fill();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// Cut the snapshot into the web's cells (for the 2D fallback).
function cut(snap: HTMLCanvasElement, sx: number): Shard[] {
  const { o, R, cells } = web!;
  const shards: Shard[] = [];
  for (const poly of cells) {
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const x0 = Math.floor(Math.max(0, Math.min(...xs)));
    const y0 = Math.floor(Math.max(0, Math.min(...ys)));
    const x1 = Math.ceil(Math.min(innerWidth, Math.max(...xs)));
    const y1 = Math.ceil(Math.min(innerHeight, Math.max(...ys)));
    if (x1 - x0 < 1 || y1 - y0 < 1) continue; // off screen

    const w = x1 - x0;
    const h = y1 - y0;
    const img = document.createElement('canvas');
    img.width = Math.ceil(w * sx);
    img.height = Math.ceil(h * sx);
    const c = img.getContext('2d')!;
    c.scale(sx, sx);
    c.beginPath();
    poly.forEach((p, k) => (k ? c.lineTo(p.x - x0, p.y - y0) : c.moveTo(p.x - x0, p.y - y0)));
    c.closePath();
    c.save();
    c.clip();
    c.drawImage(snap, x0 * sx, y0 * sx, w * sx, h * sx, 0, 0, w, h);
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 0.75;
    c.stroke();

    const cx = xs.reduce((s, v) => s + v, 0) / xs.length;
    const cy = ys.reduce((s, v) => s + v, 0) / ys.length;
    const d = Math.hypot(cx - o.x, cy - o.y) || 1;
    const size = Math.sqrt(w * h);
    const speed = rand(60, 220) * (1 - (d / R) * 0.5) + (d < 140 ? 260 : 0);
    shards.push({
      img,
      w,
      h,
      ox: x0,
      oy: y0,
      cx: cx - x0,
      cy: cy - y0,
      d,
      x: 0,
      y: 0,
      vx: ((cx - o.x) / d) * speed + rand(-30, 30),
      vy: ((cy - o.y) / d) * speed - rand(40, 200),
      a: 0,
      va: rand(-2.5, 2.5) * (1 + 50 / size),
      tilt: 0,
      vt: rand(2, 7),
      delay: d * 0.45 + rand(0, 70),
    });
  }
  return shards;
}

function drawShard(c: CanvasRenderingContext2D, s: Shard) {
  c.save();
  c.translate(s.ox + s.cx + s.x, s.oy + s.cy + s.y);
  c.rotate(s.a);
  c.scale(Math.cos(s.tilt), 1); // a cheap flip in depth
  c.drawImage(s.img, -s.cx, -s.cy, s.w, s.h);
  c.restore();
}

function fall(shards: Shard[]): Promise<void> {
  return new Promise((resolve) => {
    const c = ctx!;
    const start = performance.now();
    let last = start;
    const flash = { x: web!.o.x, y: web!.o.y };
    const frame = (now: number) => {
      const dt = Math.max(0, Math.min(0.033, (now - last) / 1000));
      last = now;
      const t = Math.max(0, now - start); // rAF time can predate `start`
      wipe(c);
      let alive = 0;
      for (const s of shards) {
        if (t > s.delay) {
          s.vy += GRAVITY * dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.a += s.va * dt;
          s.tilt += s.vt * dt;
        }
        if (s.oy + s.y < innerHeight + 40) {
          alive++;
          drawShard(c, s);
        }
      }
      if (t < 140) {
        c.fillStyle = `rgba(255,255,255,${0.8 * (1 - t / 140)})`;
        c.beginPath();
        c.arc(flash.x, flash.y, 60 + t * 2, 0, TAU);
        c.fill();
      }
      if (alive && t < 4000) raf = requestAnimationFrame(frame);
      else {
        wipe(c);
        resolve();
      }
    };
    raf = requestAnimationFrame(frame);
  });
}

// Rewind: every shard flies back from wherever it fell to, outer ones first.
function rise(shards: Shard[]): Promise<void> {
  const from = shards.map((s) => ({ x: s.x, y: s.y, a: s.a % TAU, tilt: s.tilt % TAU }));
  const R = web!.R;
  const DUR = 620;
  return new Promise((resolve) => {
    const c = ctx!;
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.max(0, now - start); // rAF time can predate `start`
      wipe(c);
      let done = true;
      shards.forEach((s, k) => {
        const lag = (s.d / R) * -260 + 260;
        const p = Math.min(1, Math.max(0, (t - lag) / DUR));
        if (p < 1) done = false;
        const e = 1 - (1 - p) ** 3;
        const f = from[k];
        s.x = f.x * (1 - e);
        s.y = f.y * (1 - e);
        s.a = f.a * (1 - e);
        s.tilt = f.tilt * (1 - e);
        drawShard(c, s);
      });
      if (!done) raf = requestAnimationFrame(frame);
      else resolve();
    };
    raf = requestAnimationFrame(frame);
  });
}
