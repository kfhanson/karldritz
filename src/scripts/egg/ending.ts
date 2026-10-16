// The end of a won run: the Daemon goes down and takes B1 with it. Blasts
// rip through the server room, one blows a hole in the back wall, and the
// player runs out through it — to the street, where the tower is burning,
// the bugs have got out too, and that's where it stops. The timeline runs in
// Game; this holds its shapes and the street.
import { PAL } from './sprites';
import { FLOOR_TOP, rand, VIEW_H, VIEW_W } from './world';

// Stage lengths (seconds). The run to the hole lasts as long as it takes.
export const CHEER = 1.4; // hop, gun up
export const BLAST = 1.3; // explosions build, then the wall goes
export const EXIT = 0.6; // into the hole and gone
export const FLASH = 0.3; // to white, and out
export const STOP = 3.6; // outside, until the result comes up

/** Where the back wall can blow: the stretches between and beside the lifts. */
export const HOLES = [50, 136, 184, 270];
export const HOLE_W = 24;
export const HOLE_H = 24;

/** An explosion: a ball of fire that swells, burns down and leaves smoke. */
export interface Boom {
  x: number;
  y: number; // on the floor (or the street) under it
  z: number; // how far up
  r: number;
  t: number;
}
export const BOOM_LIFE = 0.55;

/** A bug out on the street, running about. */
export interface Stray {
  x: number;
  y: number;
  vx: number;
  flyer: boolean;
  t: number;
}

export interface Puff {
  x: number;
  y: number;
  r: number;
  vx: number;
  t: number;
}

export interface Ending {
  stage: 'cheer' | 'blast' | 'run' | 'exit' | 'out';
  t: number; // seconds into the stage
  hole: number; // the breach's x, once it's blown (0 before)
  edge: number[]; // its ragged sides, a pixel row at a time
  booms: Boom[];
  next: number; // seconds to the next blast
  over: boolean; // the result is up
  // Outside.
  street: HTMLCanvasElement | null;
  fires: [number, number][]; // windows on fire
  strays: Stray[];
  smoke: Puff[];
}

export function newEnding(): Ending {
  return {
    stage: 'cheer', t: 0, hole: 0, edge: [], booms: [], next: 0, over: false,
    street: null, fires: [], strays: [], smoke: [],
  };
}

/** The hole's ragged edges: how far in each row's sides sit. */
export function ragged(): number[] {
  return Array.from({ length: HOLE_H + 1 }, (_, i) => Math.round(rand(0, 3) + (i < 5 ? 5 - i : 0)));
}

type Ctx = CanvasRenderingContext2D;

/** A pixel disc, squashed a little for the floor's perspective. */
export function disc(c: Ctx, cx: number, cy: number, r: number, color: string, squash = 0.85) {
  if (r < 0.5) return;
  c.fillStyle = color;
  const ry = Math.max(1, Math.round(r * squash));
  for (let y = -ry; y <= ry; y++) {
    const half = Math.round(r * Math.sqrt(1 - (y / ry) ** 2));
    c.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2 + 1, 1);
  }
}

/** White flash, a fireball with a hot core, then smoke. */
export function drawBoom(c: Ctx, b: Boom) {
  const k = b.t / BOOM_LIFE;
  const x = b.x;
  const y = b.y - b.z;
  const r = b.r * Math.min(1, 0.35 + k * 2.2);
  if (k < 0.12) return disc(c, x, y, r, '#FFFFFF');
  if (k < 0.55) {
    disc(c, x, y, r, PAL.r);
    disc(c, x, y - 1, r * 0.72, PAL.y);
    disc(c, x, y - 1, r * (0.45 - k * 0.5), '#FFF4D6');
    return;
  }
  // Burnt out: a smoke ball that rises and thins.
  const s = (k - 0.55) / 0.45;
  disc(c, x, y - s * 8, r * (1 - s * 0.4), s < 0.5 ? '#3A3230' : '#5A504C');
}

/** The hole in B1's back wall: daylight through a ragged gap, rubble at its foot. */
export function drawHole(c: Ctx, e: Ending) {
  const x0 = e.hole - HOLE_W / 2;
  const top = FLOOR_TOP - HOLE_H;
  for (let i = 0; i <= HOLE_H; i++) {
    const y = top + i;
    const inset = e.edge[i];
    const w = HOLE_W - inset * 2;
    if (w <= 0) continue;
    // Torn concrete round the edge, light from outside within.
    c.fillStyle = '#3A3A36';
    c.fillRect(x0 + inset - 1, y, w + 2, 1);
    c.fillStyle = i < 8 ? '#F6E7C4' : i < 16 ? '#FFF4D6' : '#FFFBEF';
    c.fillRect(x0 + inset, y, w, 1);
  }
  // The ramp up and out, in the light.
  c.fillStyle = '#E3D6B8';
  for (let i = 0; i < 6; i++) c.fillRect(x0 + 6 + i, FLOOR_TOP - 6 + i, HOLE_W - 12 - i * 2, 1);
  // Light spilling across the floor in front of it.
  c.fillStyle = 'rgba(255,244,214,0.16)';
  for (let i = 0; i < 26; i++) c.fillRect(x0 - i * 0.6, FLOOR_TOP + i, HOLE_W + i * 1.2, 1);
  // Rubble either side.
  const chunks = [[-4, 1, 4], [-1, 3, 3], [HOLE_W - 2, 2, 4], [HOLE_W + 1, 0, 3], [3, 0, 2], [HOLE_W - 6, 4, 2]];
  for (const [dx, dy, s] of chunks) {
    c.fillStyle = '#5D605B';
    c.fillRect(x0 + dx, FLOOR_TOP + dy, s, s - 1);
    c.fillStyle = '#8A8D86';
    c.fillRect(x0 + dx, FLOOR_TOP + dy, s, 1);
  }
}

// ── Outside ──
// A street-level view of the tower: the sky lit orange, the city behind,
// the tower in the middle with its lobby and the breach at its foot, then
// the pavement and the road, a wreck and a police car. Painted once; fire,
// smoke, sirens and bugs go on top, live.
export const GROUND = 118; // where the tower meets the pavement
export const BREACH = { x: 162, y: GROUND + 1 };
export const TOWER = { x0: 92, x1: 228 };

export function paintStreet(fires: [number, number][]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = VIEW_W;
  c.height = VIEW_H;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };

  // Sky: smoke dark at the top, glowing towards the fires below.
  const sky = ['#231A1C', '#2E1F20', '#3D2422', '#522A23', '#6C3224', '#8A3D27', '#A44B2B', '#BC5D30'];
  sky.forEach((col, i) => px(0, i * 12, VIEW_W, 12, col));
  for (let i = 1; i < sky.length; i++) for (let x = (i % 2) * 2; x < VIEW_W; x += 4) px(x, i * 12 - 1, 2, 1, sky[i]);
  px(0, sky.length * 12, VIEW_W, GROUND - sky.length * 12, '#C86A35');

  // The city behind: two rows of blocks, a few windows still lit.
  for (const [tint, base, hi] of [['#4A302B', 60, 40], ['#3A2826', 76, 30]] as const) {
    for (let x = -4; x < VIEW_W; ) {
      const w = 14 + Math.floor(Math.random() * 22);
      const h = base - Math.floor(Math.random() * hi);
      px(x, h, w - 2, GROUND - h, tint);
      for (let wy = h + 4; wy < GROUND - 6; wy += 6) {
        for (let wx = x + 3; wx < x + w - 5; wx += 5) if (Math.random() < 0.12) px(wx, wy, 2, 2, '#E8B35A');
      }
      x += w;
    }
  }

  // The tower: concrete and glass, a darker side for depth, rows of windows
  // floor by floor, the lobby's glass along the bottom.
  const { x0, x1 } = TOWER;
  px(x0, 0, x1 - x0, GROUND, '#8F8A84');
  px(x1 - 10, 0, 10, GROUND, '#77726C');
  px(x0, 0, 1, GROUND, '#A9A49D');
  for (let y = 4, floor = 0; y < GROUND - 26; y += 12, floor++) {
    px(x0, y + 9, x1 - x0, 1, '#7A756F');
    for (let x = x0 + 5; x < x1 - 12; x += 11) {
      const blown = Math.random() < 0.18;
      px(x, y, 8, 7, blown ? '#1C1616' : '#5B6E78');
      if (!blown) {
        px(x, y, 8, 1, '#7F949E');
        px(x + 1, y + 1, 1, 3, '#9FB3BC');
      }
      if (Math.random() < 0.3) fires.push([x, y]);
    }
  }
  // The lobby: glass, the doors, the name over them.
  const ly = GROUND - 24;
  px(x0, ly - 2, x1 - x0, 2, '#5E5953');
  px(x0 + 4, ly, x1 - x0 - 18, 20, '#3B4A52');
  for (let x = x0 + 4; x < x1 - 14; x += 14) px(x, ly, 1, 20, '#6B6B66');
  px(x0 + 4, ly + 10, x1 - x0 - 18, 1, '#6B6B66');
  for (let i = 0; i < 9; i++) px(x0 + 8 + i * 13, ly + 2 + (i % 3), 2, 6, 'rgba(255,255,255,0.18)');
  px(x0 + 50, ly + 4, 22, 16, '#1C1616'); // the doors, blown in
  px(x0 + 54, ly - 8, 14, 5, '#B8913F');
  px(x0 + 56, ly - 7, 10, 3, '#8F8A84');
  // The breach at its foot: a ragged black hole, the ramp down to B1.
  for (let i = 0; i < 12; i++) {
    const w = 18 - Math.abs(6 - i) - Math.round(Math.random() * 2);
    px(BREACH.x - w / 2, GROUND - 12 + i, w, 1, i < 2 ? '#3A3230' : '#141010');
  }
  // Pavement, kerb, road.
  px(0, GROUND, VIEW_W, 14, '#A9A49B');
  for (let x = 0; x < VIEW_W; x += 16) px(x, GROUND, 1, 14, '#948F86');
  px(0, GROUND + 7, VIEW_W, 1, '#948F86');
  px(0, GROUND + 14, VIEW_W, 2, '#77726A');
  px(0, GROUND + 16, VIEW_W, VIEW_H - GROUND - 16, '#45464A');
  for (let i = 0; i < 400; i++) px(Math.floor(Math.random() * VIEW_W), GROUND + 16 + Math.floor(Math.random() * (VIEW_H - GROUND - 16)), 1, 1, i % 2 ? '#4F5054' : '#3C3D41');
  for (let x = 6; x < VIEW_W; x += 28) px(x, 158, 14, 2, PAL.y);
  // Cracks across the road, rubble from the tower on the pavement.
  for (const [cx, cy] of [[120, 140], [214, 166], [64, 172]]) {
    let x = cx;
    let y = cy;
    for (let k = 0; k < 18; k++) {
      px(x, y, 1, 1, '#2A2A2C');
      x += Math.random() < 0.7 ? 1 : 0;
      y += Math.random() < 0.5 ? (Math.random() < 0.5 ? -1 : 1) : 0;
    }
  }
  for (let i = 0; i < 24; i++) {
    const x = rand(TOWER.x0 - 10, TOWER.x1 + 10);
    const y = GROUND + rand(1, 13);
    const s = Math.random() < 0.3 ? 3 : 2;
    px(x, y, s, s - 1, '#6E6A64');
    px(x, y, s, 1, '#B7B2A9');
  }
  // A car on its roof to the left, a police car slewed across the road on the right.
  px(22, 150, 46, 10, '#2C3E5C');
  px(28, 160, 34, 5, '#1E2C42');
  px(30, 161, 30, 3, '#5B6E78');
  px(24, 148, 42, 2, '#3E5F8A');
  for (const x of [26, 56]) {
    px(x, 145, 8, 5, PAL.k);
    px(x + 2, 146, 4, 3, '#46464E');
  }
  px(248, 150, 54, 12, '#F2F0EA');
  px(248, 156, 54, 3, PAL.k);
  px(260, 143, 30, 7, '#F2F0EA');
  px(263, 144, 10, 5, '#5B6E78');
  px(276, 144, 11, 5, '#5B6E78');
  for (const x of [254, 288]) {
    px(x, 160, 9, 5, PAL.k);
    px(x + 2, 161, 5, 3, '#46464E');
  }
  // Cones.
  for (const x of [204, 226]) {
    px(x, 168, 5, 2, PAL.k);
    px(x + 1, 162, 3, 6, PAL.r);
    px(x + 1, 164, 3, 1, '#F6F5F1');
  }
  return c;
}
