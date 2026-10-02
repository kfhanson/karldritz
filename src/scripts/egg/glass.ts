// The glass: a spider-web crack that grows with every hit, then a snapshot of
// the viewport cut along those same cracks into shards that fall away to
// reveal the arcade. Closing the arcade plays the fall in reverse.
import { burst, tone, warmAudio } from './audio';

type Pt = { x: number; y: number };

// One short straight piece of a crack. Cracks are drawn from hundreds of these
// so they can wander, taper and run outward a piece at a time.
interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  t: number; // reveal threshold, 0..1 of the web radius
  w: number; // line width, thinner away from the impact
}

interface Web {
  o: Pt;
  R: number;
  cells: Pt[][]; // shard outlines, sharing their edges with the drawn cracks
  segs: Seg[];
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

const RAYS = 13;
const RINGS = 8;
const DRAWN_RINGS = 4; // concentric cracks only show near the impact
const REACH = [0, 0.09, 0.22, 0.42, 0.68, 1.3]; // web radius revealed after each hit
const RUN_MS = 200; // how long a hit's cracks take to run out
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
let hitAt = 0;
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
  hitAt = 0;
  shattered = false;
  snapshot = null;
}

// ── Crack geometry ──
// Radial rays from the impact, crossed by concentric rings that tighten near
// it, like tempered glass. Every edge is a jagged polyline; the drawn cracks
// and the shard outlines are built from the same polylines, so the glass
// breaks exactly where it was cracked.

/** a→b as a wandering line: interior points nudged sideways, ends fixed. */
function jag(a: Pt, b: Pt, amp: number, bow = 0): Pt[] {
  const len = dist(a, b);
  const n = Math.max(1, Math.round(len / 16));
  const nx = -(b.y - a.y) / (len || 1);
  const ny = (b.x - a.x) / (len || 1);
  const out: Pt[] = [a];
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const off = rand(-amp, amp) + Math.sin(t * Math.PI) * bow;
    out.push({ x: a.x + (b.x - a.x) * t + nx * off, y: a.y + (b.y - a.y) * t + ny * off });
  }
  out.push(b);
  return out;
}

function weave(o: Pt): Web {
  const corners = [
    { x: 0, y: 0 },
    { x: innerWidth, y: 0 },
    { x: 0, y: innerHeight },
    { x: innerWidth, y: innerHeight },
  ];
  const R = Math.max(...corners.map((c) => dist(o, c))) * 1.1;
  const diag = Math.hypot(innerWidth, innerHeight);
  const step = TAU / RAYS;
  const radii = Array.from({ length: RINGS + 1 }, (_, j) => R * (j / RINGS) ** 1.65);

  const pts = Array.from({ length: RAYS }, (_, i) => {
    let angle = i * step + rand(-0.4, 0.4) * step;
    return radii.map((r, j) => {
      if (j === 0) return o;
      angle += rand(-0.06, 0.06); // rays bend slightly as they run
      const jr = j === RINGS ? 0 : (radii[j] - radii[j - 1]) * rand(-0.2, 0.2);
      return { x: o.x + Math.cos(angle) * (r + jr), y: o.y + Math.sin(angle) * (r + jr) };
    });
  });

  // Edges, shared by cracks and shards.
  const spoke = pts.map((ray) =>
    ray.map((p, j) => (j === 0 ? [o] : jag(ray[j - 1], p, Math.min(2.6, dist(ray[j - 1], p) * 0.025)))),
  );
  const ring = radii.map((_, j) =>
    pts.map((ray, i) => {
      if (j === 0 || j === RINGS) return [ray[j], pts[(i + 1) % RAYS][j]];
      const b = pts[(i + 1) % RAYS][j];
      const len = dist(ray[j], b);
      return jag(ray[j], b, Math.min(2.5, len * 0.03), len * 0.07); // bowed outward
    }),
  );

  const segs: Seg[] = [];
  const widthAt = (p: Pt) => Math.max(0.45, 1.5 * (1 - dist(p, o) / (diag * 0.75)));
  const addLine = (line: Pt[], t0: number, tPerPx: number) => {
    let t = t0;
    for (let k = 1; k < line.length; k++) {
      const a = line[k - 1];
      const b = line[k];
      segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, t, w: widthAt(a) });
      t += dist(a, b) * tPerPx;
    }
  };

  for (let i = 0; i < RAYS; i++) {
    // Some rays trail behind the rest, so the star never looks stamped.
    const lag = Math.random() < 0.4 ? rand(1.35, 1.9) : rand(1, 1.15);
    for (let j = 1; j <= RINGS; j++) addLine(spoke[i][j], (radii[j - 1] / R) * lag, lag / R);
    // A fork or two off the longer rays.
    for (let j = 2; j < RINGS - 1; j++) {
      if (Math.random() > 0.3) continue;
      const from = pts[i][j];
      const ang = Math.atan2(from.y - o.y, from.x - o.x) + (Math.random() < 0.5 ? -1 : 1) * rand(0.25, 0.55);
      const len = rand(0.25, 0.6) * (radii[j + 1] - radii[j]);
      const to = { x: from.x + Math.cos(ang) * len, y: from.y + Math.sin(ang) * len };
      addLine(jag(from, to, 2), (radii[j] / R) * lag, lag / R);
    }
  }
  for (let j = 1; j <= DRAWN_RINGS; j++) {
    for (let i = 0; i < RAYS; i++) {
      if (Math.random() < (j === 1 ? 0.85 : 0.6)) addLine(ring[j][i], (radii[j] / R) * 1.3 + 0.03, 0.4 / R);
    }
  }
  // Fine fractures right at the point of impact.
  for (let k = 0; k < 9; k++) {
    const ang = rand(0, TAU);
    const len = rand(3, 11);
    addLine(jag(o, { x: o.x + Math.cos(ang) * len, y: o.y + Math.sin(ang) * len }, 1), 0, 0);
  }

  // Shard outlines: walk out along one spoke, across the ring, back down the
  // next spoke and across the inner ring.
  const cells: Pt[][] = [];
  for (let i = 0; i < RAYS; i++) {
    const n = (i + 1) % RAYS;
    for (let j = 1; j <= RINGS; j++) {
      const poly = [
        ...spoke[i][j],
        ...ring[j][i].slice(1),
        ...[...spoke[n][j]].reverse().slice(1),
        ...(j > 1 ? [...ring[j - 1][i]].reverse().slice(1, -1) : []),
      ];
      cells.push(poly);
    }
  }
  return { o, R, cells, segs };
}

// How far the cracks have run, as a fraction of the web radius.
function front(now: number): number {
  const from = REACH[hits - 1] ?? 0;
  const to = REACH[Math.min(hits, REACH.length - 1)];
  const p = Math.min(1, (now - hitAt) / RUN_MS);
  return from + (to - from) * (1 - (1 - p) ** 3);
}

function drawCracks(c: CanvasRenderingContext2D, now: number, full = false): boolean {
  if (!web) return false;
  if (!full) wipe(c);
  const reach = full ? Infinity : front(now);

  // Group the visible pieces by width so the whole web is a handful of strokes.
  const paths = new Map<number, Path2D>();
  for (const s of web.segs) {
    if (s.t > reach) continue;
    const key = Math.round(s.w * 4) / 4;
    let path = paths.get(key);
    if (!path) paths.set(key, (path = new Path2D()));
    path.moveTo(s.ax, s.ay);
    path.lineTo(s.bx, s.by);
  }

  // A dark hairline with a brighter one riding it: reads as a crack over both
  // the cream pages and the dark hero.
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const [w, path] of paths) {
    c.strokeStyle = 'rgba(17,17,17,0.34)';
    c.lineWidth = w + 0.45;
    c.stroke(path);
    c.save();
    c.translate(-0.35, -0.35);
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = w * 0.7;
    c.stroke(path);
    c.restore();
  }

  // A small bright point where it was struck.
  const { o } = web;
  const glow = c.createRadialGradient(o.x, o.y, 0, o.x, o.y, 7);
  glow.addColorStop(0, 'rgba(255,255,255,0.9)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = glow;
  c.beginPath();
  c.arc(o.x, o.y, 7, 0, TAU);
  c.fill();

  return !full && now - hitAt < RUN_MS;
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
  if (hit > hits) {
    hits = hit;
    hitAt = performance.now();
  }
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
  hitAt = performance.now();
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
  const { o, R, cells } = web!;
  const polys: Pt[][] = [];
  for (const cell of cells) split(cell, polys, 0);

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
    c.strokeStyle = 'rgba(255,255,255,0.5)';
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

function area(p: Pt[]) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s / 2);
}

// Big cells break again along a jagged chord between two points about half the
// perimeter apart. These secondary cracks only appear as the glass gives way.
function split(poly: Pt[], out: Pt[][], depth: number) {
  const offscreen = poly.every((p) => p.x < 0) || poly.every((p) => p.y < 0) ||
    poly.every((p) => p.x > innerWidth) || poly.every((p) => p.y > innerHeight);
  if (offscreen) return;
  if (depth > 3 || poly.length < 3 || area(poly) < 22000) return void out.push(poly);

  const n = poly.length;
  const run = [0];
  for (let k = 1; k <= n; k++) run.push(run[k - 1] + dist(poly[k - 1], poly[k % n]));
  const half = run[n] / 2;
  const i = Math.floor(Math.random() * n);
  const target = half * rand(0.85, 1.15);
  let k = i;
  for (let steps = 0; steps < n && (run[k] - run[i] + run[n]) % run[n] < target; steps++) k = (k + 1) % n;
  if (k === i || (k + 1) % n === i || (i + 1) % n === k) return void out.push(poly);

  const chord = jag(poly[i], poly[k], 3).slice(1, -1);
  const a: Pt[] = [];
  for (let m = i; m !== k; m = (m + 1) % n) a.push(poly[m]);
  a.push(poly[k], ...[...chord].reverse());
  const b: Pt[] = [];
  for (let m = k; m !== i; m = (m + 1) % n) b.push(poly[m]);
  b.push(poly[i], ...chord);
  split(a, out, depth + 1);
  split(b, out, depth + 1);
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
