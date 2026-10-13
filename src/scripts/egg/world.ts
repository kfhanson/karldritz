// The room every floor shares — its size, walls and doors — and the physics
// that happens in it: collisions with the walls and the furniture of the
// floor in play, and the pool of sparks.
export const VIEW_W = 320;
export const VIEW_H = 184;

export const WALL_TOP = 8; // top edge of the back wall on screen
export const FLOOR_TOP = 40; // where the back wall meets the floor
export const SIDE = 10; // side wall thickness
export const FRONT = 176; // the low front wall
export const ARENA = { x0: SIDE + 2, x1: VIEW_W - SIDE - 2, y0: FLOOR_TOP + 4, y1: FRONT - 2 };

export const SHADOW = 'rgba(17,17,17,0.16)';

export type PropKind = 'desk' | 'pillar' | 'plant' | 'rack' | 'server' | 'column' | 'crate';
export interface Prop {
  kind: PropKind;
  x: number; // footprint on the floor
  y: number;
  w: number;
  h: number;
  height: number; // how tall it stands, for drawing
  stopsShots: boolean;
}
export const prop = (kind: PropKind, x: number, y: number, w: number, h: number, height: number, stopsShots = false): Prop =>
  ({ kind, x, y, w, h, height, stopsShots });

// The floor in play. Module-level so the collision helpers can reach it;
// only one game runs at a time.
export let PROPS: Prop[] = [];
export function setProps(props: Prop[]) {
  PROPS = props;
}

// Where bugs come in: three lifts in the back wall, a door in each side wall.
export type DoorSide = 'back' | 'left' | 'right';
export const DOORS: { x: number; y: number; side: DoorSide }[] = [
  { x: 112, y: FLOOR_TOP, side: 'back' },
  { x: 160, y: FLOOR_TOP, side: 'back' },
  { x: 208, y: FLOOR_TOP, side: 'back' },
  { x: SIDE, y: 118, side: 'left' },
  { x: VIEW_W - SIDE, y: 118, side: 'right' },
];

export interface Body {
  x: number; // feet on the floor
  y: number;
  z: number; // height above it
  vx: number;
  vy: number;
  vz: number;
  r: number; // footprint radius
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
// Not Math.hypot: V8 doesn't inline it, so every call boxes its arguments and
// result as heap numbers. In the per-pair loops that was most of the game's
// garbage. A plain square root compiles to one instruction.
export const len = (x: number, y: number) => Math.sqrt(x * x + y * y);

/**
 * Push a circle out of the room's walls and furniture. Works on locals and
 * writes the body once: repeated stores of fractions into a body's fields
 * made garbage on every call.
 */
export function collide(b: Body, solid = true, props = PROPS) {
  const r = b.r;
  let x = clamp(b.x, ARENA.x0 + r, ARENA.x1 - r);
  let y = clamp(b.y, ARENA.y0 + r * 0.5, ARENA.y1);
  if (solid) {
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      const dx = x - clamp(x, p.x, p.x + p.w);
      const dy = y - clamp(y, p.y, p.y + p.h);
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 > 1e-6) {
        // Out along the line from the nearest point of the box.
        const d = Math.sqrt(d2);
        x += (dx / d) * (r - d);
        y += (dy / d) * (r - d);
      } else {
        // Centre inside the box: out the nearest side.
        const left = x - p.x;
        const right = p.x + p.w - x;
        const top = y - p.y;
        const bottom = p.y + p.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = p.x - r;
        else if (m === right) x = p.x + p.w + r;
        else if (m === top) y = p.y - r;
        else y = p.y + p.h + r;
      }
    }
  }
  b.x = x;
  b.y = y;
}

/**
 * Drop the finished from a list in place. Filtering into a fresh array, for
 * six lists sixty times a second, was steady work for the garbage collector.
 */
export function prune<T>(list: T[], keep: (x: T) => boolean) {
  let n = 0;
  for (let i = 0; i < list.length; i++) if (keep(list[i])) list[n++] = list[i];
  list.length = n;
}


export function blocked(x: number, y: number, r: number) {
  if (x < ARENA.x0 + r || x > ARENA.x1 - r || y < ARENA.y0 || y > ARENA.y1) return true;
  for (let i = 0; i < PROPS.length; i++) {
    const p = PROPS[i];
    if (x > p.x - r && x < p.x + p.w + r && y > p.y - r && y < p.y + p.h + r) return true;
  }
  return false;
}

/** Whether a shot (or a glob of acid) at (x, y) has run into furniture that stops it. */
export function stopsShot(x: number, y: number) {
  for (let i = 0; i < PROPS.length; i++) {
    const p = PROPS[i];
    if (p.stopsShots && x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h + 2) return true;
  }
  return false;
}

// Sparks, dust and debris, in a fixed pool of flat arrays. Late rounds throw
// off hundreds a second; as objects they kept the garbage collector busy
// enough to stall Safari. Here nothing is allocated after start-up.
export class Sparks {
  static readonly MAX = 600;
  n = 0;
  private x = new Float32Array(Sparks.MAX);
  private y = new Float32Array(Sparks.MAX);
  private z = new Float32Array(Sparks.MAX);
  private vx = new Float32Array(Sparks.MAX);
  private vy = new Float32Array(Sparks.MAX);
  private vz = new Float32Array(Sparks.MAX);
  private life = new Float32Array(Sparks.MAX);
  private max = new Float32Array(Sparks.MAX);
  private col = new Uint8Array(Sparks.MAX);
  private colors: string[] = [];

  add(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, color: string) {
    if (this.n >= Sparks.MAX) return; // full: a few missing sparks go unnoticed
    let c = this.colors.indexOf(color);
    if (c < 0) c = this.colors.push(color) - 1;
    const i = this.n++;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.life[i] = life;
    this.max[i] = life;
    this.col[i] = c;
  }

  clear() {
    this.n = 0;
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // Swap the last one into this slot.
        const j = --this.n;
        this.x[i] = this.x[j];
        this.y[i] = this.y[j];
        this.z[i] = this.z[j];
        this.vx[i] = this.vx[j];
        this.vy[i] = this.vy[j];
        this.vz[i] = this.vz[j];
        this.life[i] = this.life[j];
        this.max[i] = this.max[j];
        this.col[i] = this.col[j];
        i--;
        continue;
      }
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.vz[i] -= 380 * dt;
      this.z[i] += this.vz[i] * dt;
      if (this.z[i] < 0) {
        // Sparks bounce and skid on the floor.
        this.z[i] = 0;
        this.vz[i] = -this.vz[i] * 0.35;
        this.vx[i] *= 0.6;
        this.vy[i] *= 0.6;
      }
    }
  }

  /** Fading ones flicker out on alternate frames: pixel-style, and no alpha changes. */
  draw(c: CanvasRenderingContext2D, frame: number) {
    let current = -1;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] < this.max[i] * 0.5 && (i + frame) & 1) continue;
      if (this.col[i] !== current) {
        current = this.col[i];
        c.fillStyle = this.colors[current];
      }
      c.fillRect(Math.round(this.x[i]), Math.round(this.y[i] - this.z[i]), 1, 1);
    }
  }
}
