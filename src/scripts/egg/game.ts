// Bug Hunt — a 2.5D survival arena. One office floor seen from a three-quarter
// view; bugs come in through the lifts in the back wall and the side doors,
// round after round, each round bigger and every fifth with a boss. Move with
// WASD, aim at the cursor, dash out of trouble.
//
// The world is the floor plane in pixels; things with height (flyers, bullets,
// sparks) carry a z and are drawn that far up the screen, with a shadow on
// the floor. Everything is drawn back to front by its y.
// Fixed 60 Hz simulation on a 320×184 pixel canvas.
import { burst, tone } from './audio';
import { buildSprites, drawText, PAL, type Sprite, type Sprites } from './sprites';
import { buildGuns, buildPerson, GUN_ANGLES, PEOPLE, PERSON_SHOULDER, PERSON_VIEW } from './people';
import { freshLoadout, liftKinds, LIFT_LABEL, makeOffer, WEAPONS, type Ctx, type Loadout, type Offer, type OfferKind } from './upgrades';

export const VIEW_W = 320;
export const VIEW_H = 184;

// ── The room ──
const WALL_TOP = 8; // top edge of the back wall on screen
const FLOOR_TOP = 40; // where the back wall meets the floor
const SIDE = 10; // side wall thickness
const FRONT = 176; // the low front wall
const ARENA = { x0: SIDE + 2, x1: VIEW_W - SIDE - 2, y0: FLOOR_TOP + 4, y1: FRONT - 2 };

type PropKind = 'desk' | 'pillar' | 'plant' | 'rack';
interface Prop {
  kind: PropKind;
  x: number; // footprint on the floor
  y: number;
  w: number;
  h: number;
  height: number; // how tall it stands, for drawing
  stopsShots: boolean;
}
const prop = (kind: PropKind, x: number, y: number, w: number, h: number, height: number, stopsShots = false): Prop =>
  ({ kind, x, y, w, h, height, stopsShots });
const PROPS: Prop[] = [
  prop('pillar', 84, 92, 12, 7, 46, true),
  prop('pillar', 224, 92, 12, 7, 46, true),
  prop('desk', 34, 64, 30, 9, 8),
  prop('desk', 256, 64, 30, 9, 8),
  prop('desk', 40, 140, 30, 9, 8),
  prop('desk', 250, 140, 30, 9, 8),
  prop('rack', 146, 154, 28, 8, 30, true),
  prop('plant', 120, 60, 6, 4, 14),
  prop('plant', 194, 60, 6, 4, 14),
  prop('plant', 20, 104, 6, 4, 14),
  prop('plant', 294, 104, 6, 4, 14),
];

// Where bugs come in: three lifts in the back wall, a door in each side wall.
type DoorSide = 'back' | 'left' | 'right';
const DOORS: { x: number; y: number; side: DoorSide }[] = [
  { x: 112, y: FLOOR_TOP, side: 'back' },
  { x: 160, y: FLOOR_TOP, side: 'back' },
  { x: 208, y: FLOOR_TOP, side: 'back' },
  { x: SIDE, y: 118, side: 'left' },
  { x: VIEW_W - SIDE, y: 118, side: 'right' },
];

const STEP = 1 / 60;
const SPEED = 80;
const DASH_SPEED = 250;
const DASH_TIME = 0.17;
const DASH_COOL = 0.65;
const BULLET = 300;
const GUN_Z = PERSON_SHOULDER; // shots fly at shoulder height
const REACH = 4; // how far the gun hand is from the shoulder

// Office colours, kept to the site palette plus glass and steel.
const WALL = '#F1EFE9';
const FLOOR_A = '#ECEAE3';
const FLOOR_B = '#E7E4DC';
const GROUT = '#DDD9D0';
const RUG = '#D9E0DA';
const GLASS = '#E2E7E5';
const SKYLINE = '#CDD4D0';
const MULLION = '#9C9B94';
const STEEL = '#BDBBB3';
const STEEL_HI = '#D6D4CD';
const SHADOW = 'rgba(17,17,17,0.16)';

type Kind = 'crawler' | 'flyer' | 'brute' | 'boss';

interface Body {
  x: number; // feet on the floor
  y: number;
  z: number; // height above it
  vx: number;
  vy: number;
  vz: number;
  r: number; // footprint radius
}

interface Player extends Body {
  lx: number; // where it's looking (unit vector): aim, or the way it last moved
  ly: number;
  kick: number; // recoil on the gun hand
  blink: number; // seconds to the next blink (negative while blinking)
  hp: number;
  inv: number;
  cool: number;
  rapid: number;
  dash: number; // time left in a dash
  dashCool: number;
  dx: number; // dash direction
  dy: number;
  anim: number;
  dead: boolean;
}

interface Enemy extends Body {
  kind: Kind;
  hp: number;
  speed: number;
  dir: 1 | -1;
  flash: number;
  t: number;
  // Crawler lunges and boss charges: wind up, then go.
  wind: number;
  rush: number;
  rx: number;
  ry: number;
  next: number;
  life: number; // attract mode only: wanders off after this long
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  pierce: number; // bugs it can still pass through
  bounce: number; // walls it can still bounce off
  size: number;
  color: string;
  hit: Set<Enemy>; // already struck, so a piercing shot doesn't hit twice
}

interface Pickup extends Body {
  kind: 'heart' | 'bolt' | 'chip';
  value: number; // chips
  life: number;
}

interface Door {
  x: number;
  y: number;
  side: DoorSide;
  charge: number; // seconds until the door lets something out
  queue: Kind | null;
  open: number; // 0 shut … 1 open
  hold: number;
}

export interface Hud {
  round: number;
  score: number;
  best: number;
  hp: number;
  maxHp: number;
  mult: number;
  rapid: boolean;
  chips: number;
  weapon: string;
  weaponId: string;
}

export interface Hooks {
  hud(h: Hud): void;
  banner(title: string, sub?: string): void;
  over(result: { score: number; round: number; best: number; record: boolean }): void;
  /** The player stepped into a lift: show its choices; call finishOffer() when done. */
  offer(o: Offer): void;
}

export type { Offer } from './upgrades';

export type Action = 'left' | 'right' | 'up' | 'down' | 'jump' | 'fire';

/** How the player aims: at the mouse, along their facing, or at the nearest bug (touch). */
export type AimMode = 'mouse' | 'facing' | 'auto';

const STATS: Record<Kind, { r: number; score: number }> = {
  crawler: { r: 4, score: 10 },
  flyer: { r: 4, score: 15 },
  brute: { r: 7, score: 50 },
  boss: { r: 13, score: 400 },
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function loadBest(): number {
  try {
    return Number(localStorage.getItem('egg-best')) || 0;
  } catch {
    return 0;
  }
}

/** Push a circle out of the room's walls and furniture. */
function collide(b: Body, solid = true) {
  b.x = clamp(b.x, ARENA.x0 + b.r, ARENA.x1 - b.r);
  b.y = clamp(b.y, ARENA.y0 + b.r * 0.5, ARENA.y1);
  if (!solid) return;
  for (const p of PROPS) {
    const cx = clamp(b.x, p.x, p.x + p.w);
    const cy = clamp(b.y, p.y, p.y + p.h);
    const dx = b.x - cx;
    const dy = b.y - cy;
    const d = Math.hypot(dx, dy);
    if (d >= b.r) continue;
    if (d > 0.001) {
      b.x = cx + (dx / d) * b.r;
      b.y = cy + (dy / d) * b.r;
    } else {
      // Centre inside the box: out the nearest side.
      const out = [b.x - p.x, p.x + p.w - b.x, b.y - p.y, p.y + p.h - b.y];
      const k = out.indexOf(Math.min(...out));
      if (k === 0) b.x = p.x - b.r;
      else if (k === 1) b.x = p.x + p.w + b.r;
      else if (k === 2) b.y = p.y - b.r;
      else b.y = p.y + p.h + b.r;
    }
  }
}

const blocked = (x: number, y: number, r: number) =>
  x < ARENA.x0 + r || x > ARENA.x1 - r || y < ARENA.y0 || y > ARENA.y1 ||
  PROPS.some((p) => x > p.x - r && x < p.x + p.w + r && y > p.y - r && y < p.y + p.h + r);

// Sparks, dust and debris, in a fixed pool of flat arrays. Late rounds throw
// off hundreds a second; as objects they kept the garbage collector busy
// enough to stall Safari. Here nothing is allocated after start-up.
class Sparks {
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

export class Game {
  mode: 'attract' | 'play' | 'paused' | 'over' | 'offer' = 'attract';

  private ctx: CanvasRenderingContext2D;
  private sprites: Sprites = buildSprites();
  private person = buildPerson();
  private guns = buildGuns();
  private bg: HTMLCanvasElement;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private time = 0;

  private held = new Set<Action>();
  private dashPressed = false;
  private aim = { x: VIEW_W / 2, y: VIEW_H / 2 };
  private aimMode: AimMode = 'facing';

  private player: Player | null = null;
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private sparks = new Sparks();
  private drawList: { y: number; kind: number; ref: unknown }[] = [];
  private frameNo = 0;
  private pickups: Pickup[] = [];
  private pops: { x: number; y: number; text: string; life: number }[] = [];
  private doors: Door[] = DOORS.map((d) => ({ ...d, charge: 0, queue: null, open: 0, hold: 0 }));

  private round = 0;
  private phase: 'intro' | 'fight' | 'clear' | 'lifts' | 'riding' | 'arriving' = 'intro';
  private loadout: Loadout = freshLoadout();
  private chips = 0;
  private lifts: OfferKind[] = []; // what each back lift leads to, left to right, after a boss
  private ride = -1; // which back door the player is riding
  private phaseT = 0;
  private toSpawn: Kind[] = [];
  private spawnT = 0;
  private score = 0;
  private best = loadBest();
  private combo = 0;
  private comboT = 0;
  private shakeT = 0;
  private shakeK = 0;
  private hitstop = 0;
  private deadT = 0;
  private lastHud = '';
  private hudAt = -Infinity;
  private hudHp = -1;
  private hudRound = -1;

  constructor(
    private canvas: HTMLCanvasElement,
    private hooks: Hooks,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.bg = this.paintRoom();
    this.resize(1);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ── Lifecycle ──
  resize(k: number) {
    this.canvas.width = VIEW_W * k;
    this.canvas.height = VIEW_H * k;
    this.ctx.setTransform(k, 0, 0, k, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.render();
  }

  start() {
    this.enemies = [];
    this.bullets = [];
    this.pickups = [];
    this.sparks.clear();
    this.pops = [];
    this.resetDoors();
    this.score = 0;
    this.combo = 0;
    this.comboT = 0;
    this.deadT = 0;
    this.chips = 0;
    this.loadout = freshLoadout();
    this.lifts = [];
    this.ride = -1;
    this.held.clear();
    this.player = {
      x: 160, y: 118, z: 0, vx: 0, vy: 0, vz: 0, r: 4,
      lx: 0, ly: 1, kick: 0, blink: 2, hp: this.loadout.maxHp, inv: 0, cool: 0, rapid: 0,
      dash: 0, dashCool: 0, dx: 1, dy: 0, anim: 0, dead: false,
    };
    this.mode = 'play';
    this.startRound(1);
  }

  pause() {
    if (this.mode !== 'play') return;
    this.mode = 'paused';
    this.held.clear();
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'play';
    this.last = performance.now();
  }

  /** Back to the idle room behind the menu. */
  attract() {
    this.mode = 'attract';
    this.player = null;
    this.enemies = [];
    this.bullets = [];
    this.pickups = [];
    this.resetDoors();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }

  press(a: Action) {
    if (a === 'jump' && !this.held.has('jump')) this.dashPressed = true;
    this.held.add(a);
  }

  release(a: Action) {
    this.held.delete(a);
  }

  /** Aim point in game pixels (the arcade maps the mouse onto the canvas). */
  setAim(x: number, y: number) {
    this.aim.x = x;
    this.aim.y = y;
  }

  setAimMode(mode: AimMode) {
    this.aimMode = mode;
  }

  private resetDoors() {
    for (const d of this.doors) Object.assign(d, { charge: 0, queue: null, open: 0, hold: 0 });
  }

  // ── Loop ──
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.mode === 'paused') return;
    if (this.mode === 'offer') return void this.render();
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps++ < 5) {
      this.update(STEP);
      this.acc -= STEP;
    }
    if (steps > 5) this.acc = 0;
    this.render();
  };

  private update(dt: number) {
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }
    this.time += dt;
    this.shakeT = Math.max(0, this.shakeT - dt);

    if (this.mode === 'play') this.updateRound(dt);
    else this.updateAttract(dt);

    this.updateDoors(dt);
    if (this.player) this.updatePlayer(this.player, dt);
    for (const e of this.enemies) this.updateEnemy(e, dt);
    this.separate();
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateFx(dt);
    this.dashPressed = false;

    if (this.comboT > 0 && (this.comboT -= dt) <= 0) this.combo = 0;
    this.enemies = this.enemies.filter((e) => e.hp > 0 && e.life > 0);
    this.pushHud();
  }

  // ── Rounds ──
  private startRound(r: number) {
    this.round = r;
    this.phase = 'intro';
    this.phaseT = 1.8;
    this.toSpawn = this.roster(r);
    this.spawnT = 0;
    const boss = r % 5 === 0;
    this.hooks.banner(`Round ${r}`, boss ? 'Something big is riding the lift' : `${this.toSpawn.length} bugs inbound`);
    [523, 659, 784].forEach((f, i) => tone(f, f, 0.12, 0.08, 'square', i * 0.11));
  }

  private roster(r: number): Kind[] {
    const list: Kind[] = [];
    const n = 5 + r * 3;
    const flyer = r >= 2 ? Math.min(0.4, 0.1 + 0.05 * r) : 0;
    const brute = r >= 4 ? Math.min(0.2, 0.04 + 0.02 * r) : 0;
    for (let i = 0; i < n; i++) {
      const roll = Math.random();
      list.push(roll < brute ? 'brute' : roll < brute + flyer ? 'flyer' : 'crawler');
    }
    if (r % 5 === 0) list.splice(Math.floor(n / 3), 0, 'boss');
    return list;
  }

  private updateRound(dt: number) {
    const p = this.player!;
    if (p.dead) {
      this.deadT += dt;
      if (this.deadT > 1.4 && this.mode === 'play') this.gameOver();
      return;
    }
    this.phaseT -= dt;
    if (this.phase === 'intro' && this.phaseT <= 0) this.phase = 'fight';
    else if (this.phase === 'fight') {
      const maxAlive = Math.min(18, 6 + this.round);
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.toSpawn.length && this.enemies.length + this.queued() < maxAlive) {
        if (this.callDoor(this.toSpawn[0])) {
          this.toSpawn.shift();
          this.spawnT = Math.max(0.35, 1.3 - this.round * 0.08);
        }
      }
      if (!this.toSpawn.length && !this.queued() && !this.enemies.length) {
        const healed = p.hp < this.loadout.maxHp;
        p.hp = Math.min(this.loadout.maxHp, p.hp + 1);
        [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.14, 0.08, 'triangle', i * 0.09));
        if (this.round % 5 === 0) {
          // After a boss, the back lifts open, each going somewhere different.
          this.phase = 'lifts';
          this.lifts = liftKinds();
          this.hooks.banner('Boss down', `Take a lift: ${this.lifts.map((k) => LIFT_LABEL[k]).join(' · ')}`);
        } else {
          this.phase = 'clear';
          this.phaseT = 2.4;
          this.hooks.banner(`Round ${this.round} cleared`, healed ? '+1 heart' : 'Full health');
        }
      }
    } else if (this.phase === 'clear' && this.phaseT <= 0) this.startRound(this.round + 1);
    else if (this.phase === 'lifts') {
      // Walk into an open lift to take it.
      const back = this.doors.filter((d) => d.side === 'back');
      back.forEach((d) => ((d.open = Math.min(1, d.open + dt * 3)), (d.hold = 1)));
      const k = back.findIndex((d) => Math.abs(p.x - d.x) < 8 && p.y <= ARENA.y0 + 3);
      if (k >= 0) {
        this.phase = 'riding';
        this.phaseT = 0.75;
        this.ride = k;
        p.x = back[k].x;
        p.vx = p.vy = 0;
        this.held.clear();
        tone(1175, 1175, 0.15, 0.05, 'sine');
      }
    } else if (this.phase === 'riding') {
      // In, doors shut, up it goes.
      const back = this.doors.filter((d) => d.side === 'back');
      back.forEach((d, i) => (d.open = Math.max(0, d.open - dt * (i === this.ride ? 2.2 : 4))));
      if (this.phaseT <= 0) {
        const kind = this.lifts[this.ride];
        this.mode = 'offer';
        this.hooks.offer(makeOffer(kind, this.loadout, this.chips, this.round / 5));
      }
    } else if (this.phase === 'arriving') {
      // Back down: the doors open and out it steps.
      const d = this.doors.filter((x) => x.side === 'back')[this.ride];
      d.open = Math.min(1, d.open + dt * 2.5);
      if (this.phaseT <= 0) {
        d.hold = 0.3;
        this.ride = -1;
        this.startRound(this.round + 1);
      }
    }
  }

  // ── Lifts: what the arcade calls while an offer is open ──
  private upCtx(): Ctx {
    const p = this.player!;
    return { l: this.loadout, heal: (n) => (p.hp = Math.min(this.loadout.maxHp, p.hp + n)) };
  }

  get funds() {
    return this.chips;
  }

  get weaponId() {
    return this.loadout.weapon;
  }

  /** Spend chips on a shop item. Returns false if they can't afford it. */
  buy(item: { price: number; apply(c: Ctx): void }): boolean {
    if (this.chips < item.price) return false;
    this.chips -= item.price;
    item.apply(this.upCtx());
    this.pushHud();
    tone(880, 1760, 0.1, 0.06, 'triangle');
    return true;
  }

  takePerk(perk: { apply(c: Ctx): void }) {
    perk.apply(this.upCtx());
    this.pushHud();
  }

  takeWeapon(id: string) {
    this.loadout.weapon = id;
    this.pushHud();
  }

  repair() {
    const p = this.player!;
    p.hp = this.loadout.maxHp;
    this.chips += 10;
    this.pushHud();
  }

  /** Back to the room, out of the lift the player took. */
  finishOffer() {
    if (this.mode !== 'offer') return;
    const p = this.player!;
    const d = this.doors.filter((x) => x.side === 'back')[this.ride];
    p.x = d.x;
    p.y = ARENA.y0 + 8;
    p.inv = 1.2;
    p.cool = 0.3;
    this.mode = 'play';
    this.phase = 'arriving';
    this.phaseT = 0.6;
    this.last = performance.now();
    this.pushHud();
    tone(1175, 1175, 0.12, 0.05, 'sine');
  }

  private updateAttract(dt: number) {
    // Keep the room alive behind the menu: a few bugs wander about.
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.enemies.length + this.queued() < 6) {
      this.callDoor(Math.random() < 0.35 ? 'flyer' : 'crawler');
      this.spawnT = rand(1.2, 2.6);
    }
    for (const e of this.enemies) e.life -= dt;
  }

  private queued() {
    return this.doors.filter((d) => d.queue).length;
  }

  // Pick an idle door, preferring ones away from the player.
  private callDoor(kind: Kind): boolean {
    const p = this.player;
    let free = this.doors.filter((d) => !d.queue && (kind !== 'boss' || d.side === 'back'));
    if (p && free.length > 1) {
      const far = free.filter((d) => Math.hypot(d.x - p.x, d.y - p.y) > 70);
      if (far.length) free = far;
    }
    if (!free.length) return false;
    const d = free[Math.floor(Math.random() * free.length)];
    d.queue = kind;
    d.charge = kind === 'boss' ? 1.8 : 0.9;
    if (this.mode === 'play') tone(kind === 'boss' ? 330 : 880, kind === 'boss' ? 330 : 880, 0.08, 0.04, 'sine');
    return true;
  }

  private updateDoors(dt: number) {
    for (const d of this.doors) {
      if (d.queue) {
        d.charge -= dt;
        d.open = clamp(1 - d.charge / 0.4, 0, 1); // doors part over the last moments
        if (d.charge <= 0) {
          this.spawn(d.queue, d);
          if (this.mode === 'play' && d.side === 'back') tone(1175, 1175, 0.12, 0.05, 'sine'); // lift ding
          d.queue = null;
          d.hold = 0.6;
        }
      } else if (d.hold > 0) d.hold -= dt;
      else d.open = Math.max(0, d.open - dt * 2.5);
    }
  }

  private spawn(kind: Kind, d: Door) {
    const r = Math.max(1, this.round);
    const hp = { crawler: r >= 6 ? 3 : 2, flyer: r >= 8 ? 2 : 1, brute: 8 + r, boss: 30 + r * 5 }[kind];
    const speed = {
      crawler: Math.min(66, 32 + r * 2.5),
      flyer: Math.min(64, 36 + r * 2),
      brute: Math.min(30, 18 + r),
      boss: 16,
    }[kind];
    const rad = STATS[kind].r;
    // Step out of the doorway into the room.
    const x = d.side === 'left' ? SIDE + rad + 2 : d.side === 'right' ? VIEW_W - SIDE - rad - 2 : d.x;
    const y = d.side === 'back' ? FLOOR_TOP + rad + 2 : d.y;
    this.enemies.push({
      kind, x, y, z: kind === 'flyer' ? 12 : 0, vx: 0, vy: 0, vz: 0, r: rad, hp, speed,
      dir: 1, flash: 0, t: Math.random() * 10, wind: 0, rush: 0, rx: 0, ry: 0, next: rand(1.5, 3),
      life: this.mode === 'play' ? Infinity : rand(9, 14),
    });
    this.puff(x, y, kind === 'boss' ? 26 : 6, PAL.r);
    if (kind === 'boss') this.shake(6, 0.5);
  }

  // ── Player ──
  private gun(p: Player) {
    return { x: p.x, y: p.y - GUN_Z }; // the shoulder, on screen
  }

  private aimDir(p: Player): { x: number; y: number } {
    const g = this.gun(p);
    let tx: number | null = null;
    let ty = 0;
    if (this.aimMode === 'mouse') {
      tx = this.aim.x;
      ty = this.aim.y;
    } else if (this.aimMode === 'auto') {
      let best = 150 * 150;
      for (const e of this.enemies) {
        const ex = e.x;
        const ey = e.y - e.z - 4;
        const d = (ex - g.x) ** 2 + (ey - g.y) ** 2;
        if (e.hp > 0 && d < best) [best, tx, ty] = [d, ex, ey];
      }
    }
    if (tx === null) return { x: p.lx, y: p.ly };
    const dx = tx - g.x;
    const dy = ty - g.y;
    const d = Math.hypot(dx, dy);
    return d < 4 ? { x: p.lx, y: p.ly } : { x: dx / d, y: dy / d };
  }

  private updatePlayer(p: Player, dt: number) {
    if (p.dead) return;
    const h = this.held;
    let ix = (h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0);
    let iy = (h.has('down') ? 1 : 0) - (h.has('up') ? 1 : 0);
    const il = Math.hypot(ix, iy);
    if (il) (ix /= il), (iy /= il);

    p.dashCool -= dt;
    if (this.dashPressed && p.dashCool <= 0 && p.dash <= 0) {
      p.dash = DASH_TIME;
      p.dashCool = DASH_COOL * this.loadout.dashCool;
      [p.dx, p.dy] = il ? [ix, iy] : [p.lx, p.ly];
      p.inv = Math.max(p.inv, DASH_TIME + 0.05);
      tone(300, 900, 0.1, 0.06, 'triangle');
    }
    if (p.dash > 0) {
      p.dash -= dt;
      p.vx = p.dx * DASH_SPEED;
      p.vy = p.dy * DASH_SPEED;
      if (Math.random() < 0.6) this.dust(p.x, p.y, 1);
    } else {
      // Quick to start, quick to stop: twin-stick, not ice.
      const k = Math.min(1, (il ? 14 : 18) * dt);
      p.vx += (ix * SPEED - p.vx) * k;
      p.vy += (iy * SPEED - p.vy) * k;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    collide(p);

    if (this.aimMode === 'facing' && il) [p.lx, p.ly] = [ix, iy];
    const aim = this.aimDir(p);
    if (this.aimMode !== 'facing') [p.lx, p.ly] = [aim.x, aim.y];
    p.kick = Math.max(0, p.kick - dt);
    p.blink -= dt;
    if (p.blink < -0.13) p.blink = rand(2, 4.5);

    p.cool -= dt;
    if (h.has('fire') && p.cool <= 0 && p.dash <= 0) {
      const l = this.loadout;
      const w = WEAPONS[l.weapon];
      p.cool = w.cool * l.rate * (p.rapid > 0 ? 0.5 : 1);
      p.kick = 0.08;
      // Out of the fingertip, fanned when there's more than one.
      const muzzle = REACH + this.guns[l.weapon].muzzle;
      const bx = p.x + aim.x * muzzle;
      const by = p.y + aim.y * muzzle;
      const n = w.pellets + l.extra;
      const fan = n > 1 ? Math.max(w.spread, 0.16 * (n - 1)) : 0;
      const base = Math.atan2(aim.y, aim.x);
      for (let k = 0; k < n; k++) {
        const a = base + (n > 1 ? -fan / 2 + (fan * k) / (n - 1) : rand(-w.spread, w.spread) / 2);
        const sp = w.speed * (w.pellets > 1 ? rand(0.85, 1.1) : 1);
        this.bullets.push({
          x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: w.life * (w.pellets > 1 ? rand(0.8, 1.15) : 1),
          dmg: w.dmg + l.dmg, pierce: w.pierce + l.pierce, bounce: w.bounce, size: w.size, color: w.color, hit: new Set(),
        });
      }
      this.sparks.add(bx, by, GUN_Z, aim.x * 30, aim.y * 30, 0, 0.06, PAL.y);
      if (w.id === 'shotgun') burst(0.14, 600, 0.35, 'lowpass');
      else if (w.id === 'rail') tone(1400, 300, 0.12, 0.05, 'sawtooth');
      else if (w.id === 'revolver') (burst(0.08, 900, 0.25, 'lowpass'), tone(600, 300, 0.06, 0.04, 'square'));
      else (burst(0.04, 1800, 0.18), tone(w.id === 'smg' ? 1100 : 900, 480, 0.05, 0.035, 'square'));
      if (w.id === 'shotgun') (p.vx -= aim.x * 60), (p.vy -= aim.y * 60);
    }
    p.inv -= dt;
    p.rapid -= dt;
    p.anim += Math.hypot(p.vx, p.vy) * dt;

    for (const e of this.enemies) {
      if (p.inv > 0 || e.hp <= 0 || e.z > 18) continue;
      if (Math.hypot(p.x - e.x, p.y - e.y) < p.r + e.r - 1) {
        const d = Math.hypot(p.x - e.x, p.y - e.y) || 1;
        this.hurt(p, (p.x - e.x) / d, (p.y - e.y) / d);
      }
    }
  }

  private hurt(p: Player, nx: number, ny: number) {
    p.hp -= 1;
    p.inv = 1.1;
    p.vx = nx * 160;
    p.vy = ny * 160;
    this.combo = 0;
    this.shake(5, 0.25);
    this.hitstop = 0.08;
    this.puff(p.x, p.y, 8, PAL.g);
    tone(220, 70, 0.25, 0.12, 'sawtooth');
    burst(0.15, 400, 0.35, 'lowpass');
    if (p.hp <= 0) {
      p.dead = true;
      this.puff(p.x, p.y, 30, PAL.g);
      this.puff(p.x, p.y, 12, PAL.c);
      this.shake(8, 0.5);
      [392, 330, 262, 196].forEach((f, i) => tone(f, f * 0.9, 0.2, 0.09, 'square', 0.2 + i * 0.16));
    }
  }

  private gameOver() {
    const record = this.score > this.best;
    if (record) {
      this.best = this.score;
      try {
        localStorage.setItem('egg-best', String(this.score));
      } catch {}
    }
    this.mode = 'over';
    this.player = null;
    this.hooks.over({ score: this.score, round: this.round, best: this.best, record });
  }

  // ── Bugs ──
  private target(): { x: number; y: number } {
    const p = this.player;
    if (p && !p.dead) return { x: p.x, y: p.y };
    // No one to chase: drift after a point that roams the room.
    return { x: 160 + Math.sin(this.time * 0.35) * 120, y: 110 + Math.sin(this.time * 0.53) * 50 };
  }

  // Head for (tx, ty), sliding round furniture: try the straight line, then
  // fan out until a way is clear.
  private steer(e: Enemy, tx: number, ty: number, speed: number) {
    const base = Math.atan2(ty - e.y, tx - e.x);
    const look = e.r + 6;
    for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) {
      const a = base + off * e.dir;
      if (!blocked(e.x + Math.cos(a) * look, e.y + Math.sin(a) * look, e.r)) {
        return { x: Math.cos(a) * speed, y: Math.sin(a) * speed };
      }
    }
    return { x: Math.cos(base) * speed, y: Math.sin(base) * speed };
  }

  private updateEnemy(e: Enemy, dt: number) {
    e.t += dt;
    e.flash -= dt;
    const tgt = this.target();
    const dist = Math.hypot(tgt.x - e.x, tgt.y - e.y);

    if (e.kind === 'flyer') {
      // Flyers hover over everything, weaving as they come.
      const a = Math.atan2(tgt.y - e.y, tgt.x - e.x) + Math.sin(e.t * 3) * 0.9;
      e.vx += (Math.cos(a) * e.speed - e.vx) * Math.min(1, 2.2 * dt);
      e.vy += (Math.sin(a) * e.speed - e.vy) * Math.min(1, 2.2 * dt);
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.z = 11 + Math.sin(e.t * 5) * 2.5;
      collide(e, false);
      e.dir = e.vx < 0 ? -1 : 1;
      return;
    }

    // Lunge (crawlers) and charge (boss): wind up in place, then rush.
    const lunges = e.kind === 'crawler' || e.kind === 'boss';
    if (lunges && this.player && !this.player.dead) {
      e.next -= dt;
      const reach = e.kind === 'boss' ? 150 : 34;
      if (e.wind <= 0 && e.rush <= 0 && e.next <= 0 && dist < reach) {
        e.wind = e.kind === 'boss' ? 0.6 : 0.28;
        e.rx = (tgt.x - e.x) / (dist || 1);
        e.ry = (tgt.y - e.y) / (dist || 1);
      }
    }
    let want = { x: 0, y: 0 };
    if (e.wind > 0) {
      e.wind -= dt;
      if (e.wind <= 0) {
        e.rush = e.kind === 'boss' ? 0.55 : 0.3;
        if (e.kind === 'crawler') e.vz = 70; // a little hop
        else this.shake(3, 0.2);
      }
    } else if (e.rush > 0) {
      e.rush -= dt;
      const s = e.kind === 'boss' ? 190 : e.speed * 2.8;
      want = { x: e.rx * s, y: e.ry * s };
      if (e.rush <= 0) e.next = e.kind === 'boss' ? rand(2.5, 4) : rand(1.2, 2.6);
    } else {
      want = this.steer(e, tgt.x, tgt.y, e.speed);
    }
    const k = Math.min(1, (e.rush > 0 ? 12 : 6) * dt);
    e.vx += (want.x - e.vx) * k;
    e.vy += (want.y - e.vy) * k;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    if (e.z > 0 || e.vz) {
      e.vz -= 500 * dt;
      e.z = Math.max(0, e.z + e.vz * dt);
      if (e.z === 0) e.vz = 0;
    }
    const bx = e.x;
    const by = e.y;
    collide(e);
    // Stuck on furniture: go round the other way next time.
    if (Math.hypot(e.x - bx, e.y - by) > 0.5 && Math.random() < 0.05) e.dir = e.dir > 0 ? -1 : 1;
  }

  // Bugs shoulder each other aside instead of stacking up.
  private separate() {
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      for (let j = i + 1; j < es.length; j++) {
        const a = es[i];
        const b = es[j];
        if ((a.kind === 'flyer') !== (b.kind === 'flyer')) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.r + b.r;
        if (d >= min || d < 0.001) continue;
        const push = (min - d) / 2;
        const wa = a.kind === 'boss' ? 0.1 : 1;
        const wb = b.kind === 'boss' ? 0.1 : 1;
        a.x -= (dx / d) * push * wa;
        a.y -= (dy / d) * push * wa;
        b.x += (dx / d) * push * wb;
        b.y += (dy / d) * push * wb;
      }
    }
  }

  private hitEnemy(e: Enemy, dx: number, dy: number, dmg = 1) {
    e.hp -= dmg;
    e.flash = 0.07;
    const heavy = e.kind === 'brute' || e.kind === 'boss';
    e.vx += dx * (heavy ? 20 : 110);
    e.vy += dy * (heavy ? 20 : 110);
    burst(0.05, 3000, 0.2);
    if (e.hp > 0) return;

    this.combo += 1;
    this.comboT = 1.5;
    const mult = this.mult();
    const pts = STATS[e.kind].score * mult;
    this.score += pts;
    this.pops.push({ x: e.x, y: e.y - e.z - 14, text: mult > 1 ? `+${pts}x${mult}` : `+${pts}`, life: 0.8 });
    this.puff(e.x, e.y, e.kind === 'boss' ? 50 : heavy ? 20 : 10, e.kind === 'flyer' ? PAL.r : PAL.k, e.z + 4);
    this.puff(e.x, e.y, e.kind === 'boss' ? 20 : 4, PAL.r, e.z + 4);
    this.shake(e.kind === 'boss' ? 9 : heavy ? 3 : 1.5, e.kind === 'boss' ? 0.6 : 0.12);
    this.hitstop = e.kind === 'boss' ? 0.2 : heavy ? 0.06 : 0.025;
    tone(520, 110, 0.15, 0.08, 'square');
    burst(0.12, 900, 0.25, 'lowpass');

    const p = this.player;
    if (!p) return;
    const l = this.loadout;
    // Chips: a few coins that hop out and roll toward the player.
    const worth = Math.round({ crawler: 1, flyer: 1, brute: 3, boss: 15 }[e.kind] * l.chipMult);
    const coins = Math.min(worth, 5);
    for (let k = 0; k < coins; k++) {
      const a = rand(0, Math.PI * 2);
      const value = k < coins - 1 ? 1 : worth - (coins - 1);
      this.pickups.push({ kind: 'chip', value, x: e.x, y: e.y, z: 4, vx: Math.cos(a) * rand(20, 60), vy: Math.sin(a) * rand(15, 40), vz: rand(60, 120), r: 3, life: 12 });
    }
    l.kills += 1;
    if (l.vampire && l.kills % l.vampire === 0 && p.hp < l.maxHp) {
      p.hp += 1;
      this.pops.push({ x: p.x, y: p.y - 20, text: '+1', life: 0.8 });
    }
    const drop = e.kind === 'boss' || Math.random() < (heavy ? 0.3 : 0.06);
    if (drop) {
      const kind = e.kind === 'boss' || (p.hp < l.maxHp && Math.random() < 0.6) ? 'heart' : 'bolt';
      this.pickups.push({ kind, value: 0, x: e.x, y: e.y, z: 6, vx: 0, vy: 0, vz: 90, r: 4, life: 9 });
    }
  }

  private mult() {
    return Math.min(5, 1 + Math.floor(this.combo / 4));
  }

  // ── Shots, pickups, effects ──
  private updateBullets(dt: number) {
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      const outX = b.x < ARENA.x0 || b.x > ARENA.x1;
      const outY = b.y < FLOOR_TOP || b.y > FRONT;
      if ((outX || outY) && b.bounce > 0) {
        // Bank shot: off the wall and away again.
        b.bounce -= 1;
        if (outX) (b.vx = -b.vx), (b.x = clamp(b.x, ARENA.x0, ARENA.x1));
        if (outY) (b.vy = -b.vy), (b.y = clamp(b.y, FLOOR_TOP, FRONT));
        b.hit.clear();
        this.puff(b.x, b.y, 2, PAL.l, GUN_Z);
        tone(1600, 1200, 0.03, 0.03, 'triangle');
      }
      const wall = b.x < ARENA.x0 || b.x > ARENA.x1 || b.y < FLOOR_TOP || b.y > FRONT;
      const hitProp = PROPS.some((p) => p.stopsShots && b.x > p.x && b.x < p.x + p.w && b.y > p.y && b.y < p.y + p.h + 2);
      if (wall || hitProp) {
        b.life = 0;
        this.puff(b.x, b.y, 3, PAL.m, GUN_Z);
        continue;
      }
      const speed = Math.hypot(b.vx, b.vy) || 1;
      for (const e of this.enemies) {
        if (e.hp <= 0 || b.hit.has(e)) continue;
        if (Math.hypot(b.x - e.x, b.y - e.y) < e.r + 1 + b.size / 2) {
          this.hitEnemy(e, b.vx / speed, b.vy / speed, b.dmg);
          b.hit.add(e);
          if (b.pierce > 0) b.pierce -= 1;
          else {
            b.life = 0;
            break;
          }
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  private updatePickups(dt: number) {
    const p = this.player;
    for (const k of this.pickups) {
      k.life -= dt;
      k.vz -= 400 * dt;
      k.z = Math.max(0, k.z + k.vz * dt);
      if (k.z === 0) k.vz = Math.abs(k.vz) > 30 ? -k.vz * 0.4 : 0;
      // Chips roll to the player once they've landed (anything does, with the magnet).
      const d = p && !p.dead ? Math.hypot(p.x - k.x, p.y - k.y) : Infinity;
      // Chips always come home once they've landed; hearts and bolts only to the magnet.
      const homing = k.kind === 'chip' ? k.life < 11.4 : this.loadout.magnet && d < 120;
      if (p && homing && d > 0.5) {
        const sp = k.kind === 'chip' ? (this.loadout.magnet ? 260 : 170) : 140;
        k.vx += ((p.x - k.x) / d) * sp * dt * 8;
        k.vy += ((p.y - k.y) / d) * sp * dt * 8;
      }
      k.vx *= 1 - Math.min(1, dt * 4);
      k.vy *= 1 - Math.min(1, dt * 4);
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      if (p && !p.dead && d < p.r + k.r) {
        k.life = 0;
        if (k.kind === 'chip') {
          this.chips += k.value;
          tone(1568 + Math.random() * 200, 2093, 0.05, 0.03, 'triangle');
          continue;
        }
        if (k.kind === 'heart') p.hp = Math.min(this.loadout.maxHp, p.hp + 1);
        else p.rapid = 6;
        this.puff(k.x, k.y, 8, k.kind === 'heart' ? PAL.r : PAL.y, 4);
        tone(660, 1320, 0.12, 0.07, 'triangle');
        tone(990, 1980, 0.12, 0.06, 'triangle', 0.06);
      }
    }
    this.pickups = this.pickups.filter((k) => k.life > 0);
  }

  private updateFx(dt: number) {
    this.sparks.update(dt);
    for (const pop of this.pops) {
      pop.life -= dt;
      pop.y -= 14 * dt;
    }
    this.pops = this.pops.filter((pop) => pop.life > 0);
  }

  private puff(x: number, y: number, n: number, color: string, z = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(20, 100);
      const life = rand(0.3, 0.7);
      this.sparks.add(x, y, z, Math.cos(a) * s, Math.sin(a) * s * 0.6, rand(40, 140), life, color);
    }
  }

  private dust(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const life = rand(0.2, 0.35);
      this.sparks.add(x + rand(-2, 2), y + rand(-1, 1), 0, rand(-15, 15), rand(-8, 8), rand(10, 30), life, PAL.w);
    }
  }

  private shake(k: number, t: number) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.shakeK = Math.max(this.shakeT > 0 ? this.shakeK : 0, k);
    this.shakeT = Math.max(this.shakeT, t);
  }

  private pushHud() {
    const p = this.player;
    const hud: Hud = {
      round: this.round,
      score: this.score,
      best: Math.max(this.best, this.score),
      hp: p ? Math.max(0, p.hp) : 0,
      maxHp: this.loadout.maxHp,
      chips: this.chips,
      weapon: WEAPONS[this.loadout.weapon].name,
      weaponId: this.loadout.weapon,
      mult: this.mult(),
      rapid: !!p && p.rapid > 0,
    };
    const key = `${hud.round}|${hud.score}|${hud.best}|${hud.hp}|${hud.maxHp}|${hud.chips}|${hud.weaponId}|${hud.mult}|${hud.rapid}`;
    if (key === this.lastHud) return;
    // At most ten updates a second, except when health changes.
    const now = performance.now();
    if (now - this.hudAt < 100 && hud.hp === this.hudHp && hud.round === this.hudRound) return;
    this.lastHud = key;
    this.hudAt = now;
    this.hudHp = hud.hp;
    this.hudRound = hud.round;
    this.hooks.hud(hud);
  }

  // ── Drawing: the room ──
  // Painted once: the back wall with its windows and lifts, the floor, the
  // side walls and the low front wall. Furniture is drawn live, so bodies can
  // pass behind it.
  private paintRoom(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = VIEW_W;
    c.height = VIEW_H;
    const g = c.getContext('2d')!;
    const px = (x: number, y: number, w: number, h: number, col: string) => {
      g.fillStyle = col;
      g.fillRect(x, y, w, h);
    };

    px(0, 0, VIEW_W, VIEW_H, PAL.k);

    // Back wall.
    px(SIDE, WALL_TOP, VIEW_W - SIDE * 2, FLOOR_TOP - WALL_TOP, WALL);
    px(SIDE, WALL_TOP, VIEW_W - SIDE * 2, 1, '#3A3A36');
    const skyline: number[] = [];
    for (let x = 0; x < VIEW_W; ) {
      const w = 5 + Math.floor(Math.random() * 12);
      const h = 4 + Math.floor(Math.random() * 12);
      for (let k = 0; k < w; k++) skyline.push(h);
      x += w;
    }
    // Windows either side of the lift lobby.
    for (const [x0, x1] of [[SIDE + 6, 96], [224, VIEW_W - SIDE - 6]]) {
      const wy = WALL_TOP + 5;
      const wh = 20;
      px(x0, wy, x1 - x0, wh, GLASS);
      for (let x = x0; x < x1; x++) {
        const h = skyline[x];
        px(x, wy + wh - h, 1, h, SKYLINE);
        if (x % 3 === 0 && (x * 7) % 5 === 0) px(x, wy + wh - h + 2, 1, 1, WALL);
      }
      for (let x = x0 + 4; x < x1 - 6; x += 19) for (let d = 0; d < 6; d++) px(x + d, wy + 2 + d * 2, 1, 2, 'rgba(255,255,255,0.55)');
      for (let x = x0; x <= x1; x += 14) px(Math.min(x, x1), wy, 1, wh, MULLION);
      px(x0, wy, x1 - x0 + 1, 1, MULLION);
      px(x0, wy + wh, x1 - x0 + 1, 1, MULLION);
    }
    // Lift lobby panelling and frames.
    px(96, WALL_TOP + 1, 128, FLOOR_TOP - WALL_TOP - 1, '#ECEAE4');
    for (const d of DOORS) {
      if (d.side !== 'back') continue;
      px(d.x - 10, FLOOR_TOP - 25, 20, 25, PAL.m);
      px(d.x - 9, FLOOR_TOP - 24, 18, 24, PAL.k);
    }
    // Ceiling lights along the wall head.
    for (let x = SIDE + 14; x < VIEW_W - SIDE - 14; x += 34) px(x, WALL_TOP + 1, 12, 1, '#FFF4D6');
    px(SIDE, FLOOR_TOP - 2, VIEW_W - SIDE * 2, 2, '#DAD7CF'); // skirting

    // Floor: big tiles, a rug in the middle.
    for (let y = FLOOR_TOP; y < FRONT; y += 12) {
      for (let x = SIDE; x < VIEW_W - SIDE; x += 20) {
        const odd = ((x - SIDE) / 20 + (y - FLOOR_TOP) / 12) % 2 === 1;
        px(x, y, 20, 12, odd ? FLOOR_B : FLOOR_A);
      }
    }
    for (let y = FLOOR_TOP; y < FRONT; y += 12) px(SIDE, y, VIEW_W - SIDE * 2, 1, GROUT);
    for (let x = SIDE; x < VIEW_W - SIDE; x += 20) px(x, FLOOR_TOP, 1, FRONT - FLOOR_TOP, GROUT);
    px(118, 86, 84, 48, RUG);
    px(118, 86, 84, 1, '#C9D2CB');
    px(118, 133, 84, 1, '#C9D2CB');
    px(121, 89, 78, 1, '#C9D2CB');
    px(121, 130, 78, 1, '#C9D2CB');
    // A soft shade along the foot of the back wall.
    px(SIDE, FLOOR_TOP, VIEW_W - SIDE * 2, 2, 'rgba(17,17,17,0.08)');

    // Side walls, seen from above: their tops, with door openings.
    px(0, WALL_TOP, SIDE, FRONT - WALL_TOP, PAL.k);
    px(VIEW_W - SIDE, WALL_TOP, SIDE, FRONT - WALL_TOP, PAL.k);
    px(SIDE - 1, WALL_TOP, 1, FRONT - WALL_TOP, '#3A3A36');
    px(VIEW_W - SIDE, WALL_TOP, 1, FRONT - WALL_TOP, '#3A3A36');
    for (const d of DOORS) {
      if (d.side === 'back') continue;
      const x = d.side === 'left' ? 0 : VIEW_W - SIDE;
      px(x, d.y - 12, SIDE, 14, '#2A2A27');
      px(x, d.y - 13, SIDE, 1, PAL.m);
      px(x, d.y + 2, SIDE, 1, PAL.m);
    }
    // Front wall.
    px(0, FRONT, VIEW_W, VIEW_H - FRONT, PAL.k);
    px(SIDE, FRONT, VIEW_W - SIDE * 2, 1, '#3A3A36');
    return c;
  }

  private drawProp(p: Prop) {
    const c = this.ctx;
    const px = (x: number, y: number, w: number, h: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(Math.round(x), Math.round(y), w, h);
    };
    const { x, y, w, h, height } = p;
    // Contact shadow on the floor.
    px(x - 1, y + h - 1, w + 2, 3, SHADOW);
    if (p.kind === 'pillar') {
      px(x, y + h - height, w, height, '#D9D6CE'); // face
      px(x, y + h - height, w, 2, '#EEECE6');
      px(x + w - 3, y + h - height, 3, height, '#C9C5BC'); // side
      px(x, y + h - 2, w, 2, '#BDB9AF'); // base
      return;
    }
    if (p.kind === 'rack') {
      px(x, y + h - height, w, height, PAL.k);
      for (let yy = y + h - height + 3; yy < y + h - 2; yy += 3) px(x + 2, yy, w - 4, 1, '#2A2A27');
      for (let i = 0; i < 6; i++) {
        const on = Math.sin(this.time * (3 + i * 1.7) + i) > 0.2;
        px(x + w - 4, y + h - height + 4 + i * 4, 1, 1, on ? (i % 3 === 0 ? PAL.r : '#7FD39A') : '#2A2A27');
      }
      return;
    }
    if (p.kind === 'desk') {
      const top = y + h - height - h; // the desktop, seen from above
      px(x, top, w, h, '#E3E0D8');
      px(x, top, w, 1, '#F3F1EC');
      px(x, y + h - height, w, height, '#B9B5AB'); // front panel
      px(x, y + h - height, w, 1, '#9F9B91');
      px(x + 2, y + h - 2, 2, 2, PAL.m); // feet
      px(x + w - 4, y + h - 2, 2, 2, PAL.m);
      px(x + w / 2 - 6, top - 6, 12, 8, PAL.k); // monitor
      px(x + w / 2 - 5, top - 5, 10, 5, PAL.g);
      px(x + w / 2 - 1, top + 2, 2, 1, PAL.k);
      px(x + 4, top + 4, 7, 2, PAL.m); // keyboard
      px(x + w - 9, top + 3, 4, 3, '#C9C5BC'); // a mug
      return;
    }
    // Plant.
    px(x, y - 4, w, 5, PAL.k); // pot
    px(x + 1, y - 13, 1, 9, PAL.g);
    px(x + 3, y - 14, 1, 10, PAL.g);
    px(x + 4, y - 11, 1, 7, PAL.g);
    px(x, y - 12, 1, 3, PAL.l);
    px(x + 5, y - 10, 1, 3, PAL.l);
    px(x + 2, y - 15, 1, 3, PAL.l);
  }

  private drawDoors() {
    const c = this.ctx;
    for (const d of this.doors) {
      const coming = !!d.queue && Math.floor(this.time * 8) % 2 === 0;
      if (d.side === 'back') {
        const half = Math.round(8 * (1 - d.open));
        c.fillStyle = STEEL;
        c.fillRect(d.x - 8, FLOOR_TOP - 23, half, 23);
        c.fillRect(d.x + 8 - half, FLOOR_TOP - 23, half, 23);
        c.fillStyle = STEEL_HI;
        if (half > 1) {
          c.fillRect(d.x - 8, FLOOR_TOP - 23, 1, 23);
          c.fillRect(d.x + 8 - half, FLOOR_TOP - 23, 1, 23);
        }
        const k = this.doors.filter((x) => x.side === 'back').indexOf(d);
        const kind = (this.phase === 'lifts' || this.phase === 'riding' || this.mode === 'offer') ? this.lifts[k] : undefined;
        if (kind) {
          // Where this lift goes: a sign on a plate over the door.
          const icon = kind === 'weapon' ? this.guns.pistol.icon : this.sprites.signs[kind];
          const pw = Math.max(13, icon.width + 4);
          const ph = icon.height + 4;
          const px = Math.round(d.x - pw / 2);
          const py = WALL_TOP + 2;
          c.fillStyle = PAL.k;
          c.fillRect(px, py, pw, ph);
          c.fillStyle = PAL.c;
          c.fillRect(px + 1, py + 1, pw - 2, ph - 2);
          c.drawImage(icon, Math.round(d.x - icon.width / 2), py + 2);
        } else {
          c.fillStyle = coming ? PAL.r : d.queue ? PAL.k : PAL.g;
          c.fillRect(d.x - 1, FLOOR_TOP - 28, 3, 2);
        }
      } else {
        // Side doors: a leaf that swings open into the wall's thickness.
        const x = d.side === 'left' ? 1 : VIEW_W - SIDE + 1;
        const leaf = Math.round((SIDE - 2) * (1 - d.open));
        c.fillStyle = STEEL;
        c.fillRect(d.side === 'left' ? x : x + (SIDE - 2 - leaf), d.y - 11, leaf, 12);
        c.fillStyle = coming ? PAL.r : d.queue ? '#2A2A27' : PAL.g;
        c.fillRect(x + 3, d.y - 15, 2, 2);
      }
    }
  }

  private shadow(x: number, y: number, r: number, z = 0) {
    const c = this.ctx;
    const k = Math.max(0.45, 1 - z / 40); // higher things cast smaller, fainter shadows
    const w = Math.round(r * 2 * k + 2);
    c.fillStyle = z > 0 ? 'rgba(17,17,17,0.12)' : SHADOW;
    c.fillRect(Math.round(x - w / 2) + 1, Math.round(y) - 1, w - 2, 1);
    c.fillRect(Math.round(x - w / 2), Math.round(y), w, 1);
    c.fillRect(Math.round(x - w / 2) + 1, Math.round(y) + 1, w - 2, 1);
  }

  // An arm: a sleeve from shoulder to hand, outlined, with a hand at the end
  // when it's not holding anything.
  private arm(from: { x: number; y: number }, to: { x: number; y: number }, bareHand: boolean) {
    const c = this.ctx;
    const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y)));
    const pts = Array.from({ length: n + 1 }, (_, i) => ({
      x: Math.round(from.x + ((to.x - from.x) * i) / n),
      y: Math.round(from.y + ((to.y - from.y) * i) / n),
    }));
    c.fillStyle = PEOPLE.k;
    for (const q of pts) c.fillRect(q.x - 1, q.y - 1, 3, 3);
    c.fillStyle = PEOPLE.h;
    for (const q of pts) c.fillRect(q.x, q.y, 1, 1);
    if (bareHand) this.fist(to);
  }

  private fist(at: { x: number; y: number }) {
    const c = this.ctx;
    const x = Math.round(at.x);
    const y = Math.round(at.y);
    c.fillStyle = PEOPLE.k;
    c.fillRect(x - 1, y - 1, 3, 3);
    c.fillStyle = PEOPLE.s;
    c.fillRect(x, y, 1, 1);
  }

  private draw(s: Sprite, x: number, y: number, face: number, flash = false, scale = 1) {
    const img = flash ? s.flash : face < 0 ? s.left : s.right;
    this.ctx.drawImage(img, Math.round(x), Math.round(y), s.w * scale, s.h * scale);
  }

  private drawPickup(k: Pickup) {
    const sp = this.sprites;
    const s = k.kind === 'chip' ? sp.chip : k.kind === 'heart' ? sp.heart : sp.bolt;
    this.draw(s, k.x - s.w / 2, k.y - k.z - s.h - Math.sin(this.time * 6), 1);
  }

  private drawEnemy(e: Enemy) {
    const sp = this.sprites;
    const flash = e.flash > 0 || (e.wind > 0 && Math.floor(e.t * 20) % 2 === 0);
    const frame = Math.floor(e.t * (e.kind === 'flyer' ? 10 : 8)) % 2;
    const s = e.kind === 'crawler' ? sp.crawler[frame] : e.kind === 'flyer' ? sp.flyer[frame] : sp.brute[frame];
    const scale = e.kind === 'boss' ? 2 : 1;
    this.draw(s, e.x - (s.w * scale) / 2, e.y - e.z - s.h * scale + 1, e.dir, flash, scale);
  }

  private drawPlayer(p: Player) {
    const c = this.ctx;
    // Body: one of eight views, from where it's looking.
    const oct = (Math.round(Math.atan2(p.ly, p.lx) / (Math.PI / 4)) + 8) % 8;
    const [view, mirror] = PERSON_VIEW[oct];
    const f = this.person[view];
    const moving = Math.hypot(p.vx, p.vy) > 10;
    const step = Math.floor(p.anim / 6) % 2;
    const s = moving ? (step ? f.a : f.b) : p.blink < 0 ? f.blink : f.idle;
    // A bob: on every step, or a slow breath when standing.
    const bob = moving ? (step ? -1 : 0) : Math.floor(this.time * 1.6) % 2 ? -1 : 0;
    const bx = Math.round(p.x - s.w / 2);
    const by = Math.round(p.y - s.h + 1 + bob);

    // Arms and gun. The gun hand reaches from the shoulder on the aiming
    // side; the other hand takes the fore-grip of a long gun, or hangs.
    const aim = this.aimDir(p);
    const gun = this.guns[this.loadout.weapon];
    const sy = p.y - PERSON_SHOULDER + bob;
    const side = Math.abs(aim.x) > 0.2 ? Math.sign(aim.x) : oct === 6 ? 1 : -1;
    const gunShoulder = { x: p.x + side * 4, y: sy };
    const offShoulder = { x: p.x - side * 4, y: sy };
    const reach = REACH - (p.kick / 0.08) * 1.5;
    const hand = { x: gunShoulder.x + aim.x * reach, y: gunShoulder.y + aim.y * reach };
    const k = (Math.round((Math.atan2(aim.y, aim.x) / (Math.PI * 2)) * GUN_ANGLES) + GUN_ANGLES) % GUN_ANGLES;
    const swing = moving ? (step ? 1 : -1) : 0;
    const offHand = gun.fore
      ? { x: hand.x + aim.x * gun.fore, y: hand.y + aim.y * gun.fore }
      : { x: offShoulder.x - side * 0.5, y: offShoulder.y + 6 + swing };
    const arms = () => {
      this.arm(gunShoulder, hand, false);
      this.arm(offShoulder, offHand, !gun.fore);
      c.drawImage(gun.frames[k], Math.round(hand.x - gun.half), Math.round(hand.y - gun.half));
      if (gun.fore) this.fist(offHand);
      // Muzzle flash on the frame of a shot.
      if (p.kick > 0.05) {
        const mx = Math.round(hand.x + aim.x * (gun.muzzle + 1.5));
        const my = Math.round(hand.y + aim.y * (gun.muzzle + 1.5));
        c.fillStyle = PAL.y;
        c.fillRect(mx - 1, my, 3, 1);
        c.fillRect(mx, my - 1, 1, 3);
        c.fillStyle = '#FFFFFF';
        c.fillRect(mx, my, 1, 1);
      }
    };

    const behind = aim.y < -0.35; // aiming up the room: the body is in front
    if (behind) arms();
    this.draw(s, bx, by, mirror ? -1 : 1);
    if (!behind) arms();

    // Rapid fire: a spark over the head.
    if (p.rapid > 0 && Math.floor(this.time * 8) % 2) {
      c.fillStyle = PAL.y;
      c.fillRect(Math.round(p.x) - 1, by - 3, 3, 1);
      c.fillRect(Math.round(p.x), by - 4, 1, 3);
    }
  }

  private render() {
    const c = this.ctx;
    const sp = this.sprites;
    // Shake shifts the whole room, so paint the uncovered edge first.
    c.fillStyle = PAL.k;
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    c.save();
    if (this.shakeT > 0) {
      const k = this.shakeK * (this.shakeT > 0.1 ? 1 : this.shakeT / 0.1);
      c.translate(Math.round(rand(-k, k)), Math.round(rand(-k, k)));
    }
    c.drawImage(this.bg, 0, 0);
    this.drawDoors();

    // Shadows first, all on the floor.
    for (const e of this.enemies) this.shadow(e.x, e.y, e.r, e.z);
    for (const k of this.pickups) this.shadow(k.x, k.y, 3, k.z);
    // Hidden while it rides a lift.
    const inLift = this.phase === 'riding' && this.phaseT < 0.45;
    const p = this.player && !this.player.dead && this.mode !== 'offer' && !inLift ? this.player : null;
    if (p) this.shadow(p.x, p.y, 4);
    for (const b of this.bullets) {
      c.fillStyle = 'rgba(17,17,17,0.18)';
      c.fillRect(Math.round(b.x), Math.round(b.y), 1, 1);
    }

    // Then everything with height, back to front. One reused list of plain
    // entries rather than a fresh array of closures every frame: less garbage
    // for the collector in long, busy rounds.
    const list = this.drawList;
    let n = 0;
    const put = (y: number, kind: number, ref: unknown) => {
      const it = list[n] ?? (list[n] = { y: 0, kind: 0, ref: null });
      it.y = y;
      it.kind = kind;
      it.ref = ref;
      n++;
    };
    for (const pr of PROPS) put(pr.y + pr.h, 0, pr);
    for (const k of this.pickups) if (!(k.life < 2 && Math.floor(k.life * 10) % 2)) put(k.y, 1, k);
    for (const e of this.enemies) put(e.y, 2, e);
    if (p && !(p.inv > 0 && p.dash <= 0 && Math.floor(p.inv * 14) % 2)) put(p.y, 3, p);
    list.length = Math.max(list.length, n);
    // Insertion sort: the order barely changes between frames, so it's near-linear.
    for (let i = 1; i < n; i++) {
      const it = list[i];
      let j = i - 1;
      while (j >= 0 && list[j].y > it.y) {
        list[j + 1] = list[j];
        j--;
      }
      list[j + 1] = it;
    }
    for (let i = 0; i < n; i++) {
      const it = list[i];
      if (it.kind === 0) this.drawProp(it.ref as Prop);
      else if (it.kind === 1) this.drawPickup(it.ref as Pickup);
      else if (it.kind === 2) this.drawEnemy(it.ref as Enemy);
      else this.drawPlayer(it.ref as Player);
    }

    // Shots and sparks on top.
    for (const b of this.bullets) {
      const sy = b.y - GUN_Z;
      const sp2 = Math.hypot(b.vx, b.vy) || 1;
      const h = Math.floor(b.size / 2);
      c.fillStyle = b.color;
      c.fillRect(Math.round(b.x - h), Math.round(sy - h), b.size, b.size);
      c.fillStyle = PAL.y;
      const tail = b.size >= 3 ? 5 : 2; // the laser leaves a longer streak
      for (let t = 1; t <= tail; t += b.size >= 3 ? 1 : tail) {
        c.fillRect(Math.round(b.x - (b.vx / sp2) * (t + h)), Math.round(sy - (b.vy / sp2) * (t + h)), 1, 1);
      }
    }
    this.sparks.draw(c, this.frameNo++);
    for (const pop of this.pops) drawText(c, pop.text, pop.x, pop.y, pop.life > 0.2 || Math.floor(pop.life * 20) % 2 ? PAL.k : PAL.r);
    c.restore();
  }
}
