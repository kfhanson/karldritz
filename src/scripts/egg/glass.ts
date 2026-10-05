// The glass: a spider-web crack that grows with every hit, then a snapshot of
// the viewport cut along those same cracks into shards that fall away to
// reveal the arcade. Closing the arcade plays the fall in reverse.
import { burst, tone, warmAudio } from './audio';

type Pt = { x: number; y: number };

interface Segment {
  a: Pt;
  b: Pt;
  t: number; // reveal threshold, 0..1 of the web radius
  hit: number; // first hit it can appear on
  w: number; // line width
  born: number; // when it started drawing (0 = not yet)
  delay: number;
}

// A chipped fragment in the crush zone: tinted lighter or darker than the
// glass around it, as if catching the light at a different angle.
interface Facet {
  poly: Pt[];
  fill: string;
  hit: number;
}

interface Web {
  o: Pt;
  R: number;
  pts: Pt[][]; // pts[ray][ring]; ring 0 is the impact point
  segs: Segment[];
  facets: Facet[];
  core: Pt[]; // the crushed spot itself
  specks: Pt[]; // glass dust around it
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
const REACH = [0, 0.14, 0.3, 0.52, 0.78, 1.2]; // web radius revealed after each hit
const GRAVITY = 2600;
const TAU = Math.PI * 2;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  cancelAnimationFrame(raf);
  window.removeEventListener('resize', onResize);
  layer?.remove();
  layer = canvas = null;
  ctx = null;
  web = null;
  hits = 0;
  shattered = false;
  snapshot = null;
}

// ── Crack geometry ──
// Radial rays from the impact, crossed by concentric rings. The rings tighten
// near the impact so the shards there are small, like real tempered glass.
function weave(o: Pt): Web {
  const corners = [
    { x: 0, y: 0 },
    { x: innerWidth, y: 0 },
    { x: 0, y: innerHeight },
    { x: innerWidth, y: innerHeight },
  ];
  const R = Math.max(...corners.map((c) => dist(o, c))) * 1.1;
  const step = TAU / RAYS;
  const radii = Array.from({ length: RINGS + 1 }, (_, j) => R * (j / RINGS) ** 1.65);

  const pts = Array.from({ length: RAYS }, (_, i) => {
    let angle = i * step + rand(-0.32, 0.32) * step;
    return radii.map((r, j) => {
      if (j === 0) return o;
      angle += rand(-0.05, 0.05); // rays bend slightly as they run
      const jr = j === RINGS ? 0 : (radii[j] - radii[j - 1]) * rand(-0.22, 0.22);
      return { x: o.x + Math.cos(angle) * (r + jr), y: o.y + Math.sin(angle) * (r + jr) };
    });
  });

  const segs: Segment[] = [];
  const add = (a: Pt, b: Pt, t: number, hit = 1, w = 1) => segs.push({ a, b, t, hit, w, born: 0, delay: 0 });
  for (let i = 0; i < RAYS; i++) {
    const lag = Math.random() < 0.35 ? rand(1.3, 1.8) : rand(1, 1.15); // some rays trail behind
    // Main rays start just outside the crater, so the centre doesn't clot.
    const p1 = pts[i][1];
    const r1 = dist(o, p1) || 1;
    const gap = rand(4, 9) / r1;
    add({ x: o.x + (p1.x - o.x) * gap, y: o.y + (p1.y - o.y) * gap }, p1, 0);
    for (let j = 2; j <= RINGS; j++) add(pts[i][j - 1], pts[i][j], (radii[j - 1] / R) * lag);
  }
  for (let j = 1; j < RINGS; j++) {
    for (let i = 0; i < RAYS; i++) {
      if (Math.random() < (j <= 3 ? 0.8 : 0.45)) add(pts[i][j], pts[(i + 1) % RAYS][j], (radii[j] / R) * 1.25 + 0.03);
    }
  }

  // ── The crush zone ──
  // Where the glass was struck it's pulverised: a dense fan of short straight
  // fractures crossed by tight rings, with chipped facets between them. It
  // deepens with every hit.
  const facets: Facet[] = [];
  const MICRO = 34;
  const microRadii = [4, 9, 15, 23, 33, 46];
  const micro = Array.from({ length: MICRO }, () => rand(0, TAU))
    .sort((a, b) => a - b)
    .map((angle) => {
      const reach = rand(0.45, 1) * microRadii[microRadii.length - 1];
      const at = (r: number): Pt => {
        const rr = Math.min(r, reach) * rand(0.92, 1.08);
        return { x: o.x + Math.cos(angle) * rr, y: o.y + Math.sin(angle) * rr };
      };
      return { reach, pts: [o, ...microRadii.map(at)] };
    });

  micro.forEach((m, i) => {
    // Each fracture runs out in straight pieces; the outer pieces need more hits.
    for (let k = 1; k < m.pts.length; k++) {
      if (microRadii[k - 1] > m.reach) break;
      add(m.pts[k - 1], m.pts[k], 0, k <= 2 ? 1 : Math.min(4, k - 1), 0.5);
    }
    const n = micro[(i + 1) % MICRO];
    for (let k = 1; k < m.pts.length; k++) {
      const r = microRadii[k - 1];
      if (r > m.reach || r > n.reach) break;
      const hit = Math.min(4, k);
      // Concentric chords, tight and frequent near the centre.
      if (Math.random() < 0.8 - k * 0.1) add(m.pts[k], n.pts[k], 0, hit, 0.5);
      // Chipped facets between them, more of them nearer the centre.
      if (Math.random() < 0.7 - k * 0.09) {
        const light = Math.random() < 0.55;
        facets.push({
          poly: [m.pts[k - 1], m.pts[k], n.pts[k], n.pts[k - 1]],
          fill: light ? `rgba(255,255,255,${rand(0.2, 0.55).toFixed(2)})` : `rgba(17,17,17,${rand(0.1, 0.26).toFixed(2)})`,
          hit,
        });
      }
    }
  });

  const core = Array.from({ length: 9 }, (_, k) => {
    const a = (k / 9) * TAU + rand(-0.25, 0.25);
    const r = rand(2, 4);
    return { x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r };
  });
  const specks = Array.from({ length: 24 }, () => {
    const a = rand(0, TAU);
    const r = rand(5, 30);
    return { x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r };
  });

  return { o, R, pts, segs, facets, core, specks };
}

// Reveal everything under the current reach; new segments run outward in a
// quick wave rather than all popping in at once.
function reveal(now: number) {
  if (!web) return;
  const from = REACH[hits - 1] ?? 0;
  const to = REACH[Math.min(hits, REACH.length - 1)];
  for (const s of web.segs) {
    if (s.born || s.t > to || s.hit > hits) continue;
    s.born = now;
    s.delay = Math.max(0, (s.t - from) / (to - from)) * 160;
  }
}

function drawCracks(c: CanvasRenderingContext2D, now: number, full = false): boolean {
  if (!web) return false;
  if (!full) wipe(c);
  let animating = false;

  const shown = (hit: number) => full || hit <= hits;
  const { o } = web;
  const depth = full ? 4 : Math.min(4, hits);

  // Depth: a soft shadow where the glass is pushed in, and a frosted haze of
  // crushed glass over it. Both spread a little with every hit.
  const sr = 14 + depth * 5;
  const shadow = c.createRadialGradient(o.x, o.y, 3, o.x, o.y, sr);
  shadow.addColorStop(0, 'rgba(17,17,17,0)');
  shadow.addColorStop(0.45, 'rgba(17,17,17,0.12)');
  shadow.addColorStop(1, 'rgba(17,17,17,0)');
  c.fillStyle = shadow;
  c.beginPath();
  c.arc(o.x, o.y, sr, 0, TAU);
  c.fill();
  const hr = 8 + depth * 3;
  const haze = c.createRadialGradient(o.x, o.y, 0, o.x, o.y, hr);
  haze.addColorStop(0, 'rgba(255,255,255,0.55)');
  haze.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = haze;
  c.beginPath();
  c.arc(o.x, o.y, hr, 0, TAU);
  c.fill();

  // Chipped facets catch the light differently from the glass around them.
  for (const f of web.facets) {
    if (!shown(f.hit)) continue;
    c.fillStyle = f.fill;
    c.beginPath();
    f.poly.forEach((p, k) => (k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.fill();
  }

  // Each crack is a dark line with a light one beside it, so it reads over
  // both the cream pages and the dark hero. Grouped by width: a few strokes.
  const paths = new Map<number, Path2D>();
  for (const s of web.segs) {
    if (!full && !s.born) continue;
    const p = full ? 1 : Math.min(1, Math.max(0, (now - s.born - s.delay) / 110));
    if (p < 1) animating = true;
    if (p <= 0) continue;
    let path = paths.get(s.w);
    if (!path) paths.set(s.w, (path = new Path2D()));
    path.moveTo(s.a.x, s.a.y);
    path.lineTo(s.a.x + (s.b.x - s.a.x) * p, s.a.y + (s.b.y - s.a.y) * p);
  }
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const [w, path] of paths) {
    const fine = w < 1; // the crush-zone hairlines
    c.save();
    c.translate(fine ? 0.4 : 0.6, fine ? 0.4 : 0.6);
    c.strokeStyle = fine ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.85)';
    c.lineWidth = fine ? 0.9 : 1.6;
    c.stroke(path);
    c.restore();
    c.strokeStyle = fine ? 'rgba(17,17,17,0.45)' : 'rgba(17,17,17,0.55)';
    c.lineWidth = fine ? 0.5 : 1;
    c.stroke(path);
  }

  // The crushed spot: an opaque white crater with a dark rim, and glass dust.
  c.fillStyle = 'rgba(255,255,255,0.92)';
  c.strokeStyle = 'rgba(17,17,17,0.45)';
  c.lineWidth = 0.75;
  c.beginPath();
  web.core.forEach((p, k) => (k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.closePath();
  c.fill();
  c.stroke();
  // The pit at the very point of impact.
  c.fillStyle = 'rgba(17,17,17,0.55)';
  c.beginPath();
  c.arc(o.x + 0.3, o.y + 0.3, 1.1, 0, TAU);
  c.fill();
  const dust = full ? web.specks.length : Math.min(web.specks.length, hits * 6);
  c.fillStyle = 'rgba(255,255,255,0.8)';
  for (let k = 0; k < dust; k++) c.fillRect(web.specks[k].x - 0.5, web.specks[k].y - 0.5, 1.2, 1.2);
  return animating;
}

function animateCracks() {
  cancelAnimationFrame(raf);
  const frame = () => {
    if (!ctx) return;
    if (drawCracks(ctx, performance.now())) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}

function shake(strength: number, ms = 160) {
  if (reduceMotion()) return;
  const k = strength;
  const frames = [
    { transform: 'translate(0,0)' },
    { transform: `translate(${-k}px,${k * 0.6}px)` },
    { transform: `translate(${k * 0.8}px,${-k * 0.5}px)` },
    { transform: `translate(${-k * 0.4}px,${-k * 0.3}px)` },
    { transform: 'translate(0,0)' },
  ];
  for (const el of [document.getElementById('main-content'), document.getElementById('site-nav'), canvas]) {
    el?.animate(frames, { duration: ms, easing: 'ease-out' });
  }
}

// ── Snapshot ──
async function capture(): Promise<HTMLCanvasElement | null> {
  const { snapshot: shoot } = await import('./snapshot');
  return shoot(Math.min(window.devicePixelRatio || 1, 2));
}

function prepare() {
  arcadeModule ??= import('./arcade');
  const moved = snapAt.x !== scrollX || snapAt.y !== scrollY || snapAt.w !== innerWidth || snapAt.h !== innerHeight;
  if (snapshot && !moved) return;
  snapAt = { x: scrollX, y: scrollY, w: innerWidth, h: innerHeight };
  snapshot = capture().catch((err) => {
    console.warn('[egg] snapshot failed', err);
    return null;
  });
}

// ── Public: hits ──
/** Second click: nothing to see yet, but get the expensive bits going. */
export function warm() {
  arcadeModule ??= import('./arcade');
  import('./snapshot');
  warmAudio();
}

export function crack(hit: number, at: Pt) {
  ensureLayer();
  if (!web) web = weave(at);
  layer!.style.transition = 'none';
  layer!.style.opacity = '1';
  hits = Math.max(hits, hit);
  reveal(performance.now());
  animateCracks();
  prepare();
  shake(1 + hit * 0.8);
  burst(0.09 + hit * 0.03, 2400 - hit * 250, 0.35 + hit * 0.08);
  tone(1800 + Math.random() * 600, 900, 0.05, 0.05, 'triangle');
}

export function heal() {
  if (!layer) return;
  layer.style.transition = 'opacity 0.6s ease';
  layer.style.opacity = '0';
  const l = layer;
  setTimeout(() => l === layer && l.style.opacity === '0' && removeLayer(), 650);
}

// ── Public: break ──
export async function shatter(at: Pt): Promise<void> {
  ensureLayer();
  if (!web) web = weave(at);
  layer!.style.transition = 'none';
  layer!.style.opacity = '1';
  prepare();
  const arcadeLoad = (arcadeModule ??= import('./arcade'));

  // The last hit sends cracks across the whole screen.
  hits = REACH.length - 1;
  reveal(performance.now());
  animateCracks();
  shake(6, 220);
  burst(0.35, 1400, 0.9);

  const [snap, { openArcade }] = await Promise.all([
    Promise.race([snapshot!, wait(3000).then(() => null)]),
    arcadeLoad,
    wait(260), // let the final crack run out
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

  const shards = cut(snap, sx);
  const arcade = openArcade({ fade: false });
  burst(0.9, 3000, 0.5);
  for (let k = 0; k < 6; k++) tone(rand(2200, 4200), rand(1800, 3000), 0.12, 0.04, 'sine', 0.05 + k * 0.07);
  await fall(shards);
  layer!.style.pointerEvents = 'none';

  await arcade.exit;
  const sameView = snapAt.w === innerWidth && snapAt.h === innerHeight;
  if (sameView && !reduceMotion()) {
    layer!.style.pointerEvents = 'auto';
    tone(600, 1400, 0.5, 0.06, 'sine');
    await rise(shards);
    await arcade.destroy(false);
    layer!.style.transition = 'opacity 0.5s ease';
    layer!.style.opacity = '0';
    await wait(520);
  } else {
    await arcade.destroy(true);
  }
  removeLayer();
  brand?.focus();
}

// Cut the snapshot along the web: one cell between each pair of rays and
// rings, with big outer cells split again so nothing falls as one slab.
function cut(snap: HTMLCanvasElement, sx: number): Shard[] {
  const { o, R, pts } = web!;
  const polys: Pt[][] = [];
  for (let i = 0; i < RAYS; i++) {
    const n = (i + 1) % RAYS;
    for (let j = 1; j <= RINGS; j++) {
      const poly = j === 1 ? [o, pts[i][1], pts[n][1]] : [pts[i][j - 1], pts[i][j], pts[n][j], pts[n][j - 1]];
      split(poly, polys, 0);
    }
  }

  const shards: Shard[] = [];
  for (const poly of polys) {
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
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 1;
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

function area(p: Pt[]) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s / 2);
}

function split(poly: Pt[], out: Pt[][], depth: number) {
  const offscreen = poly.every((p) => p.x < 0) || poly.every((p) => p.y < 0) ||
    poly.every((p) => p.x > innerWidth) || poly.every((p) => p.y > innerHeight);
  if (offscreen) return;
  if (depth > 3 || area(poly) < 22000) return void out.push(poly);
  if (poly.length === 4) {
    const [a, b, c, d] = poly;
    const flip = Math.random() < 0.5;
    split(flip ? [a, b, c] : [a, b, d], out, depth + 1);
    split(flip ? [a, c, d] : [b, c, d], out, depth + 1);
    return;
  }
  // Triangle: cut from the longest edge's (jittered) midpoint to the far corner.
  let k = 0;
  let best = 0;
  for (let i = 0; i < 3; i++) {
    const l = dist(poly[i], poly[(i + 1) % 3]);
    if (l > best) [best, k] = [l, i];
  }
  const a = poly[k];
  const b = poly[(k + 1) % 3];
  const c = poly[(k + 2) % 3];
  const t = rand(0.35, 0.65);
  const m = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  split([a, m, c], out, depth + 1);
  split([m, b, c], out, depth + 1);
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
