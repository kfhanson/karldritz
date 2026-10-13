// The Root Bug's quake: the office floor cracking from the slam, its tiles
// giving way and everything dropping to B1. The timeline runs in Game; this
// holds its shapes and the parts that don't need the game.
import { clamp, FLOOR_TOP, FRONT, len, rand, SIDE, VIEW_H, VIEW_W } from './world';
import type { Enemy } from './game';

/** One office floor tile during the collapse. */
export interface Tile {
  x: number;
  y: number;
  at: number; // quake time it gives way
  h: number; // how far it has fallen
  v: number;
}

/** A bit of rubble falling with the camera, painted onto B1 where it lands. */
export interface Rubble {
  x: number;
  y: number;
  h: number;
  v: number;
  w: number;
  color: string;
}

/** Something on the office floor riding a tile down. */
export interface Faller {
  h: number;
  v: number;
  falling: boolean;
  landed: boolean;
  tx: number; // where it lands on B1, clear of the furniture there
  ty: number;
}

// The fall from the office to B1, as one timeline (seconds):
// rear up, slam at SLAM, cracks race out until BREAK, then tiles give way
// outward from the impact and everything drops a DEPTH into the floor below.
export const SLAM = 0.9;
export const BREAK = 2.1;
export const DEPTH = 232;
export const FALL_G = 420;
export const TILE_W = 20;
export const TILE_H = 12;

export interface Quake {
  t: number;
  king: Enemy;
  x: number; // impact
  y: number;
  cracks: HTMLCanvasElement;
  cracked: HTMLCanvasElement; // the office floor with the cracks baked in
  tiles: Tile[];
  rubble: Rubble[];
  player: Faller;
  boss: Faller;
  cam: number;
  landT: number;
  nextFx: number;
}

/** The tile under a point of the office floor. */
export function tileAt(q: Quake, x: number, y: number): Tile {
  const cols = (VIEW_W - SIDE * 2) / TILE_W;
  const rows = Math.ceil((FRONT - FLOOR_TOP) / TILE_H);
  const col = clamp(Math.floor((x - SIDE) / TILE_W), 0, cols - 1);
  const row = clamp(Math.floor((y - FLOOR_TOP) / TILE_H), 0, rows - 1);
  return q.tiles[row * cols + col];
}

/** How far the cracks have run from the impact, in floor pixels. */
export function crackReach(q: Quake) {
  const k = clamp((q.t - SLAM) / (BREAK - SLAM - 0.15), 0, 1);
  return 330 * (1 - (1 - k) ** 3);
}

// The crack web from the slam: straight rays that wander and fork, rings
// round the impact, a crater in the middle. Same look as the glass.
export function paintCracks(ix: number, iy: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = VIEW_W;
  c.height = VIEW_H;
  const g = c.getContext('2d')!;
  const pts: number[] = [];
  const inside = (x: number, y: number) => x > SIDE + 1 && x < VIEW_W - SIDE - 2 && y > FLOOR_TOP + 1 && y < FRONT - 2;
  const seg = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) pts.push(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n));
  };
  const ray = (x: number, y: number, a: number, len: number, depth: number) => {
    for (let walked = 0; walked < len; ) {
      const step = rand(6, 13);
      a += rand(-0.35, 0.35);
      let nx = x + Math.cos(a) * step;
      let ny = y + Math.sin(a) * step * 0.6; // squashed: the floor's in perspective
      const out = !inside(nx, ny);
      if (out) (nx = clamp(nx, SIDE + 2, VIEW_W - SIDE - 3)), (ny = clamp(ny, FLOOR_TOP + 2, FRONT - 3));
      seg(x, y, nx, ny);
      if (out) return;
      [x, y] = [nx, ny];
      walked += step;
      if (depth < 2 && Math.random() < 0.16) ray(x, y, a + (Math.random() < 0.5 ? -1 : 1) * rand(0.5, 0.9), (len - walked) * 0.5, depth + 1);
    }
  };
  const n = 11;
  const angles = Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2 + rand(-0.2, 0.2));
  for (const a of angles) ray(ix, iy, a, rand(90, 240), 0);
  // Rings: chords between neighbouring rays, close in.
  for (const r of [9, 17, 28]) {
    for (let i = 0; i < n; i++) {
      if (Math.random() > 0.65) continue;
      const a0 = angles[i];
      const a1 = angles[(i + 1) % n];
      const r0 = r * rand(0.85, 1.15);
      const r1 = r * rand(0.85, 1.15);
      const x0 = ix + Math.cos(a0) * r0;
      const y0 = iy + Math.sin(a0) * r0 * 0.6;
      const x1 = ix + Math.cos(a1) * r1;
      const y1 = iy + Math.sin(a1) * r1 * 0.6;
      if (inside(x0, y0) && inside(x1, y1)) seg(x0, y0, x1, y1);
    }
  }
  // The crater: crushed tile, darker at the heart.
  for (let y = -5; y <= 5; y++) {
    for (let x = -9; x <= 9; x++) {
      const d = len(x / 9, y / 5) + rand(-0.12, 0.12);
      if (d > 1 || !inside(ix + x, iy + y)) continue;
      g.fillStyle = d < 0.45 ? '#7E7A71' : d < 0.75 ? '#A39F95' : '#C4C0B6';
      g.fillRect(Math.round(ix + x), Math.round(iy + y), 1, 1);
    }
  }
  // A lit lower edge under every crack, then the crack itself.
  g.fillStyle = '#FBFAF6';
  for (let i = 0; i < pts.length; i += 2) g.fillRect(pts[i], pts[i + 1] + 1, 1, 1);
  g.fillStyle = '#5E5A52';
  for (let i = 0; i < pts.length; i += 2) g.fillRect(pts[i], pts[i + 1], 1, 1);
  return c;
}
