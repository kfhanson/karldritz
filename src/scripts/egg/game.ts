// Bug Hunt — survival in a three-storey office. Bugs ride the elevators in,
// round after round; each round is bigger, every fifth has a boss. Hallways
// are joined by stairwells, and the player aims with the mouse.
// Fixed 60 Hz simulation on a 320×184 pixel canvas.
import { burst, tone } from './audio';
import { buildSprites, drawText, PAL, type Sprite, type Sprites } from './sprites';

export const VIEW_W = 320;
export const VIEW_H = 184;
const T = 8; // tile size

// Cross-section of the building. '#' is wall or floor slab; the gaps in the
// slabs are stairwells.
const MAP = [
  '########################################',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '####################.....###############',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '##########.....##########.....##########',
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

// Stair flights: (x0, y0) is the foot, (x1, y1) the head. Bodies walk onto a
// flight from its foot or drop onto it through the stairwell, and pass under
// it otherwise.
interface Ramp {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const RAMPS: Ramp[] = [
  { x0: 40, y0: 176, x1: 120, y1: 112 },
  { x0: 280, y0: 176, x1: 200, y1: 112 },
  { x0: 130, y0: 112, x1: 200, y1: 56 },
];

// Elevator doors, by centre x and storey.
const LIFTS = [
  { x: 32, floor: 0 },
  { x: 288, floor: 0 },
  { x: 32, floor: 1 },
  { x: 288, floor: 1 },
];

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

export type Action = 'left' | 'right' | 'up' | 'down' | 'fire';

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
      x: 157, y: 176 - 11, w: 6, h: 11, vx: 0, vy: 0, ground: false, wall: false, ramp: null,
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
    if (a === 'up' && !this.held.has('up')) this.jumpPressed = true;
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
    const aim = this.aimDir(p);
    if (this.aimMode !== 'facing' && Math.abs(aim.x) > 0.05) p.face = aim.x < 0 ? -1 : 1;

    p.coyote = p.ground ? 0.09 : p.coyote - dt;
    p.buffer = this.jumpPressed ? 0.11 : p.buffer - dt;
    if (p.buffer > 0 && p.coyote > 0) {
      if (h.has('down') && p.ramp) {
        p.drop = 0.25; // step off the side of the stairs
      } else {
        p.vy = -JUMP;
        this.dust(p.x + p.w / 2, p.y + p.h, 4);
        tone(380, 760, 0.09, 0.07, 'square');
      }
      p.buffer = 0;
      p.coyote = 0;
    }
    // Short hop when the button is let go early; heavier on the way down.
    const g = p.vy < 0 && h.has('up') ? 980 : 1700;
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
    if (b.vx > 0) {
      const c = Math.floor((b.x + b.w - 0.01) / T);
      for (let r = r0; r <= r1; r++) if (tile(c, r) === '#') (b.x = c * T - b.w), (b.vx = 0), (b.wall = true);
    } else if (b.vx < 0) {
      const c = Math.floor(b.x / T);
      for (let r = r0; r <= r1; r++) if (tile(c, r) === '#') (b.x = (c + 1) * T), (b.vx = 0), (b.wall = true);
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

    // Stairs act like a one-way slope: land on them from above, walk onto
    // them from the foot, and stick to them walking down.
    const was = b.ramp;
    b.ramp = null;
    if (!stairs || b.vy < 0) return;
    const cx = b.x + b.w / 2;
    for (const r of RAMPS) {
      const [lo, hi] = rampSpan(r);
      if (cx < lo || cx > hi) continue;
      const sy = rampY(r, cx);
      const bottom = b.y + b.h;
      if (prevBottom <= sy + 3 && bottom >= sy - (was === r ? 5 : 0)) {
        b.y = sy - b.h;
        b.vy = 0;
        b.ground = true;
        b.ramp = r;
        return;
      }
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

    // Walkers: chase on the same floor, otherwise head for the stairs that
    // lead toward the target. Bosses are too big for the stairwells.
    if (e.ground) {
      const mine = floorOf(e.y + e.h);
      const theirs = floorOf(tgt.feet);
      const dx = tgt.x - cx;
      if (e.ramp) {
        if (Math.abs(tgt.y - cy) < 20 && Math.abs(dx) > 6) e.dir = dx < 0 ? -1 : 1;
      } else if (theirs === mine || e.kind === 'boss') {
        if (Math.abs(dx) > 6) e.dir = dx < 0 ? -1 : 1;
      } else {
        const up = theirs < mine;
        let best: Ramp | null = null;
        let bestD = Infinity;
        for (const r of RAMPS) {
          const entry = up ? r.x0 : r.x1;
          if (floorOf(up ? r.y0 : r.y1) !== mine) continue;
          const d = Math.abs(entry - cx);
          if (d < bestD) [best, bestD] = [r, d];
        }
        if (best) {
          const entry = up ? best.x0 : best.x1;
          if (Math.abs(entry - cx) > 3) e.dir = entry < cx ? -1 : 1;
          else e.dir = (up ? best.x1 - best.x0 : best.x0 - best.x1) < 0 ? -1 : 1;
        }
      }
      e.hop -= dt;
      if (e.kind === 'crawler' && e.hop <= 0) {
        e.hop = rand(1.2, 2.4);
        if (theirs === mine && Math.abs(dx) < 50 && Math.random() < 0.5) e.vy = -180;
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

    px(0, 0, VIEW_W, VIEW_H, WALL);
    const storeys = [
      { top: 8, floor: 56 },
      { top: 64, floor: 112 },
      { top: 120, floor: 176 },
    ];
    storeys.forEach(({ top, floor }, si) => {
      const wy = top + 6;
      const wh = floor - top - 15;
      // Floor-to-ceiling-ish glazing between the elevator lobbies.
      px(52, wy, 216, wh, GLASS);
      for (let x = 52; x < 268; x++) {
        const h = Math.round(skyline[x] * (0.55 + si * 0.25));
        px(x, wy + wh - h, 1, h, SKYLINE);
        if (x % 3 === 0 && h > 6 && (x * 7 + si) % 5 === 0) px(x, wy + wh - h + 3, 1, 1, WALL); // lit windows
      }
      for (let k = 0; k < 9; k++) {
        const x0 = 58 + k * 24 + (si * 7) % 11;
        for (let d = 0; d < 8; d++) if (x0 + d < 266) px(x0 + d, wy + 2 + d * 2, 1, 2, 'rgba(255,255,255,0.55)'); // reflections
      }
      for (let x = 52; x <= 268; x += 24) px(x, wy, 1, wh, MULLION);
      px(52, wy, 217, 1, MULLION);
      px(52, wy + wh, 217, 1, MULLION);
      px(52, wy + wh + 1, 217, 1, PAL.w); // sill

      // Ceiling lights.
      for (let x = 20; x < 300; x += 40) {
        px(x, top, 12, 1, LIGHT);
        px(x - 2, top + 1, 16, 1, 'rgba(255,244,214,0.5)');
      }
      // Skirting.
      px(8, floor - 2, 304, 1, PAL.w);
    });

    // Slabs and walls.
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        if (MAP[r][col] !== '#') continue;
        px(col * T, r * T, T, T, PAL.k);
        if (r > 0 && tile(col, r - 1) !== '#') px(col * T, r * T, T, 1, '#3A3A36');
      }
    }

    // Furniture: desks with monitors, chairs, plants. Kept clear of the stairs
    // and the lifts so the play space reads cleanly.
    const desk = (x: number, f: number) => {
      px(x, f - 7, 16, 1, PAL.k); // top
      px(x + 1, f - 6, 1, 6, PAL.m);
      px(x + 14, f - 6, 1, 6, PAL.m);
      px(x + 5, f - 12, 6, 4, PAL.k); // monitor
      px(x + 6, f - 11, 4, 2, PAL.g);
      px(x + 7, f - 8, 2, 1, PAL.k);
      px(x + 18, f - 6, 3, 1, PAL.m); // chair
      px(x + 20, f - 10, 1, 4, PAL.m);
      px(x + 19, f - 2, 1, 2, PAL.m);
    };
    const plant = (x: number, f: number) => {
      px(x, f - 4, 5, 4, PAL.k);
      px(x + 1, f - 9, 1, 5, PAL.g);
      px(x + 3, f - 10, 1, 6, PAL.g);
      px(x, f - 8, 1, 2, PAL.l);
      px(x + 4, f - 7, 1, 2, PAL.l);
      px(x + 2, f - 11, 1, 2, PAL.l);
    };
    desk(60, 56);
    desk(232, 56);
    plant(150, 56);
    desk(248, 112);
    plant(60, 112);
    plant(302, 112);
    desk(130, 176);
    plant(14, 176);
    plant(301, 176);

    // Stairs: a solid stepped stringer under the walking line, with a handrail.
    for (const r of RAMPS) {
      const [lo, hi] = rampSpan(r);
      const rising = r.x1 > r.x0;
      for (let x = lo; x < hi; x++) {
        const k = Math.floor((x - lo) / 5);
        const tread = Math.round(rampY(r, lo + k * 5 + 2.5)); // tread straddles the walking line
        const under = Math.round(rampY(r, rising ? x : x + 1)) + 4;
        px(x, tread, 1, Math.max(1, under - tread), PAL.k);
        px(x, tread, 1, 1, '#3A3A36');
        px(x, Math.round(rampY(r, x)) - 10, 1, 1, PAL.m); // rail
        if ((x - lo) % 16 === 4) px(x, Math.round(rampY(r, x)) - 9, 1, 8, PAL.w);
      }
    }

    // Lift frames, call lights and floor numbers.
    for (const l of LIFTS) {
      const f = FLOORS[l.floor];
      px(l.x - 10, f - 28, 20, 28, PAL.m);
      px(l.x - 9, f - 27, 18, 27, PAL.k);
      drawText(g, String(3 - l.floor), l.x + 14, f - 26, PAL.m);
    }
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
