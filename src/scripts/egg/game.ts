// Bug Hunt — a 2.5D survival arena. One office floor seen from a three-quarter
// view; bugs come in through the lifts in the back wall and the side doors,
// round after round, each round bigger and every fifth with a boss. Round
// 25's boss, the Root Bug, smashes the floor at half health and the fight
// drops to B1, the server room below, where the run carries on. Move with
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

type PropKind = 'desk' | 'pillar' | 'plant' | 'rack' | 'server' | 'column' | 'crate';
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
const OFFICE_PROPS: Prop[] = [
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
// B1, the server room the Root Bug smashes through to. The columns stand
// under the office pillars; the middle is left open for the fight.
const SERVER_PROPS: Prop[] = [
  prop('column', 84, 92, 12, 7, 46, true),
  prop('column', 224, 92, 12, 7, 46, true),
  prop('server', 30, 66, 30, 8, 30, true),
  prop('server', 260, 66, 30, 8, 30, true),
  prop('server', 30, 140, 30, 8, 30, true),
  prop('server', 260, 140, 30, 8, 30, true),
  prop('crate', 126, 150, 12, 8, 10),
  prop('crate', 184, 58, 12, 8, 10),
  prop('crate', 20, 106, 10, 7, 9),
];
const FLOOR_PROPS = [OFFICE_PROPS, SERVER_PROPS];
// The floor in play. Module-level so the collision helpers can reach it;
// only one game runs at a time.
let PROPS = OFFICE_PROPS;

// Where bugs come in: three lifts in the back wall, a door in each side wall.
type DoorSide = 'back' | 'left' | 'right';
const DOORS: { x: number; y: number; side: DoorSide }[] = [
  { x: 112, y: FLOOR_TOP, side: 'back' },
  { x: 160, y: FLOOR_TOP, side: 'back' },
  { x: 208, y: FLOOR_TOP, side: 'back' },
  { x: SIDE, y: 118, side: 'left' },
  { x: VIEW_W - SIDE, y: 118, side: 'right' },
];

const KING_ROUND = 25;

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
// B1: concrete and steel, darker than the office upstairs.
const B1_WALL = '#7A7D77';
const B1_WALL_D = '#6E716B';
const B1_FLOOR = '#585C57';
const B1_FLOOR_B = '#545853';
const B1_JOINT = '#474B46';

type Kind = 'crawler' | 'flyer' | 'brute' | 'boss' | 'king';

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
  max: number; // starting hp, for the boss bar
  move: Move; // the king's attack being wound up
  rage: boolean; // the king, after the fall
}

type Move = 'none' | 'charge' | 'slam' | 'spit' | 'summon';

/** The king's acid: slow shots that hurt the player. */
interface Spit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

/** A shockwave from a slam: a ring along the floor. Dash through it. */
interface Wave {
  x: number;
  y: number;
  r: number;
  speed: number;
  max: number;
  hit: boolean;
}

/** One office floor tile during the collapse. */
interface Tile {
  x: number;
  y: number;
  at: number; // quake time it gives way
  h: number; // how far it has fallen
  v: number;
}

/** A bit of rubble falling with the camera, painted onto B1 where it lands. */
interface Rubble {
  x: number;
  y: number;
  h: number;
  v: number;
  w: number;
  color: string;
}

/** Something on the office floor riding a tile down. */
interface Faller {
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
const SLAM = 0.9;
const BREAK = 2.1;
const DEPTH = 232;
const FALL_G = 420;
const TILE_W = 20;
const TILE_H = 12;

interface Quake {
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
  /** `dark`: the floor behind it is dark (B1), so the text should be light. */
  banner(title: string, sub?: string, dark?: boolean): void;
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
  king: { r: 16, score: 1500 },
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
function collide(b: Body, solid = true, props = PROPS) {
  b.x = clamp(b.x, ARENA.x0 + b.r, ARENA.x1 - b.r);
  b.y = clamp(b.y, ARENA.y0 + b.r * 0.5, ARENA.y1);
  if (!solid) return;
  for (const p of props) {
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
  private floor = 0; // 0 the office, 1 B1
  private rooms: HTMLCanvasElement[];
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
  private lower = new Sparks(); // dust on B1 while the camera is still between floors
  private spit: Spit[] = [];
  private waves: Wave[] = [];
  private quake: Quake | null = null;
  private barLag = 1; // the boss bar's trailing chunk, as a fraction
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
    this.rooms = [this.paintRoom(0), this.paintRoom(1)];
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
    this.toFloor(0);
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
    this.toFloor(0);
  }

  // Back to a floor with nothing in flight. B1 is repainted on the way to
  // the office, so a new run doesn't find the last one's rubble there.
  private toFloor(n: number) {
    if (n === 0 && this.floor !== 0) this.rooms[1] = this.paintRoom(1);
    this.floor = n;
    PROPS = FLOOR_PROPS[n];
    this.quake = null;
    this.spit = [];
    this.waves = [];
    this.lower.clear();
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

    if (this.quake) {
      // The fall is a cutscene: nothing else moves.
      this.updateQuake(this.quake, dt);
      this.updateFx(dt);
      this.updateBar(dt);
      this.pushHud();
      return;
    }

    if (this.mode === 'play') this.updateRound(dt);
    else this.updateAttract(dt);

    this.updateDoors(dt);
    if (this.player) this.updatePlayer(this.player, dt);
    for (const e of this.enemies) this.updateEnemy(e, dt);
    this.separate();
    this.updateBullets(dt);
    this.updateHazards(dt);
    this.updatePickups(dt);
    this.updateFx(dt);
    this.dashPressed = false;

    if (this.comboT > 0 && (this.comboT -= dt) <= 0) this.combo = 0;
    this.enemies = this.enemies.filter((e) => e.hp > 0 && e.life > 0);
    this.updateBar(dt);
    this.pushHud();
  }

  private banner(title: string, sub?: string) {
    this.hooks.banner(title, sub, this.floor === 1);
  }

  private king(): Enemy | undefined {
    return this.quake?.king ?? this.enemies.find((e) => e.kind === 'king');
  }

  // The boss bar's white chunk drains after the damage, so hits read.
  private updateBar(dt: number) {
    const k = this.king();
    const f = k ? clamp(k.hp / k.max, 0, 1) : 0;
    this.barLag = this.barLag > f ? Math.max(f, this.barLag - dt * 0.35) : f;
  }

  // ── Rounds ──
  private startRound(r: number) {
    this.round = r;
    this.phase = 'intro';
    this.phaseT = 1.8;
    this.toSpawn = this.roster(r);
    this.spawnT = 0;
    const boss = r % 5 === 0;
    const sub = r === KING_ROUND ? 'The floor is shaking' : boss ? 'Something big is riding the lift' : `${this.toSpawn.length} bugs inbound`;
    this.banner(`Round ${r}`, sub);
    [523, 659, 784].forEach((f, i) => tone(f, f, 0.12, 0.08, 'square', i * 0.11));
  }

  private roster(r: number): Kind[] {
    // The king brings its own swarm; a few stragglers come through the doors.
    if (r === KING_ROUND) return ['king', ...Array.from({ length: 10 }, (): Kind => (Math.random() < 0.3 ? 'flyer' : 'crawler'))];
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
          this.banner('Boss down', `Take a lift: ${this.lifts.map((k) => LIFT_LABEL[k]).join(' · ')}`);
        } else {
          this.phase = 'clear';
          this.phaseT = 2.4;
          this.banner(`Round ${this.round} cleared`, healed ? '+1 heart' : 'Full health');
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
    const big = kind === 'boss' || kind === 'king';
    let free = this.doors.filter((d) => !d.queue && (!big || d.side === 'back'));
    if (p && free.length > 1) {
      const far = free.filter((d) => Math.hypot(d.x - p.x, d.y - p.y) > 70);
      if (far.length) free = far;
    }
    if (!free.length) return false;
    const d = free[Math.floor(Math.random() * free.length)];
    d.queue = kind;
    d.charge = big ? 1.8 : 0.9;
    if (this.mode === 'play') tone(big ? 330 : 880, big ? 330 : 880, 0.08, 0.04, 'sine');
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
    const rad = STATS[kind].r;
    // Step out of the doorway into the room.
    const x = d.side === 'left' ? SIDE + rad + 2 : d.side === 'right' ? VIEW_W - SIDE - rad - 2 : d.x;
    const y = d.side === 'back' ? FLOOR_TOP + rad + 2 : d.y;
    this.spawnAt(kind, x, y);
    if (kind === 'king') {
      this.shake(9, 0.8);
      burst(0.6, 160, 0.6, 'lowpass');
      tone(140, 50, 0.7, 0.12, 'sawtooth');
      this.banner('The Root Bug', 'Dash through its shockwaves');
    }
  }

  private spawnAt(kind: Kind, x: number, y: number) {
    const r = Math.max(1, this.round);
    const hp = { crawler: r >= 6 ? 3 : 2, flyer: r >= 8 ? 2 : 1, brute: 8 + r, boss: 30 + r * 5, king: 60 + r * 14 }[kind];
    const speed = {
      crawler: Math.min(66, 32 + r * 2.5),
      flyer: Math.min(64, 36 + r * 2),
      brute: Math.min(30, 18 + r),
      boss: 16,
      king: 18,
    }[kind];
    const big = kind === 'boss' || kind === 'king';
    this.enemies.push({
      kind, x, y, z: kind === 'flyer' ? 12 : 0, vx: 0, vy: 0, vz: 0, r: STATS[kind].r, hp, max: hp, speed,
      dir: 1, flash: 0, t: Math.random() * 10, wind: 0, rush: 0, rx: 0, ry: 0, next: rand(1.5, 3),
      life: this.mode === 'play' ? Infinity : rand(9, 14), move: 'none', rage: false,
    });
    this.puff(x, y, big ? 26 : 6, PAL.r);
    if (big) this.shake(6, 0.5);
    if (kind === 'king') this.barLag = 1;
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
    if (e.kind === 'king') return this.updateKing(e, dt);
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

  // The Root Bug walks you down, then winds up one of four moves: a charge,
  // a slam that sends a shockwave along the floor, a fan of acid (only once
  // it's enraged) or a brood of bugs. Enraged, it's quicker at all of them.
  private updateKing(e: Enemy, dt: number) {
    const tgt = this.target();
    const dx = tgt.x - e.x;
    const dy = tgt.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    let want = { x: 0, y: 0 };
    if (e.wind > 0) {
      e.wind -= dt;
      // A slam rears up first; everything else just trembles.
      e.z = e.move === 'slam' ? 14 * Math.min(1, (0.8 - e.wind) / 0.5) : 0;
      if (e.wind <= 0) this.kingMove(e);
    } else if (e.rush > 0) {
      e.rush -= dt;
      const s = e.rage ? 230 : 200;
      want = { x: e.rx * s, y: e.ry * s };
      if (Math.random() < 0.5) this.dust(e.x + rand(-8, 8), e.y, 1);
      if (e.rush <= 0) e.next = e.rage ? rand(0.9, 1.6) : rand(1.4, 2.3);
    } else {
      want = this.steer(e, tgt.x, tgt.y, e.rage ? e.speed * 1.4 : e.speed);
      e.next -= dt;
      if (e.next <= 0 && this.player && !this.player.dead) {
        const roll = Math.random();
        const crowd = this.enemies.length > 9;
        const moves: [Move, number][] = e.rage
          ? [['charge', 0.25], ['slam', 0.3], ['spit', 0.3], ['summon', crowd ? 0 : 0.15]]
          : [['charge', 0.4], ['slam', 0.35], ['summon', crowd ? 0 : 0.25]];
        const total = moves.reduce((a, m) => a + m[1], 0);
        let acc = 0;
        e.move = moves.find((m) => (acc += m[1] / total) >= roll)?.[0] ?? 'charge';
        e.wind = { none: 0, charge: 0.6, slam: 0.8, spit: 0.5, summon: 0.6 }[e.move];
        if (e.rage) e.wind *= 0.8;
        e.rx = dx / dist;
        e.ry = dy / dist;
        if (e.move === 'slam') tone(90, 180, 0.5, 0.06, 'sawtooth');
        else tone(260, 200, 0.2, 0.05, 'square');
      }
    }
    const k = Math.min(1, (e.rush > 0 ? 12 : 6) * dt);
    e.vx += (want.x - e.vx) * k;
    e.vy += (want.y - e.vy) * k;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    if (Math.abs(e.vx) > 4) e.dir = e.vx < 0 ? -1 : 1;
    collide(e);
  }

  private kingMove(e: Enemy) {
    const move = e.move;
    e.move = 'none';
    e.z = 0;
    e.next = e.rage ? rand(1.1, 1.9) : rand(1.6, 2.6);
    if (move === 'charge') {
      e.rush = 0.6;
      this.shake(3, 0.2);
      tone(180, 60, 0.3, 0.08, 'sawtooth');
    } else if (move === 'slam') {
      this.waves.push({ x: e.x, y: e.y, r: e.r, speed: 120, max: 190, hit: false });
      if (e.rage) this.waves.push({ x: e.x, y: e.y, r: e.r * 0.4, speed: 78, max: 150, hit: false });
      this.shake(6, 0.35);
      this.puff(e.x, e.y, 18, PAL.m, 2);
      burst(0.4, 180, 0.55, 'lowpass');
      tone(110, 40, 0.35, 0.12, 'sawtooth');
    } else if (move === 'spit') {
      const p = this.player;
      const base = p ? Math.atan2(p.y - e.y, p.x - e.x) : Math.atan2(e.ry, e.rx);
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = base - 0.6 + (1.2 * i) / (n - 1);
        this.spit.push({ x: e.x + Math.cos(a) * 10, y: e.y + Math.sin(a) * 6, vx: Math.cos(a) * 92, vy: Math.sin(a) * 92, life: 3 });
      }
      burst(0.2, 1400, 0.3, 'bandpass');
      tone(500, 200, 0.18, 0.06, 'square');
    } else if (move === 'summon') {
      const kinds: Kind[] = e.rage ? ['flyer', 'flyer', 'crawler', 'crawler'] : ['crawler', 'crawler', 'crawler'];
      kinds.forEach((kind, i) => {
        const a = (i / kinds.length) * Math.PI * 2 + rand(0, 1);
        const x = clamp(e.x + Math.cos(a) * 22, ARENA.x0 + 6, ARENA.x1 - 6);
        const y = clamp(e.y + Math.sin(a) * 14, ARENA.y0 + 6, ARENA.y1 - 2);
        if (!blocked(x, y, 4)) this.spawnAt(kind, x, y);
      });
      tone(300, 900, 0.25, 0.05, 'triangle');
    }
  }

  // Acid and shockwaves: the only things in the game that hurt from afar.
  private updateHazards(dt: number) {
    const p = this.player;
    const open = p && !p.dead && p.inv <= 0;
    for (const s of this.spit) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      const wall = s.x < ARENA.x0 || s.x > ARENA.x1 || s.y < ARENA.y0 || s.y > ARENA.y1;
      const prop = PROPS.some((q) => q.stopsShots && s.x > q.x && s.x < q.x + q.w && s.y > q.y && s.y < q.y + q.h + 2);
      if (wall || prop) {
        s.life = 0;
        this.puff(s.x, s.y, 4, PAL.l, 4);
      } else if (open && Math.hypot(p.x - s.x, p.y - s.y) < p.r + 2) {
        s.life = 0;
        const d = Math.hypot(s.vx, s.vy) || 1;
        this.hurt(p, s.vx / d, s.vy / d);
      }
    }
    this.spit = this.spit.filter((s) => s.life > 0);
    for (const w of this.waves) {
      w.r += w.speed * dt;
      // Seen in perspective, the ring is squashed: measure in floor space.
      if (open && !w.hit && p.z === 0) {
        const d = Math.hypot(p.x - w.x, (p.y - w.y) / 0.6);
        if (Math.abs(d - w.r) < 3) {
          w.hit = true;
          const n = Math.hypot(p.x - w.x, p.y - w.y) || 1;
          this.hurt(p, (p.x - w.x) / n, (p.y - w.y) / n);
        }
      }
    }
    this.waves = this.waves.filter((w) => w.r < w.max);
  }

  // ── The fall to B1 ──
  private startQuake(king: Enemy) {
    const tiles: Tile[] = [];
    for (let y = FLOOR_TOP; y < FRONT; y += TILE_H) {
      for (let x = SIDE; x < VIEW_W - SIDE; x += TILE_W) {
        // Outward from the impact, a little ragged.
        const d = Math.hypot(x + TILE_W / 2 - king.x, (y + TILE_H / 2 - king.y) / 0.6);
        tiles.push({ x, y, at: BREAK + d / 240 + rand(0, 0.16), h: 0, v: 0 });
      }
    }
    const cracks = this.paintCracks(king.x, king.y);
    const cracked = document.createElement('canvas');
    cracked.width = VIEW_W;
    cracked.height = VIEW_H;
    const g = cracked.getContext('2d')!;
    g.drawImage(this.rooms[0], 0, 0);
    g.drawImage(cracks, 0, 0);

    const p = this.player!;
    p.vx = p.vy = p.dash = p.kick = 0;
    king.wind = king.rush = king.vx = king.vy = 0;
    king.move = 'none';
    this.bullets = [];
    this.spit = [];
    this.waves = [];
    // Coins on the floor would go down with it: bank them.
    for (const k of this.pickups) if (k.kind === 'chip') this.chips += k.value;
    this.pickups = [];
    // Where each lands on B1, clear of the furniture down there.
    const faller = (b: Body): Faller => {
      const at = { ...b };
      collide(at, true, SERVER_PROPS);
      return { h: 0, v: 0, falling: false, landed: false, tx: at.x, ty: at.y };
    };
    this.quake = {
      t: 0, king, x: king.x, y: king.y, cracks, cracked, tiles, rubble: [],
      player: faller(p), boss: faller(king), cam: 0, landT: Infinity, nextFx: SLAM,
    };
    this.hitstop = 0.15;
    tone(260, 70, 0.9, 0.12, 'sawtooth');
    burst(0.9, 220, 0.4, 'lowpass');
  }

  /** The tile under a point of the office floor. */
  private tileAt(q: Quake, x: number, y: number): Tile {
    const cols = (VIEW_W - SIDE * 2) / TILE_W;
    const rows = Math.ceil((FRONT - FLOOR_TOP) / TILE_H);
    const col = clamp(Math.floor((x - SIDE) / TILE_W), 0, cols - 1);
    const row = clamp(Math.floor((y - FLOOR_TOP) / TILE_H), 0, rows - 1);
    return q.tiles[row * cols + col];
  }

  /** How far the cracks have run from the impact, in floor pixels. */
  private crackReach(q: Quake) {
    const k = clamp((q.t - SLAM) / (BREAK - SLAM - 0.15), 0, 1);
    return 330 * (1 - (1 - k) ** 3);
  }

  private updateQuake(q: Quake, dt: number) {
    const before = q.t;
    q.t += dt;
    const t = q.t;
    const k = q.king;
    const p = this.player!;
    for (const e of this.enemies) e.t += dt; // still twitching
    k.flash -= dt;

    if (t < SLAM) {
      // It rears right up…
      k.z = 18 * Math.sin(((t / SLAM) * Math.PI) / 2);
      this.shake(1 + t * 2.5, 0.1);
    } else if (before < SLAM) {
      // …and brings everything down on the floor.
      k.z = 0;
      this.shake(11, 0.8);
      this.hitstop = 0.12;
      this.puff(k.x, k.y, 30, PAL.m, 2);
      this.puff(k.x, k.y, 16, PAL.w, 2);
      burst(0.9, 120, 0.8, 'lowpass');
      tone(80, 30, 0.8, 0.16, 'sawtooth');
    }

    if (t >= SLAM && t < BREAK && t >= q.nextFx) {
      // Cracks racing out: a crackle and a kick of grit where they've reached.
      q.nextFx = t + 0.08;
      burst(0.06, rand(1800, 3200), 0.25);
      const r = this.crackReach(q);
      const a = rand(0, Math.PI * 2);
      const x = q.x + Math.cos(a) * r;
      const y = q.y + Math.sin(a) * r * 0.6;
      if (x > ARENA.x0 && x < ARENA.x1 && y > ARENA.y0 && y < ARENA.y1) this.dust(x, y, 3);
      this.shake(2, 0.1);
    }
    if (t < BREAK) return;

    // The floor goes, tile by tile, out from the impact.
    for (const tile of q.tiles) {
      if (t < tile.at || tile.h > 400) continue;
      if (tile.v === 0) {
        if (t >= q.nextFx) {
          q.nextFx = t + 0.06;
          burst(0.12, rand(500, 900), 0.3, 'lowpass');
          this.shake(3, 0.12);
        }
        if (Math.random() < 0.22) {
          q.rubble.push({
            x: tile.x + rand(1, TILE_W - 3), y: tile.y + rand(1, TILE_H - 2), h: 0, v: rand(-20, 30),
            w: Math.random() < 0.35 ? 3 : 2, color: ['#C9C5BC', '#B5B1A7', '#A39F95'][Math.floor(Math.random() * 3)],
          });
        }
      }
      tile.v += FALL_G * dt;
      tile.h += tile.v * dt;
    }

    // Rubble falls a little slower than the bodies, so the camera overtakes it.
    const floor = this.rooms[1].getContext('2d')!;
    for (const r of q.rubble) {
      r.v += FALL_G * 0.62 * dt;
      r.h += r.v * dt;
      if (r.h >= DEPTH) {
        // Landed: it stays on B1's floor for the rest of the run.
        floor.fillStyle = 'rgba(17,17,17,0.3)';
        floor.fillRect(Math.round(r.x), Math.round(r.y) + 1, r.w, 1);
        floor.fillStyle = r.w > 2 ? '#9E9A90' : '#8C8F88';
        floor.fillRect(Math.round(r.x), Math.round(r.y), r.w, 1);
      }
    }
    q.rubble = q.rubble.filter((r) => r.h < DEPTH);

    this.fall(q, q.boss, k, 'king', dt);
    this.fall(q, q.player, p, 'player', dt);

    // The camera follows the player down.
    const f = q.player;
    const target = f.landed ? DEPTH : f.falling ? clamp(f.h - 30, 0, DEPTH) : 0;
    q.cam += (target - q.cam) * Math.min(1, dt * (f.landed ? 4 : 7));
    if (Math.abs(target - q.cam) < 0.5) q.cam = target;

    if (f.landed && q.boss.landed && q.cam === DEPTH && t > q.landT + 0.8) this.finishQuake(q);
  }

  private fall(q: Quake, f: Faller, b: Body, who: 'king' | 'player', dt: number) {
    if (f.landed) return;
    if (!f.falling) {
      if (q.t < this.tileAt(q, b.x, b.y).at) return;
      f.falling = true;
      if (who === 'player') tone(520, 90, 1.3, 0.07, 'sine');
    }
    f.v += FALL_G * dt;
    f.h = Math.min(DEPTH, f.h + f.v * dt);
    // Drift to a clear spot to land on.
    b.x += (f.tx - b.x) * Math.min(1, dt * 3);
    b.y += (f.ty - b.y) * Math.min(1, dt * 3);
    if (f.h < DEPTH) return;
    f.landed = true;
    b.x = f.tx;
    b.y = f.ty;
    const big = who === 'king';
    // Visible only once the camera's down there.
    if (q.cam > DEPTH - VIEW_H) this.shake(big ? 10 : 6, big ? 0.5 : 0.3);
    for (let i = 0; i < (big ? 30 : 14); i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(30, big ? 110 : 70);
      this.lower.add(b.x, b.y, 2, Math.cos(a) * s, Math.sin(a) * s * 0.6, rand(30, 90), rand(0.3, 0.7), i % 3 ? '#8A8D86' : PAL.w);
    }
    burst(big ? 0.6 : 0.3, big ? 140 : 260, big ? 0.7 : 0.5, 'lowpass');
    tone(big ? 70 : 140, 40, 0.3, 0.12, 'sawtooth');
    if (who === 'player') q.landT = q.t;
  }

  private finishQuake(q: Quake) {
    const k = q.king;
    const p = this.player!;
    // Everything else went further down than B1.
    this.enemies = [k];
    k.z = 0;
    k.rage = true;
    k.next = 1.2;
    k.wind = k.rush = 0;
    k.flash = 0.2;
    p.inv = 1.5;
    p.cool = 0.3;
    this.dashPressed = false;
    this.resetDoors();
    this.sparks.clear();
    this.floor = 1;
    PROPS = SERVER_PROPS;
    this.quake = null;
    this.shake(6, 0.6);
    this.banner('B1 · Server room', 'The Root Bug is enraged');
    tone(220, 60, 0.8, 0.12, 'sawtooth');
    burst(0.5, 300, 0.4, 'lowpass');
  }

  // The crack web from the slam: straight rays that wander and fork, rings
  // round the impact, a crater in the middle. Same look as the glass.
  private paintCracks(ix: number, iy: number): HTMLCanvasElement {
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
        const d = Math.hypot(x / 9, y / 5) + rand(-0.12, 0.12);
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
        const wa = a.kind === 'boss' || a.kind === 'king' ? 0.1 : 1;
        const wb = b.kind === 'boss' || b.kind === 'king' ? 0.1 : 1;
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
    const boss = e.kind === 'boss' || e.kind === 'king';
    const heavy = e.kind === 'brute' || boss;
    e.vx += dx * (e.kind === 'king' ? 6 : heavy ? 20 : 110);
    e.vy += dy * (e.kind === 'king' ? 6 : heavy ? 20 : 110);
    burst(0.05, 3000, 0.2);
    if (this.quake) return;
    // Half its health gone in the office: it takes the floor out.
    if (e.kind === 'king' && !e.rage && this.floor === 0 && e.hp <= e.max / 2) {
      e.hp = Math.ceil(e.max / 2);
      this.startQuake(e);
      return;
    }
    if (e.hp > 0) return;

    this.combo += 1;
    this.comboT = 1.5;
    const mult = this.mult();
    const pts = STATS[e.kind].score * mult;
    this.score += pts;
    this.pops.push({ x: e.x, y: e.y - e.z - 14, text: mult > 1 ? `+${pts}x${mult}` : `+${pts}`, life: 0.8 });
    this.puff(e.x, e.y, boss ? 50 : heavy ? 20 : 10, e.kind === 'flyer' ? PAL.r : PAL.k, e.z + 4);
    this.puff(e.x, e.y, boss ? 20 : 4, PAL.r, e.z + 4);
    this.shake(boss ? 9 : heavy ? 3 : 1.5, boss ? 0.6 : 0.12);
    this.hitstop = e.kind === 'king' ? 0.35 : boss ? 0.2 : heavy ? 0.06 : 0.025;
    if (e.kind === 'king') {
      this.puff(e.x, e.y, 40, PAL.y, 10);
      this.waves = [];
      this.spit = [];
      [196, 147, 110, 82].forEach((f, i) => tone(f, f * 0.7, 0.3, 0.1, 'sawtooth', i * 0.14));
    }
    tone(520, 110, 0.15, 0.08, 'square');
    burst(0.12, 900, 0.25, 'lowpass');

    const p = this.player;
    if (!p) return;
    const l = this.loadout;
    // Chips: a few coins that hop out and roll toward the player.
    const worth = Math.round({ crawler: 1, flyer: 1, brute: 3, boss: 15, king: 40 }[e.kind] * l.chipMult);
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
    const drop = boss || Math.random() < (heavy ? 0.3 : 0.06);
    if (drop) {
      const kind = boss || (p.hp < l.maxHp && Math.random() < 0.6) ? 'heart' : 'bolt';
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
    this.lower.update(dt);
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
  private paintRoom(floor: number): HTMLCanvasElement {
    return floor === 0 ? this.paintOffice() : this.paintServerRoom();
  }

  private paintOffice(): HTMLCanvasElement {
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

  // B1: bare concrete block, pipes along the top, freight lifts in hazard
  // frames, a stencilled B1, and a dark concrete floor with raised-floor
  // tiles in front of the server racks. Lit by a few pools from above.
  private paintServerRoom(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = VIEW_W;
    c.height = VIEW_H;
    const g = c.getContext('2d')!;
    const px = (x: number, y: number, w: number, h: number, col: string) => {
      g.fillStyle = col;
      g.fillRect(x, y, w, h);
    };
    const hazard = (x: number, y: number, w: number, h: number) => {
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) px(x + xx, y + yy, 1, 1, ((xx + yy) >> 2) % 2 ? PAL.k : PAL.y);
    };
    // Pools of light: rows of a soft ellipse, a few steps of brightness.
    const pool = (cx: number, cy: number, rx: number, ry: number, col: string) => {
      for (let y = -ry; y <= ry; y++) {
        const half = Math.round(rx * Math.sqrt(1 - (y / ry) ** 2));
        px(cx - half, cy + y, half * 2, 1, col);
      }
    };
    const inner = VIEW_W - SIDE * 2;

    px(0, 0, VIEW_W, VIEW_H, PAL.k);

    // Back wall: concrete block in stretcher bond.
    px(SIDE, WALL_TOP, inner, FLOOR_TOP - WALL_TOP, B1_WALL);
    for (let y = WALL_TOP + 1, row = 0; y < FLOOR_TOP; y += 6, row++) {
      px(SIDE, y, inner, 1, B1_WALL_D);
      for (let x = SIDE + (row % 2 ? 7 : 0); x < VIEW_W - SIDE; x += 14) px(x, y, 1, 6, B1_WALL_D);
    }
    px(SIDE, WALL_TOP, inner, 1, '#3A3A36');
    // Pipes along the wall head, on brackets: a grey main and a red sprinkler line.
    px(SIDE, WALL_TOP + 1, inner, 3, '#5D605B');
    px(SIDE, WALL_TOP + 1, inner, 1, '#9A9D96');
    px(SIDE, WALL_TOP + 5, inner, 2, '#8E4A30');
    px(SIDE, WALL_TOP + 5, inner, 1, '#B5603E');
    for (let x = SIDE + 12; x < VIEW_W - SIDE; x += 30) px(x, WALL_TOP + 1, 2, 7, '#3A3D39');
    // B1, stencilled in brass, either side of the lifts.
    const B1 = ['110010', '101110', '110010', '101010', '110111'];
    for (const x0 of [30, 262]) {
      B1.forEach((row, y) => [...row].forEach((ch, x) => ch === '1' && px(x0 + x * 2, WALL_TOP + 13 + y * 2, 2, 2, '#B8913F')));
    }
    // Wall vents and a fuse box.
    for (const [x0, y0] of [[62, 15], [236, 15]]) {
      px(x0, y0, 18, 12, '#3E413D');
      for (let y = y0 + 2; y < y0 + 11; y += 2) px(x0 + 1, y, 16, 1, '#2A2C29');
      px(x0, y0, 18, 1, '#A3A69E');
    }
    px(290, 16, 10, 13, '#8C8F88');
    px(290, 16, 10, 1, '#B4B7AF');
    px(293, 19, 4, 4, PAL.y);
    px(294, 20, 2, 2, PAL.k);
    // Freight lifts in hazard-striped frames.
    for (const d of DOORS) {
      if (d.side !== 'back') continue;
      hazard(d.x - 11, FLOOR_TOP - 27, 22, 27);
      px(d.x - 9, FLOOR_TOP - 24, 18, 24, PAL.k);
    }
    // Caged lamps.
    for (const x of [44, 136, 184, 276]) {
      px(x, WALL_TOP + 9, 5, 3, '#FFF4D6');
      px(x + 2, WALL_TOP + 9, 1, 3, '#3A3D39');
    }
    px(SIDE, FLOOR_TOP - 3, inner, 3, '#4A4D49'); // kick plate

    // Floor: poured concrete in big slabs, speckled.
    px(SIDE, FLOOR_TOP, inner, FRONT - FLOOR_TOP, B1_FLOOR);
    for (let y = FLOOR_TOP; y < FRONT; y += 34) {
      for (let x = SIDE; x < VIEW_W - SIDE; x += 50) {
        if (Math.random() < 0.4) px(x + 1, y + 1, 49, 33, B1_FLOOR_B);
      }
    }
    for (let i = 0; i < 700; i++) {
      px(SIDE + Math.floor(Math.random() * inner), FLOOR_TOP + Math.floor(Math.random() * (FRONT - FLOOR_TOP)), 1, 1, i % 2 ? '#646862' : '#4C504B');
    }
    for (let y = FLOOR_TOP; y < FRONT; y += 34) px(SIDE, y, inner, 1, B1_JOINT);
    for (let x = SIDE; x < VIEW_W - SIDE; x += 50) px(x, FLOOR_TOP, 1, FRONT - FLOOR_TOP, B1_JOINT);
    // Light falling from the lamps.
    pool(160, 112, 78, 34, 'rgba(255,244,214,0.035)');
    pool(160, 112, 52, 22, 'rgba(255,244,214,0.04)');
    pool(160, 112, 28, 12, 'rgba(255,244,214,0.04)');
    // Raised-floor tiles, perforated, in front of the racks.
    for (const [x0, y0] of [[30, 76], [260, 76], [30, 150], [260, 150]]) {
      for (let x = x0; x < x0 + 30; x += 10) {
        px(x, y0, 10, 10, '#8A8E88');
        px(x, y0, 10, 1, '#9EA29B');
        px(x, y0, 1, 10, '#777B75');
        for (let yy = y0 + 2; yy < y0 + 9; yy += 2) for (let xx = x + 2; xx < x + 9; xx += 2) px(xx, yy, 1, 1, '#6A6E68');
      }
    }
    // A walkway line along the back, landing chevrons at the lifts, a drain.
    px(SIDE, FLOOR_TOP + 13, inner, 1, '#9C7D3C');
    for (const d of DOORS) if (d.side === 'back') hazard(d.x - 10, FLOOR_TOP + 1, 20, 4);
    px(152, 168, 16, 6, '#3C3F3B');
    for (let x = 153; x < 167; x += 2) px(x, 169, 1, 4, '#2A2C29');
    // Shade at the foot of the wall and down the sides.
    px(SIDE, FLOOR_TOP, inner, 3, 'rgba(0,0,0,0.18)');
    px(SIDE, FLOOR_TOP, 12, FRONT - FLOOR_TOP, 'rgba(0,0,0,0.1)');
    px(VIEW_W - SIDE - 12, FLOOR_TOP, 12, FRONT - FLOOR_TOP, 'rgba(0,0,0,0.1)');

    // Side walls with their doors, and the front wall, as upstairs.
    px(0, WALL_TOP, SIDE, FRONT - WALL_TOP, PAL.k);
    px(VIEW_W - SIDE, WALL_TOP, SIDE, FRONT - WALL_TOP, PAL.k);
    px(SIDE - 1, WALL_TOP, 1, FRONT - WALL_TOP, '#3A3A36');
    px(VIEW_W - SIDE, WALL_TOP, 1, FRONT - WALL_TOP, '#3A3A36');
    for (const d of DOORS) {
      if (d.side === 'back') continue;
      const x = d.side === 'left' ? 0 : VIEW_W - SIDE;
      px(x, d.y - 12, SIDE, 14, '#2A2A27');
      hazard(x, d.y - 14, SIDE, 2);
      hazard(x, d.y + 2, SIDE, 2);
    }
    px(0, FRONT, VIEW_W, VIEW_H - FRONT, PAL.k);
    px(SIDE, FRONT, inner, 1, '#3A3A36');
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
    if (p.kind === 'column') {
      // Bare concrete, a hazard band where forklifts would hit it.
      px(x, y + h - height, w, height, '#8A8D86');
      px(x, y + h - height, w, 2, '#A3A69E');
      px(x + w - 3, y + h - height, 3, height, '#767973');
      for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < w; xx++) px(x + xx, y + h - 11 + yy, 1, 1, ((xx + yy) >> 1) % 2 ? PAL.k : PAL.y);
      px(x, y + h - 2, w, 2, '#5D605B');
      return;
    }
    if (p.kind === 'server') {
      // A cabinet: its top seen from above, a grilled door with blinking lights.
      const top = y + h - height - h;
      px(x, top, w, h, '#3A3D3A');
      px(x, top, w, 1, '#4E524E');
      px(x, y + h - height, w, height, '#232624');
      px(x, y + h - height, w, 1, '#4A4E4A');
      for (let xx = x + 2; xx < x + w - 6; xx += 2) px(xx, y + h - height + 3, 1, height - 6, '#2E312F');
      px(x + w / 2 - 1, y + h - height + 3, 1, height - 6, '#151716'); // the doors' seam
      for (let i = 0; i < 6; i++) {
        const on = Math.sin(this.time * (2.3 + i * 1.3) + i * 2 + x) > 0;
        px(x + w - 4, y + h - height + 4 + i * 4, 2, 1, on ? (i % 4 === 0 ? PAL.y : '#7FD39A') : '#1A1C1B');
      }
      return;
    }
    if (p.kind === 'crate') {
      const top = y + h - height - h;
      px(x, top, w, h, '#C9A66B');
      px(x, top, w, 1, '#DDBE86');
      px(x, y + h - height, w, height, '#A9844C');
      px(x, y + h - height, w, 1, '#8C6B3A');
      px(x, y + h - height + Math.floor(height / 2), w, 1, '#8C6B3A');
      px(x + 1, top + 1, w - 2, 1, '#B8935A');
      px(x + 2, y + h - height + 2, 1, height - 3, '#8C6B3A');
      px(x + w - 3, y + h - height + 2, 1, height - 3, '#8C6B3A');
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

  private drawDoors(floor: number) {
    const c = this.ctx;
    const steel = floor ? '#8C8F88' : STEEL;
    for (const d of this.doors) {
      const coming = !!d.queue && Math.floor(this.time * 8) % 2 === 0;
      if (d.side === 'back') {
        const half = Math.round(8 * (1 - d.open));
        c.fillStyle = steel;
        c.fillRect(d.x - 8, FLOOR_TOP - 23, half, 23);
        c.fillRect(d.x + 8 - half, FLOOR_TOP - 23, half, 23);
        if (floor && half > 2) {
          // Freight doors: ribbed.
          c.fillStyle = '#747770';
          for (let y = FLOOR_TOP - 20; y < FLOOR_TOP - 2; y += 4) {
            c.fillRect(d.x - 8, y, half, 1);
            c.fillRect(d.x + 8 - half, y, half, 1);
          }
        }
        c.fillStyle = floor ? '#A3A69E' : STEEL_HI;
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
        c.fillStyle = steel;
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
    const s =
      e.kind === 'crawler' ? sp.crawler[frame]
      : e.kind === 'flyer' ? sp.flyer[frame]
      : e.kind === 'king' ? (e.rage ? sp.kingRage : sp.king)[frame]
      : sp.brute[frame];
    const scale = e.kind === 'boss' || e.kind === 'king' ? 2 : 1;
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
    // Shake shifts the whole room, so paint the uncovered edge first.
    c.fillStyle = PAL.k;
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    c.save();
    if (this.shakeT > 0) {
      const k = this.shakeK * (this.shakeT > 0.1 ? 1 : this.shakeT / 0.1);
      c.translate(Math.round(rand(-k, k)), Math.round(rand(-k, k)));
    }
    const q = this.quake;
    if (q && q.t >= BREAK) this.renderFall(q);
    else {
      c.drawImage(this.rooms[this.floor], 0, 0);
      if (q && q.t >= SLAM) {
        // The cracks so far: everything within reach of the impact.
        const r = this.crackReach(q);
        c.save();
        c.beginPath();
        c.ellipse(q.x, q.y, r + 1, r * 0.6 + 1, 0, 0, Math.PI * 2);
        c.clip();
        c.drawImage(q.cracks, 0, 0);
        c.restore();
      }
      this.drawDoors(this.floor);
      this.drawScene();
    }
    c.restore();
    this.drawBossBar();
  }

  private drawScene() {
    const c = this.ctx;
    // Shadows first, all on the floor.
    for (const e of this.enemies) this.shadow(e.x, e.y, e.r, e.z);
    for (const k of this.pickups) this.shadow(k.x, k.y, 3, k.z);
    for (const s of this.spit) this.shadow(s.x, s.y, 1, 5);
    // Hidden while it rides a lift.
    const inLift = this.phase === 'riding' && this.phaseT < 0.45;
    const p = this.player && !this.player.dead && this.mode !== 'offer' && !inLift ? this.player : null;
    if (p) this.shadow(p.x, p.y, 4);
    for (const b of this.bullets) {
      c.fillStyle = 'rgba(17,17,17,0.18)';
      c.fillRect(Math.round(b.x), Math.round(b.y), 1, 1);
    }
    for (const w of this.waves) this.drawWave(w);

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
    for (const s of this.spit) {
      // A wobbling glob of acid, outlined so it reads on any floor.
      const x = Math.round(s.x);
      const y = Math.round(s.y - 5 + Math.sin(s.life * 18));
      c.fillStyle = PAL.k;
      c.fillRect(x - 2, y - 1, 5, 3);
      c.fillRect(x - 1, y - 2, 3, 5);
      c.fillStyle = PAL.l;
      c.fillRect(x - 1, y - 1, 3, 3);
      c.fillStyle = '#B9E3C4';
      c.fillRect(x - 1, y - 1, 1, 1);
    }
    this.sparks.draw(c, this.frameNo);
    this.lower.draw(c, this.frameNo++);
    for (const pop of this.pops) drawText(c, pop.text, pop.x, pop.y, pop.life > 0.2 || Math.floor(pop.life * 20) % 2 ? PAL.k : PAL.r);
  }

  // A shockwave: a pixel ellipse along the floor, brass with a rust edge.
  // All its pixels go in one path and one fill.
  private drawWave(w: Wave) {
    const c = this.ctx;
    for (const [dr, color] of [[0, this.king()?.rage ? PAL.r : PAL.y], [-2, PAL.k]] as const) {
      const r = w.r + dr;
      if (r <= 0) continue;
      const n = Math.ceil(r * 5);
      c.beginPath();
      let lx = NaN;
      let ly = NaN;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = Math.round(w.x + Math.cos(a) * r);
        const y = Math.round(w.y + Math.sin(a) * r * 0.6);
        if ((x === lx && y === ly) || x < ARENA.x0 || x > ARENA.x1 || y < FLOOR_TOP || y > FRONT) continue;
        c.rect(x, y, 1, 1);
        [lx, ly] = [x, y];
      }
      c.fillStyle = color;
      c.fill();
    }
  }

  // Mid-fall: the office breaking up and going up out of view, B1 coming up
  // from below. The camera is `cam` pixels down from the office.
  private renderFall(q: Quake) {
    const c = this.ctx;
    const cam = Math.round(q.cam);
    const p = this.player!;
    const k = q.king;
    const office = this.rooms[0];

    // The gap between the floors: dark streaks rushing past, faster than
    // the camera, behind everything.
    if (cam > 0 && cam < DEPTH) {
      c.fillStyle = '#242422';
      const span = VIEW_H + 30;
      for (let i = 0; i < 28; i++) {
        const y = ((((i * 97) % span) - cam * 1.6) % span + span) % span - 15;
        c.fillRect(SIDE + ((i * 53) % (VIEW_W - SIDE * 2)), Math.round(y), 1, 4 + (i % 5) * 2);
      }
    }

    // B1, below.
    const below = DEPTH - cam;
    if (below < VIEW_H) {
      c.save();
      c.translate(0, below);
      c.drawImage(this.rooms[1], 0, 0);
      this.drawDoors(1);
      // Where the falling will land, a shadow that grows as they get close.
      for (const [f, b] of [[q.boss, k], [q.player, p]] as const) {
        if (f.falling) this.shadow(b.x, b.y, b.r * (0.4 + (0.6 * f.h) / DEPTH));
      }
      const things: { y: number; draw: () => void }[] = SERVER_PROPS.map((pr) => ({ y: pr.y + pr.h, draw: () => this.drawProp(pr) }));
      if (q.boss.landed) things.push({ y: k.y, draw: () => this.drawEnemy(k) });
      if (q.player.landed) things.push({ y: p.y, draw: () => this.drawPlayer(p) });
      things.sort((a, b) => a.y - b.y).forEach((t) => t.draw());
      this.lower.draw(c, this.frameNo);
      c.restore();
    }

    // The office, above.
    c.save();
    c.translate(0, -cam);
    c.drawImage(office, 0, 0, VIEW_W, FLOOR_TOP, 0, 0, VIEW_W, FLOOR_TOP);
    this.drawDoors(0);

    const fallen = (x: number, y: number) => this.tileAt(q, x, y).h;
    // Whatever has gone, deepest first: smaller and darker the further down.
    const gone = q.tiles.filter((t) => t.h > 0 && t.h < 160).sort((a, b) => b.h - a.h);
    for (const t of gone) {
      const s = 1 - t.h / 160;
      const th = Math.min(TILE_H, FRONT - t.y);
      const w = Math.max(1, Math.round(TILE_W * s));
      const h = Math.max(1, Math.round(th * s));
      const x = Math.round(t.x + TILE_W / 2 - w / 2);
      const y = Math.round(t.y + th / 2 + t.h - h / 2);
      c.drawImage(q.cracked, t.x, t.y, TILE_W, th, x, y, w, h);
      c.fillStyle = `rgba(17,17,17,${Math.min(0.9, t.h / 110).toFixed(2)})`;
      c.fillRect(x, y, w, h);
    }
    const sinking = (y: number, h: number, draw: () => void, cx: number) => {
      const s = 1 - h / 160;
      if (s <= 0.05) return;
      c.save();
      c.globalAlpha = Math.max(0, 1 - h / 120);
      c.translate(cx, y + h);
      c.scale(s, s);
      c.translate(-cx, -y);
      draw();
      c.restore();
    };
    for (const pr of PROPS) {
      const h = fallen(pr.x + pr.w / 2, pr.y + pr.h / 2);
      if (h > 0) sinking(pr.y + pr.h, h, () => this.drawProp(pr), pr.x + pr.w / 2);
    }
    for (const e of this.enemies) {
      const h = fallen(e.x, e.y);
      if (e !== k && h > 0) sinking(e.y, h, () => this.drawEnemy(e), e.x);
    }
    // Rubble, falling a little behind the camera.
    for (const r of q.rubble) {
      c.fillStyle = r.color;
      c.fillRect(Math.round(r.x), Math.round(r.y + r.h), r.w, r.w > 2 ? 2 : 1);
    }
    // The two that matter fall with the camera, full size.
    for (const [f, b, draw] of [[q.boss, k, () => this.drawEnemy(k)], [q.player, p, () => this.drawPlayer(p)]] as const) {
      if (!f.falling || f.landed) continue;
      c.save();
      c.translate(0, f.h);
      draw();
      c.restore();
    }

    // What's still standing, with whatever's still on it. Tiles about to go shiver.
    for (const t of q.tiles) {
      if (t.h > 0) continue;
      const th = Math.min(TILE_H, FRONT - t.y);
      const jx = q.t > t.at - 0.25 ? Math.round(rand(-1, 1)) : 0;
      c.drawImage(q.cracked, t.x, t.y, TILE_W, th, t.x + jx, t.y, TILE_W, th);
    }
    const standing: { y: number; draw: () => void }[] = [];
    for (const pr of PROPS) if (fallen(pr.x + pr.w / 2, pr.y + pr.h / 2) === 0) standing.push({ y: pr.y + pr.h, draw: () => this.drawProp(pr) });
    for (const e of this.enemies) if (e !== k && fallen(e.x, e.y) === 0) standing.push({ y: e.y, draw: () => this.drawEnemy(e) });
    if (!q.boss.falling) standing.push({ y: k.y, draw: () => this.drawEnemy(k) });
    if (!q.player.falling) standing.push({ y: p.y, draw: () => this.drawPlayer(p) });
    standing.sort((a, b) => a.y - b.y).forEach((t) => t.draw());
    this.sparks.draw(c, this.frameNo);

    // The walls stay put, in front of everything going down.
    c.drawImage(office, 0, WALL_TOP, SIDE, FRONT - WALL_TOP, 0, WALL_TOP, SIDE, FRONT - WALL_TOP);
    c.drawImage(office, VIEW_W - SIDE, WALL_TOP, SIDE, FRONT - WALL_TOP, VIEW_W - SIDE, WALL_TOP, SIDE, FRONT - WALL_TOP);
    c.drawImage(office, 0, FRONT, VIEW_W, VIEW_H - FRONT, 0, FRONT, VIEW_W, VIEW_H - FRONT);
    c.restore();

    this.frameNo++;
  }

  // Across the top: a crown and the Root Bug's health. A notch marks half,
  // where it takes the floor out.
  private drawBossBar() {
    const k = this.king();
    if (!k || this.mode === 'attract') return;
    const c = this.ctx;
    const w = 120;
    const x = Math.round((VIEW_W - w) / 2);
    const y = 2;
    const f = clamp(k.hp / k.max, 0, 1);
    c.drawImage(this.sprites.crown, x - 10, y - 1);
    c.fillStyle = '#3A3A36';
    c.fillRect(x - 1, y - 1, w + 2, 5);
    c.fillStyle = '#1E1E1C';
    c.fillRect(x, y, w, 3);
    c.fillStyle = PAL.c;
    c.fillRect(x, y, Math.round(w * this.barLag), 3);
    c.fillStyle = k.rage ? PAL.r : PAL.y;
    c.fillRect(x, y, Math.round(w * f), 3);
    if (!k.rage) {
      c.fillStyle = PAL.c;
      c.fillRect(x + w / 2, y - 1, 1, 5);
    }
  }
}
