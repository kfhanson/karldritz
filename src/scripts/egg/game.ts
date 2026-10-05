// Bug Hunt — survival in a three-storey office. Bugs ride the elevators in,
// round after round; each round is bigger, every fifth has a boss. A stair
// core at each end of the building joins the floors, and the player aims with
// the mouse.
// Fixed 60 Hz simulation on a 320×184 pixel canvas.
import { burst, tone } from './audio';
import { buildSprites, drawText, PAL, type Sprite, type Sprites } from './sprites';

export const VIEW_W = 320;
export const VIEW_H = 184;
const T = 8; // tile size

// Cross-section of the building. '#' is wall or floor slab. The slabs stop
// short of both ends: those are the stair shafts.
const MAP = [
  '########################################',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#.......########################.......#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#.......########################.......#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '########################################',
];
const COLS = MAP[0].length;
const ROWS = MAP.length;

// Walking surface of each storey, top floor first.
const FLOORS = [56, 112, 176];

// Stairs, as one-way slopes: (x0, y0) is the foot, (x1, y1) the head. Bodies
// land on them from above and pass under them otherwise. Flat ones are the
// half-landings.
interface Ramp {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Each end of the building has a stair core: switchback flights with a
// half-landing against the outer wall, opening onto every floor through a
// doorway at the shaft's inner edge.
const SHAFT = 56; // shaft width
const DOOR_L = 8 + SHAFT; // x of the left shaft's doorway
const DOOR_R = VIEW_W - 8 - SHAFT;
function stairCore(side: 1 | -1): Ramp[] {
  const door = side > 0 ? DOOR_L : DOOR_R; // where flights meet each floor
  const turn = door - side * 40; // where they meet the landing
  const wall = side > 0 ? 8 : VIEW_W - 8;
  const flights: Ramp[] = [];
  for (let f = FLOORS.length - 1; f > 0; f--) {
    const low = FLOORS[f];
    const high = FLOORS[f - 1];
    const mid = (low + high) / 2;
    flights.push({ x0: door, y0: low, x1: turn, y1: mid }); // up to the landing
    flights.push({ x0: wall, y0: mid, x1: turn, y1: mid }); // the landing
    flights.push({ x0: turn, y0: mid, x1: door, y1: high }); // on up to the next floor
  }
  return flights;
}
const RAMPS: Ramp[] = [...stairCore(1), ...stairCore(-1)];
const isLanding = (r: Ramp) => r.y0 === r.y1;

// Elevator doors in the central core, two on every floor.
const CORE_L = 132;
const CORE_R = 188;
const LIFTS = FLOORS.flatMap((_, floor) => [
  { x: 146, floor },
  { x: 174, floor },
]);

const STEP = 1 / 60;
const MAX_HP = 5;
const RUN = 92;
const JUMP = 245;
const BULLET = 320;

// Office colours, kept to the site palette plus glass and steel.
const WALL = '#F6F5F1';
const GLASS = '#E2E7E5';
const SKYLINE = '#CDD4D0';
const MULLION = '#9C9B94';
const STEEL = '#BDBBB3';
const CONCRETE = '#E7E5DF';
const CONCRETE_LINE = '#DDDAD3';
const PANEL = '#EEECE6';
const PANEL_SEAM = '#E2E0D9';
const EXIT = '#2F8F5B';
const SERVERS = [CORE_R + 8, CORE_R + 22];
const STEEL_HI = '#D6D4CD';
const LIGHT = '#FFF4D6';

type Kind = 'crawler' | 'flyer' | 'brute' | 'boss';

interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  ground: boolean;
  wall: boolean;
  ramp: Ramp | null;
  climb?: number; // at a fork in the stairs: +1 take the way up, -1 the way down
}

interface Player extends Body {
  face: 1 | -1;
  hp: number;
  inv: number;
  coyote: number;
  buffer: number;
  cool: number;
  drop: number;
  rapid: number;
  anim: number;
  dead: boolean;
}

interface Enemy extends Body {
  kind: Kind;
  hp: number;
  dir: 1 | -1;
  speed: number;
  flash: number;
  t: number;
  hop: number;
  life: number; // attract mode only: wanders off after this long
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  grav: number;
}

interface Pickup extends Body {
  kind: 'heart' | 'bolt';
  life: number;
}

interface Lift {
  x: number;
  floor: number;
  charge: number; // seconds until the doors let something out
  total: number;
  queue: Kind | null;
  open: number; // 0 shut … 1 open
  hold: number; // seconds the doors stay open after a spawn
}

export interface Hud {
  round: number;
  score: number;
  best: number;
  hp: number;
  maxHp: number;
  mult: number;
  rapid: boolean;
}

export interface Hooks {
  hud(h: Hud): void;
  banner(title: string, sub?: string): void;
  over(result: { score: number; round: number; best: number; record: boolean }): void;
}

export type Action = 'left' | 'right' | 'up' | 'down' | 'jump' | 'fire';

/** How the player aims: at the mouse, along their facing, or at the nearest bug (touch). */
export type AimMode = 'mouse' | 'facing' | 'auto';

const STATS: Record<Kind, { w: number; h: number; score: number }> = {
  crawler: { w: 8, h: 6, score: 10 },
  flyer: { w: 7, h: 5, score: 15 },
  brute: { w: 12, h: 12, score: 50 },
  boss: { w: 24, h: 24, score: 400 },
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const tile = (c: number, r: number) => (c < 0 || c >= COLS || r < 0 || r >= ROWS ? '#' : MAP[r][c]);
const solidAt = (x: number, y: number) => tile(Math.floor(x / T), Math.floor(y / T)) === '#';

const rampSpan = (r: Ramp) => [Math.min(r.x0, r.x1), Math.max(r.x0, r.x1)];
const rampY = (r: Ramp, x: number) => r.y0 + ((x - r.x0) * (r.y1 - r.y0)) / (r.x1 - r.x0);

/** Storey a pair of feet belongs to (0 = top). Mid-flight counts as the storey below. */
function floorOf(feet: number): number {
  for (let i = 0; i < FLOORS.length; i++) if (feet <= FLOORS[i] + 2) return i;
  return FLOORS.length - 1;
}

function loadBest(): number {
  try {
    return Number(localStorage.getItem('egg-best')) || 0;
  } catch {
    return 0;
  }
}

export class Game {
  mode: 'attract' | 'play' | 'paused' | 'over' = 'attract';

  private ctx: CanvasRenderingContext2D;
  private sprites: Sprites = buildSprites();
  private bg: HTMLCanvasElement;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private time = 0;

  private held = new Set<Action>();
  private jumpPressed = false;
  private aim = { x: VIEW_W / 2, y: VIEW_H / 2 };
  private aimMode: AimMode = 'facing';

  private player: Player | null = null;
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private pickups: Pickup[] = [];
  private pops: { x: number; y: number; text: string; life: number }[] = [];
  private lifts: Lift[] = LIFTS.map((l) => ({ ...l, charge: 0, total: 1, queue: null, open: 0, hold: 0 }));

  private round = 0;
  private phase: 'intro' | 'fight' | 'clear' = 'intro';
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

  constructor(
    private canvas: HTMLCanvasElement,
    private hooks: Hooks,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.bg = this.paintOffice();
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
    this.particles = [];
    this.pops = [];
    this.resetLifts();
    this.score = 0;
    this.combo = 0;
    this.comboT = 0;
    this.deadT = 0;
    this.held.clear();
    this.player = {
      x: 104, y: 176 - 11, w: 6, h: 11, vx: 0, vy: 0, ground: false, wall: false, ramp: null, climb: 1,
      face: 1, hp: MAX_HP, inv: 0, coyote: 0, buffer: 0, cool: 0, drop: 0, rapid: 0, anim: 0, dead: false,
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

  /** Back to the idle building behind the menu. */
  attract() {
    this.mode = 'attract';
    this.player = null;
    this.enemies = [];
    this.bullets = [];
    this.pickups = [];
    this.resetLifts();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }

  press(a: Action) {
    if (a === 'jump' && !this.held.has('jump')) this.jumpPressed = true;
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

  private resetLifts() {
    for (const l of this.lifts) Object.assign(l, { charge: 0, queue: null, open: 0, hold: 0 });
  }

  // ── Loop ──
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.mode === 'paused') return;
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

    this.updateLifts(dt);
    if (this.player) this.updatePlayer(this.player, dt);
    for (const e of this.enemies) this.updateEnemy(e, dt);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateFx(dt);
    this.jumpPressed = false;

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
    this.hooks.banner(`Round ${r}`, boss ? 'Something big is riding the elevator' : `${this.toSpawn.length} bugs inbound`);
    [523, 659, 784].forEach((f, i) => tone(f, f, 0.12, 0.08, 'square', i * 0.11));
  }

  private roster(r: number): Kind[] {
    const list: Kind[] = [];
    const n = 4 + r * 3;
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
      const maxAlive = Math.min(16, 5 + this.round);
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.toSpawn.length && this.enemies.length + this.queued() < maxAlive) {
        if (this.callLift(this.toSpawn[0])) {
          this.toSpawn.shift();
          this.spawnT = Math.max(0.4, 1.4 - this.round * 0.08);
        }
      }
      if (!this.toSpawn.length && !this.queued() && !this.enemies.length) {
        this.phase = 'clear';
        this.phaseT = 2.4;
        const healed = p.hp < MAX_HP;
        p.hp = Math.min(MAX_HP, p.hp + 1);
        this.hooks.banner(`Round ${this.round} cleared`, healed ? '+1 heart' : 'Full health');
        [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.14, 0.08, 'triangle', i * 0.09));
      }
    } else if (this.phase === 'clear' && this.phaseT <= 0) this.startRound(this.round + 1);
  }

  private updateAttract(dt: number) {
    // Keep the building alive behind the menu: a few bugs wander the floors.
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.enemies.length + this.queued() < 5) {
      this.callLift(Math.random() < 0.35 ? 'flyer' : 'crawler');
      this.spawnT = rand(1.5, 3);
    }
    for (const e of this.enemies) e.life -= dt;
  }

  private queued() {
    return this.lifts.filter((l) => l.queue).length;
  }

  // Pick an idle elevator, preferring ones away from the player so nothing
  // spawns on top of them.
  private callLift(kind: Kind): boolean {
    const p = this.player;
    let free = this.lifts.filter((l) => !l.queue);
    if (p && free.length > 1) {
      const far = free.filter((l) => Math.abs(l.x - (p.x + p.w / 2)) > 60 || floorOf(p.y + p.h) !== l.floor);
      if (far.length) free = far;
    }
    if (!free.length) return false;
    const l = free[Math.floor(Math.random() * free.length)];
    l.queue = kind;
    l.total = l.charge = kind === 'boss' ? 1.8 : 0.9;
    if (this.mode === 'play') tone(kind === 'boss' ? 330 : 880, kind === 'boss' ? 330 : 880, 0.08, 0.04, 'sine');
    return true;
  }

  private updateLifts(dt: number) {
    for (const l of this.lifts) {
      if (l.queue) {
        l.charge -= dt;
        // Doors slide open over the last part of the wait.
        l.open = Math.min(1, Math.max(0, 1 - l.charge / 0.4));
        if (l.charge <= 0) {
          this.spawn(l.queue, l);
          if (this.mode === 'play') tone(1175, 1175, 0.12, 0.05, 'sine'); // ding
          l.queue = null;
          l.hold = 0.6;
        }
      } else if (l.hold > 0) {
        l.hold -= dt;
      } else {
        l.open = Math.max(0, l.open - dt * 2.5);
      }
    }
  }

  private spawn(kind: Kind, lift: Lift) {
    const s = STATS[kind];
    const r = Math.max(1, this.round);
    const hp = { crawler: r >= 6 ? 3 : 2, flyer: r >= 8 ? 2 : 1, brute: 8 + r, boss: 30 + r * 5 }[kind];
    const speed = {
      crawler: Math.min(72, 34 + r * 2.5),
      flyer: Math.min(70, 38 + r * 2),
      brute: Math.min(34, 20 + r),
      boss: 18,
    }[kind];
    const floor = FLOORS[lift.floor];
    this.enemies.push({
      kind, x: lift.x - s.w / 2, y: floor - s.h - (kind === 'flyer' ? 8 : 0), w: s.w, h: s.h,
      vx: 0, vy: 0, ground: false, wall: false, ramp: null, hp,
      dir: lift.x < VIEW_W / 2 ? 1 : -1, // step out into the building
      speed, flash: 0, t: Math.random() * 10, hop: rand(0.8, 2),
      life: this.mode === 'play' ? Infinity : rand(9, 14),
    });
    this.puff(lift.x, floor - 8, kind === 'boss' ? 26 : 6, PAL.r);
    if (kind === 'boss') this.shake(6, 0.5);
  }

  // ── Player ──
  private aimDir(p: Player): { x: number; y: number } {
    const cx = p.x + p.w / 2;
    const cy = p.y + 6;
    let tx: number | null = null;
    let ty = cy;
    if (this.aimMode === 'mouse') {
      tx = this.aim.x;
      ty = this.aim.y;
    } else if (this.aimMode === 'auto') {
      let best = 160 * 160;
      for (const e of this.enemies) {
        const dx = e.x + e.w / 2 - cx;
        const dy = e.y + e.h / 2 - cy;
        const d = dx * dx + dy * dy;
        if (e.hp > 0 && d < best) [best, tx, ty] = [d, e.x + e.w / 2, e.y + e.h / 2];
      }
    }
    if (tx === null) return { x: p.face, y: 0 };
    const dx = tx - cx;
    const dy = ty - cy;
    const d = Math.hypot(dx, dy);
    return d < 1 ? { x: p.face, y: 0 } : { x: dx / d, y: dy / d };
  }

  private updatePlayer(p: Player, dt: number) {
    if (p.dead) return;
    const h = this.held;
    const ax = (h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0);
    if (ax) {
      p.vx += ax * (p.ground ? 1500 : 1000) * dt;
      p.face = ax as 1 | -1;
    } else {
      const f = (p.ground ? 1800 : 500) * dt;
      p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
    }
    p.vx = Math.max(-RUN, Math.min(RUN, p.vx));
    // W / S choose the way at a fork in the stairs; otherwise keep going the
    // way you were.
    if (h.has('up')) p.climb = 1;
    else if (h.has('down')) p.climb = -1;
    else if (p.ramp && !isLanding(p.ramp) && Math.abs(p.vx) > 8) {
      p.climb = Math.sign(p.ramp.x1 - p.ramp.x0) === Math.sign(p.vx) ? 1 : -1;
    }
    const aim = this.aimDir(p);
    if (this.aimMode !== 'facing' && Math.abs(aim.x) > 0.05) p.face = aim.x < 0 ? -1 : 1;

    p.coyote = p.ground ? 0.09 : p.coyote - dt;
    p.buffer = this.jumpPressed ? 0.11 : p.buffer - dt;
    if (p.buffer > 0 && p.coyote > 0) {
      if (h.has('down') && p.ramp) {
        p.drop = 0.25; // hop off the side of the stairs
      } else {
        p.vy = -JUMP;
        this.dust(p.x + p.w / 2, p.y + p.h, 4);
        tone(380, 760, 0.09, 0.07, 'square');
      }
      p.buffer = 0;
      p.coyote = 0;
    }
    // Short hop when the button is let go early; heavier on the way down.
    const g = p.vy < 0 && h.has('jump') ? 980 : 1700;
    p.vy = Math.min(330, p.vy + g * dt);
    p.drop -= dt;

    const wasGround = p.ground;
    const fallSpeed = p.vy;
    this.move(p, dt, p.drop <= 0);
    if (!wasGround && p.ground && fallSpeed > 160) {
      this.dust(p.x + p.w / 2, p.y + p.h, 5);
      burst(0.04, 500, 0.12, 'lowpass');
    }

    p.cool -= dt;
    if (h.has('fire') && p.cool <= 0) {
      p.cool = p.rapid > 0 ? 0.08 : 0.17;
      const mx = p.x + p.w / 2 + aim.x * 6;
      const my = p.y + 6 + aim.y * 6;
      if (!solidAt(mx, my)) {
        this.bullets.push({ x: mx, y: my, vx: aim.x * BULLET, vy: aim.y * BULLET, life: 1 });
        this.particles.push({ x: mx, y: my, vx: aim.x * 30, vy: aim.y * 30, life: 0.06, max: 0.06, color: PAL.y, grav: 0 });
      }
      p.vx -= aim.x * 14; // a little recoil
      tone(900, 480, 0.05, 0.04, 'square');
    }
    p.inv -= dt;
    p.rapid -= dt;
    p.anim += Math.abs(p.vx) * dt;

    for (const e of this.enemies) {
      if (p.inv > 0 || e.hp <= 0) break;
      const hit = { x: e.x + 1, y: e.y + 1, w: e.w - 2, h: e.h - 2 };
      if (overlap(p, hit)) this.hurt(p, p.x + p.w / 2 < e.x + e.w / 2 ? -1 : 1);
    }
  }

  private hurt(p: Player, dir: number) {
    p.hp -= 1;
    p.inv = 1.1;
    p.vx = dir * 170;
    p.vy = -180;
    p.ramp = null;
    this.combo = 0;
    this.shake(5, 0.25);
    this.hitstop = 0.08;
    this.puff(p.x + p.w / 2, p.y + p.h / 2, 8, PAL.g);
    tone(220, 70, 0.25, 0.12, 'sawtooth');
    burst(0.15, 400, 0.35, 'lowpass');
    if (p.hp <= 0) {
      p.dead = true;
      this.puff(p.x + p.w / 2, p.y + p.h / 2, 30, PAL.g);
      this.puff(p.x + p.w / 2, p.y + p.h / 2, 12, PAL.c);
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

  // Axis-separated tile collision, then the stairs. Speeds stay under one tile
  // per step, so nothing tunnels.
  private move(b: Body, dt: number, stairs = true) {
    b.wall = false;
    b.x += b.vx * dt;
    const r0 = Math.floor(b.y / T);
    const r1 = Math.floor((b.y + b.h - 0.01) / T);
    if (b.vx !== 0) {
      const c = b.vx > 0 ? Math.floor((b.x + b.w - 0.01) / T) : Math.floor(b.x / T);
      let blocked = false;
      for (let r = r0; r <= r1; r++) if (tile(c, r) === '#') blocked = true;
      if (blocked) {
        // A lip of a few pixels (where a flight meets a floor) is stepped up
        // onto rather than walked into.
        const top = r1 * T;
        let clear = true;
        for (let r = r0; r < r1; r++) if (tile(c, r) === '#') clear = false;
        if (clear && tile(c, r1 - 1) !== '#' && b.y + b.h - top <= 5) {
          b.y = top - b.h;
        } else {
          b.x = b.vx > 0 ? c * T - b.w : (c + 1) * T;
          b.vx = 0;
          b.wall = true;
        }
      }
    }

    const prevBottom = b.y + b.h;
    b.y += b.vy * dt;
    b.ground = false;
    const c0 = Math.floor(b.x / T);
    const c1 = Math.floor((b.x + b.w - 0.01) / T);
    if (b.vy > 0) {
      const r = Math.floor((b.y + b.h - 0.01) / T);
      for (let c = c0; c <= c1; c++) {
        if (tile(c, r) === '#') {
          b.y = r * T - b.h;
          b.vy = 0;
          b.ground = true;
        }
      }
    } else if (b.vy < 0) {
      const r = Math.floor(b.y / T);
      for (let c = c0; c <= c1; c++) if (tile(c, r) === '#') (b.y = (r + 1) * T), (b.vy = 0);
    }

    // Stairs: land on them from above, walk onto them from the foot, stick to
    // them on the way down. Where a landing meets two flights, take the one
    // going the way the body wants (climb), and keep to the flight you're on.
    const was = b.ramp;
    b.ramp = null;
    if (!stairs || b.vy < 0) return;
    const cx = b.x + b.w / 2;
    const dir = Math.sign(b.vx);
    const want = b.climb ?? 0;
    let pick: Ramp | null = null;
    let best = -Infinity;
    for (const r of RAMPS) {
      const [lo, hi] = rampSpan(r);
      if (cx < lo || cx > hi) continue;
      const sy = rampY(r, cx);
      if (prevBottom > sy + 3 || b.y + b.h < sy - (was === r ? 5 : 0)) continue;
      const up = !isLanding(r) && dir !== 0 && Math.sign(r.x1 - r.x0) === dir;
      // Stepping onto the stairs from a floor, ignore a flight going the wrong
      // way: the way down starts just below the doorway, the way up level
      // with it, so the body drops the few pixels onto the right one.
      if (!was && !isLanding(r) && want < 0 && up) continue;
      let score = r === was ? 1 : 0;
      const ahead = cx + dir * 3;
      if (dir && (ahead < lo || ahead > hi)) score -= 4; // about to run off its end
      if (!isLanding(r) && dir) score += (up ? want : -want) * 2;
      if (score > best) [best, pick] = [score, r];
    }
    if (pick) {
      b.y = rampY(pick, cx) - b.h;
      b.vy = 0;
      b.ground = true;
      b.ramp = pick;
    }
  }

  // ── Monsters ──
  private target(): { x: number; y: number; feet: number } {
    const p = this.player;
    if (p && !p.dead) return { x: p.x + p.w / 2, y: p.y + p.h / 2, feet: p.y + p.h };
    // No one to chase: drift after a point that tours the floors.
    const f = FLOORS[Math.floor(this.time / 7) % FLOORS.length];
    return { x: 160 + Math.sin(this.time * 0.35) * 130, y: f - 8, feet: f };
  }

  private updateEnemy(e: Enemy, dt: number) {
    e.t += dt;
    e.flash -= dt;
    const tgt = this.target();
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;

    if (e.kind === 'flyer') {
      // Flyers ignore the building: they're glitches, they go through walls.
      const dx = tgt.x - cx;
      const dy = tgt.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const wob = Math.sin(e.t * 4) * 22;
      const wantX = (dx / d) * e.speed - (dy / d) * wob;
      const wantY = (dy / d) * e.speed + (dx / d) * wob;
      e.vx += (wantX - e.vx) * Math.min(1, 2.2 * dt);
      e.vy += (wantY - e.vy) * Math.min(1, 2.2 * dt);
      e.x = Math.max(T, Math.min(VIEW_W - T - e.w, e.x + e.vx * dt));
      e.y = Math.max(T, Math.min(ROWS * T - T - e.h, e.y + e.vy * dt));
      e.dir = e.vx < 0 ? -1 : 1;
      return;
    }

    // Walkers: chase on the same floor; otherwise make for the nearer stair
    // core's doorway and take its flights the right way. A landing ends at the
    // outer wall, and bouncing off it turns them onto the next flight.
    // Bosses are too big for the stairs.
    if (e.ground) {
      const mine = floorOf(e.y + e.h);
      const theirs = floorOf(tgt.feet);
      const dx = tgt.x - cx;
      // Compare heights, not floor numbers: a landing sits between floors.
      const rise = e.y + e.h - tgt.feet;
      e.climb = rise > 20 ? 1 : rise < -20 ? -1 : 0;
      if (e.ramp) {
        if (Math.abs(tgt.y - cy) < 16 && Math.abs(dx) > 6) e.dir = dx < 0 ? -1 : 1;
      } else if (theirs === mine || e.kind === 'boss') {
        if (Math.abs(dx) > 6) e.dir = dx < 0 ? -1 : 1;
      } else if (cx > DOOR_L && cx < DOOR_R) {
        const door = Math.abs(cx - DOOR_L) <= Math.abs(cx - DOOR_R) ? DOOR_L : DOOR_R;
        e.dir = door < cx ? -1 : 1; // into the shaft
      }
      e.hop -= dt;
      if (e.kind === 'crawler' && e.hop <= 0) {
        e.hop = rand(1.2, 2.4);
        if (theirs === mine && !e.ramp && Math.abs(dx) < 50 && Math.random() < 0.5) e.vy = -180;
      }
    }
    const want = e.dir * e.speed;
    e.vx += (want - e.vx) * Math.min(1, (e.ground ? 8 : 2) * dt);
    e.vy = Math.min(330, e.vy + 1100 * dt);
    this.move(e, dt, e.kind !== 'boss');
    if (e.wall) e.dir = e.dir > 0 ? -1 : 1;
  }

  private hitEnemy(e: Enemy, dx: number, dy: number) {
    e.hp -= 1;
    e.flash = 0.07;
    const heavy = e.kind === 'brute' || e.kind === 'boss';
    e.vx += dx * (heavy ? 18 : 90);
    if (e.kind === 'crawler') e.vy = Math.min(e.vy, -70);
    if (e.kind === 'flyer') e.vy += dy * 60;
    burst(0.05, 3000, 0.2);
    if (e.hp > 0) return;

    this.combo += 1;
    this.comboT = 1.5;
    const mult = this.mult();
    const pts = STATS[e.kind].score * mult;
    this.score += pts;
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    this.pops.push({ x: cx, y: e.y - 4, text: mult > 1 ? `+${pts}x${mult}` : `+${pts}`, life: 0.8 });
    this.puff(cx, cy, e.kind === 'boss' ? 50 : heavy ? 20 : 10, e.kind === 'flyer' ? PAL.r : PAL.k);
    this.puff(cx, cy, e.kind === 'boss' ? 20 : 4, PAL.r);
    this.shake(e.kind === 'boss' ? 9 : heavy ? 3 : 1.5, e.kind === 'boss' ? 0.6 : 0.12);
    this.hitstop = e.kind === 'boss' ? 0.2 : heavy ? 0.06 : 0.025;
    tone(520, 110, 0.15, 0.08, 'square');
    burst(0.12, 900, 0.25, 'lowpass');

    const p = this.player;
    const drop = e.kind === 'boss' || Math.random() < (heavy ? 0.3 : 0.06);
    if (p && drop) {
      const kind = e.kind === 'boss' || (p.hp < MAX_HP && Math.random() < 0.6) ? 'heart' : 'bolt';
      this.pickups.push({ kind, x: cx - 3, y: cy - 3, w: 7, h: 6, vx: 0, vy: -120, ground: false, wall: false, ramp: null, life: 9 });
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
      if (solidAt(b.x, b.y)) {
        b.life = 0;
        this.puff(b.x, b.y, 3, PAL.m);
        continue;
      }
      const box = { x: b.x - 1.5, y: b.y - 1.5, w: 3, h: 3 };
      for (const e of this.enemies) {
        if (e.hp > 0 && overlap(box, e)) {
          this.hitEnemy(e, b.vx / BULLET, b.vy / BULLET);
          b.life = 0;
          break;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  private updatePickups(dt: number) {
    const p = this.player;
    for (const k of this.pickups) {
      k.life -= dt;
      k.vy = Math.min(200, k.vy + 600 * dt);
      this.move(k, dt);
      if (p && !p.dead && overlap(p, k)) {
        k.life = 0;
        if (k.kind === 'heart') p.hp = Math.min(MAX_HP, p.hp + 1);
        else p.rapid = 6;
        this.puff(k.x + 3, k.y + 3, 8, k.kind === 'heart' ? PAL.r : PAL.y);
        tone(660, 1320, 0.12, 0.07, 'triangle');
        tone(990, 1980, 0.12, 0.06, 'triangle', 0.06);
      }
    }
    this.pickups = this.pickups.filter((k) => k.life > 0);
  }

  private updateFx(dt: number) {
    for (const q of this.particles) {
      q.life -= dt;
      q.vy += q.grav * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    this.particles = this.particles.filter((q) => q.life > 0);
    for (const pop of this.pops) {
      pop.life -= dt;
      pop.y -= 14 * dt;
    }
    this.pops = this.pops.filter((pop) => pop.life > 0);
  }

  private puff(x: number, y: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(20, 110);
      const life = rand(0.25, 0.6);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life, max: life, color, grav: 300 });
    }
  }

  private dust(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const life = rand(0.15, 0.3);
      this.particles.push({ x, y: y - 1, vx: rand(-40, 40), vy: rand(-25, -5), life, max: life, color: PAL.w, grav: 0 });
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
      maxHp: MAX_HP,
      mult: this.mult(),
      rapid: !!p && p.rapid > 0,
    };
    const key = JSON.stringify(hud);
    if (key === this.lastHud) return;
    this.lastHud = key;
    this.hooks.hud(hud);
  }

  // ── Drawing: the building ──
  // Section through a three-storey office: stair cores at both ends, a lift
  // core in the middle, glazed offices between. Top to bottom: a meeting room
  // and a server corner, open-plan desks, the lobby.
  private paintOffice(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = VIEW_W;
    c.height = VIEW_H;
    const g = c.getContext('2d')!;
    const px = (x: number, y: number, w: number, h: number, col: string) => {
      g.fillStyle = col;
      g.fillRect(x, y, w, h);
    };

    // One skyline for the whole building; each storey sees a different slice.
    const skyline: number[] = [];
    for (let x = 0; x < VIEW_W; ) {
      const w = 6 + Math.floor(Math.random() * 14);
      const h = 6 + Math.floor(Math.random() * 18);
      for (let k = 0; k < w; k++) skyline.push(h);
      x += w;
    }

    const storeys = FLOORS.map((floor, i) => ({ top: i === 0 ? 8 : FLOORS[i - 1] + 8, floor }));
    const offices = [
      [DOOR_L, CORE_L],
      [CORE_R, DOOR_R],
    ];

    px(0, 0, VIEW_W, VIEW_H, WALL);

    // Stair shafts: bare concrete, a shade darker than the offices.
    for (const [x0, x1] of [[8, DOOR_L], [DOOR_R, VIEW_W - 8]]) {
      px(x0, 8, x1 - x0, FLOORS[2] - 8, CONCRETE);
      for (let y = 14; y < FLOORS[2]; y += 12) px(x0, y, x1 - x0, 1, CONCRETE_LINE); // block coursing
    }

    // Lift core: a panelled wall.
    storeys.forEach(({ top, floor }) => {
      px(CORE_L, top, CORE_R - CORE_L, floor - top, PANEL);
      for (let x = CORE_L + 7; x < CORE_R; x += 14) px(x, top, 1, floor - top, PANEL_SEAM);
    });

    storeys.forEach(({ top, floor }, si) => {
      const lobby = si === 2;
      // Glazing along each office.
      for (const [a, b] of offices) {
        const x0 = a + 4;
        const x1 = b - 4;
        const wy = top + 6;
        const wh = floor - top - (lobby ? 10 : 15);
        px(x0, wy, x1 - x0, wh, GLASS);
        for (let x = x0; x < x1; x++) {
          const h = Math.round(skyline[x] * (0.55 + si * 0.25));
          px(x, wy + wh - h, 1, h, SKYLINE);
          if (x % 3 === 0 && h > 6 && (x * 7 + si) % 5 === 0) px(x, wy + wh - h + 3, 1, 1, WALL); // lit windows
        }
        for (let x = x0 + 6 + (si * 5) % 9; x < x1 - 6; x += 22) {
          for (let d = 0; d < 7; d++) px(x + d, wy + 2 + d * 2, 1, 2, 'rgba(255,255,255,0.55)'); // reflections
        }
        for (let x = x0; x <= x1; x += 16) px(Math.min(x, x1), wy, 1, wh, MULLION);
        px(x0, wy, x1 - x0 + 1, 1, MULLION);
        px(x0, wy + wh, x1 - x0 + 1, 1, MULLION);
        px(x0, wy + wh + 1, x1 - x0 + 1, 1, PAL.w); // sill
        // Ceiling lights.
        for (let x = a + 8; x < b - 10; x += 26) {
          px(x, top, 12, 1, LIGHT);
          px(x - 2, top + 1, 16, 1, 'rgba(255,244,214,0.5)');
        }
        px(a, floor - 2, b - a, 1, PAL.w); // skirting
      }

      // Shaft doorways: a wall down to the door head, a frame, an exit sign.
      for (const [door, side] of [[DOOR_L, 1], [DOOR_R, -1]] as const) {
        const head = floor - 27;
        px(door - 1, top, 2, head - top, PAL.m);
        px(door - 3, head, 6, 1, PAL.m);
        const sx = side > 0 ? door + 3 : door - 12;
        px(sx, head - 7, 9, 4, EXIT);
        px(sx + 2, head - 6, 5, 1, WALL);
        px(side > 0 ? sx + 6 : sx + 2, head - 5, 1, 1, WALL); // arrow tip
      }
    });

    // Slabs and walls.
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        if (MAP[r][col] !== '#') continue;
        px(col * T, r * T, T, T, PAL.k);
        if (r > 0 && tile(col, r - 1) !== '#') px(col * T, r * T, T, 1, '#3A3A36');
      }
    }

    // ── Furniture ──
    const plant = (x: number, f: number) => {
      px(x, f - 4, 5, 4, PAL.k);
      px(x + 1, f - 9, 1, 5, PAL.g);
      px(x + 3, f - 10, 1, 6, PAL.g);
      px(x, f - 8, 1, 2, PAL.l);
      px(x + 4, f - 7, 1, 2, PAL.l);
      px(x + 2, f - 11, 1, 2, PAL.l);
    };
    const chair = (x: number, f: number, face: number) => {
      px(x, f - 6, 4, 1, PAL.m); // seat
      px(face > 0 ? x : x + 3, f - 11, 1, 5, PAL.m); // back
      px(x + 1, f - 5, 1, 3, PAL.m);
      px(x, f - 2, 4, 1, PAL.m); // base
    };
    const desk = (x: number, f: number) => {
      px(x, f - 8, 18, 1, PAL.k); // top
      px(x + 1, f - 7, 1, 7, PAL.m);
      px(x + 16, f - 7, 1, 7, PAL.m);
      px(x + 2, f - 7, 6, 4, PAL.m); // drawers
      px(x + 9, f - 14, 7, 5, PAL.k); // monitor
      px(x + 10, f - 13, 5, 3, PAL.g);
      px(x + 12, f - 9, 1, 1, PAL.k);
      px(x + 3, f - 9, 3, 1, PAL.m); // keyboard
      chair(x + 20, f, -1);
    };

    // Top floor: a glass-walled meeting room, and the server corner.
    {
      const { top, floor: f } = storeys[0];
      const x0 = DOOR_L + 6;
      const x1 = CORE_L - 6;
      px(x0, top + 8, x1 - x0, f - top - 8, 'rgba(226,231,229,0.55)');
      px(x0, top + 8, x1 - x0, 1, MULLION);
      px(x0, top + 8, 1, f - top - 8, MULLION);
      px(x1 - 1, top + 8, 1, f - top - 8, MULLION);
      px(x0 + 16, top + 8, 1, f - top - 8, 'rgba(156,155,148,0.6)');
      px(x0 + 20, top + 13, 22, 11, PAL.k); // wall screen
      px(x0 + 21, top + 14, 20, 9, PAL.g);
      px(x0 + 23, top + 20, 3, 2, PAL.l); // a chart on it
      px(x0 + 27, top + 18, 3, 4, PAL.l);
      px(x0 + 31, top + 16, 3, 6, PAL.l);
      px(x0 + 12, f - 9, 32, 1, PAL.k); // table
      px(x0 + 14, f - 8, 1, 8, PAL.m);
      px(x0 + 41, f - 8, 1, 8, PAL.m);
      chair(x0 + 6, f, 1);
      chair(x0 + 46, f, -1);
      // Server racks, LEDs drawn live.
      for (const rx of SERVERS) {
        px(rx, f - 30, 12, 30, PAL.k);
        for (let y = f - 28; y < f - 2; y += 3) px(rx + 1, y, 10, 1, '#2A2A27');
      }
      plant(DOOR_R - 12, f);
    }

    // Middle floor: open-plan desks.
    {
      const f = storeys[1].floor;
      desk(DOOR_L + 6, f);
      desk(DOOR_L + 36, f);
      desk(CORE_R + 6, f);
      desk(CORE_R + 36, f);
    }

    // Ground floor: the lobby.
    {
      const { top, floor: f } = storeys[2];
      const rx = DOOR_L + 10;
      px(rx, f - 12, 44, 12, PAL.k); // reception counter
      px(rx, f - 12, 44, 1, '#3A3A36');
      px(rx + 2, f - 8, 40, 2, PAL.g);
      px(rx + 16, f - 17, 7, 5, PAL.k); // monitor
      px(rx + 17, f - 16, 5, 3, PAL.g);
      px(rx + 18, top + 12, 8, 8, PAL.g); // the company mark on the wall
      px(rx + 20, top + 14, 4, 4, WALL);
      px(rx + 21, top + 15, 2, 2, PAL.g);
      plant(rx + 48, f);
      const sx = CORE_R + 8;
      px(sx, f - 9, 32, 7, PAL.k); // sofa
      px(sx + 2, f - 8, 13, 3, PAL.l);
      px(sx + 17, f - 8, 13, 3, PAL.l);
      px(sx, f - 13, 3, 11, PAL.k);
      px(sx + 29, f - 13, 3, 11, PAL.k);
      px(sx + 1, f - 2, 1, 2, PAL.k);
      px(sx + 30, f - 2, 1, 2, PAL.k);
      px(sx + 36, f - 5, 12, 1, PAL.k); // coffee table
      px(sx + 37, f - 4, 1, 4, PAL.m);
      px(sx + 46, f - 4, 1, 4, PAL.m);
      plant(DOOR_R - 9, f);
    }

    // ── Stairs ──
    for (const r of RAMPS) {
      const [lo, hi] = rampSpan(r);
      if (isLanding(r)) {
        px(lo, r.y0, hi - lo, 4, PAL.k); // the half-landing slab
        px(lo, r.y0, hi - lo, 1, '#3A3A36');
        continue;
      }
      const rising = r.x1 > r.x0;
      for (let x = lo; x < hi; x++) {
        const k = Math.floor((x - lo) / 5);
        const tread = Math.round(rampY(r, lo + k * 5 + 2.5)); // tread straddles the walking line
        const under = Math.round(rampY(r, rising ? x : x + 1)) + 4;
        px(x, tread, 1, Math.max(1, under - tread), PAL.k);
        px(x, tread, 1, 1, '#3A3A36');
        px(x, Math.round(rampY(r, x)) - 10, 1, 1, PAL.m); // handrail
        if ((x - lo) % 13 === 6) px(x, Math.round(rampY(r, x)) - 9, 1, 8, PAL.w);
      }
    }

    // Lift frames, and the floor number between each pair of doors.
    for (const l of LIFTS) {
      const f = FLOORS[l.floor];
      px(l.x - 10, f - 28, 20, 28, PAL.m);
      px(l.x - 9, f - 27, 18, 27, PAL.k);
    }
    FLOORS.forEach((f, i) => drawText(g, String(3 - i), (CORE_L + CORE_R) / 2, f - 24, PAL.m));
    return c;
  }

  private drawLifts() {
    const c = this.ctx;
    for (const l of this.lifts) {
      const f = FLOORS[l.floor];
      const half = Math.round(8 * (1 - l.open));
      // Doors slide apart from the centre seam.
      c.fillStyle = STEEL;
      c.fillRect(l.x - 8, f - 26, half, 26);
      c.fillRect(l.x + 8 - half, f - 26, half, 26);
      c.fillStyle = STEEL_HI;
      if (half > 1) {
        c.fillRect(l.x - 8, f - 26, 1, 26);
        c.fillRect(l.x + 8 - half, f - 26, 1, 26);
      }
      // Call light: pine when idle, blinking rust when something's coming.
      const coming = !!l.queue && Math.floor(this.time * 8) % 2 === 0;
      c.fillStyle = coming ? PAL.r : l.queue ? PAL.k : PAL.g;
      c.fillRect(l.x - 1, f - 31, 3, 2);
    }
    // Server LEDs, flickering.
    const f = FLOORS[0];
    SERVERS.forEach((rx, k) => {
      for (let i = 0; i < 8; i++) {
        const on = Math.sin(this.time * (3 + i * 1.7) + k * 5 + i) > 0.2;
        c.fillStyle = on ? (i % 4 === 0 ? PAL.r : '#7FD39A') : '#2A2A27';
        c.fillRect(rx + 9, f - 27 + i * 3, 1, 1);
      }
    });
  }

  private draw(s: Sprite, x: number, y: number, face: number, flash = false, scale = 1) {
    const img = flash ? s.flash : face < 0 ? s.left : s.right;
    this.ctx.drawImage(img, Math.round(x), Math.round(y), s.w * scale, s.h * scale);
  }

  private render() {
    const c = this.ctx;
    const sp = this.sprites;
    // Shake shifts the whole building, so paint the uncovered edge first.
    c.fillStyle = PAL.k;
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    c.save();
    if (this.shakeT > 0) {
      const k = this.shakeK * (this.shakeT > 0.1 ? 1 : this.shakeT / 0.1);
      c.translate(Math.round(rand(-k, k)), Math.round(rand(-k, k)));
    }
    c.drawImage(this.bg, 0, 0);
    this.drawLifts();

    for (const k of this.pickups) {
      if (k.life < 2 && Math.floor(k.life * 10) % 2) continue;
      this.draw(k.kind === 'heart' ? sp.heart : sp.bolt, k.x, k.y + Math.sin(this.time * 6) * 0.8, 1);
    }

    for (const e of this.enemies) {
      const flash = e.flash > 0;
      const frame = Math.floor(e.t * (e.kind === 'flyer' ? 10 : 8)) % 2;
      if (e.kind === 'crawler') this.draw(sp.crawler[frame], e.x - 1, e.y - 1, e.dir, flash);
      else if (e.kind === 'flyer') this.draw(sp.flyer[frame], e.x - 1, e.y - 1, e.dir, flash);
      else if (e.kind === 'brute') this.draw(sp.brute[frame], e.x - 1, e.y - 1, e.dir, flash);
      else this.draw(sp.brute[frame], e.x - 2, e.y - 2, e.dir, flash, 2);
    }

    const p = this.player;
    if (p && !p.dead && !(p.inv > 0 && Math.floor(p.inv * 14) % 2)) {
      const b = sp.bot;
      const s = !p.ground ? b.jump : Math.abs(p.vx) > 8 ? (Math.floor(p.anim / 6) % 2 ? b.runA : b.runB) : b.idle;
      this.draw(s, p.x - 1, p.y - 1, p.face);
      // The gun follows the aim.
      const aim = this.aimDir(p);
      const gx = p.x + p.w / 2;
      const gy = p.y + 7;
      c.fillStyle = PAL.k;
      for (let d = 2; d <= 5; d++) c.fillRect(Math.round(gx + aim.x * d), Math.round(gy + aim.y * d), 1, 1);
      if (p.rapid > 0 && Math.floor(this.time * 8) % 2) {
        c.fillStyle = PAL.y;
        c.fillRect(Math.round(p.x + 2), Math.round(p.y - 4), 2, 1);
      }
    }

    for (const b of this.bullets) {
      c.fillStyle = PAL.r;
      c.fillRect(Math.round(b.x - 1), Math.round(b.y - 1), 2, 2);
      c.fillStyle = PAL.y;
      c.fillRect(Math.round(b.x - b.vx / BULLET * 2), Math.round(b.y - b.vy / BULLET * 2), 1, 1); // trail
    }
    for (const q of this.particles) {
      c.globalAlpha = Math.min(1, (q.life / q.max) * 1.5);
      c.fillStyle = q.color;
      c.fillRect(Math.round(q.x), Math.round(q.y), 1, 1);
    }
    c.globalAlpha = 1;
    for (const pop of this.pops) drawText(c, pop.text, pop.x, pop.y, pop.life > 0.2 || Math.floor(pop.life * 20) % 2 ? PAL.k : PAL.r);
    c.restore();
  }
}
