// Bug Hunt — a one-room survival platformer. Monsters pour out of rifts in the
// ceiling, round after round; each round is bigger, every fifth has a boss.
// Fixed 60 Hz simulation on a 320×184 pixel canvas.
import { burst, tone } from './audio';
import { buildSprites, drawText, PAL, type Sprite, type Sprites } from './sprites';

export const VIEW_W = 320;
export const VIEW_H = 184;
const T = 8; // tile size

// '#' solid, '=' one-way platform (jump up through it, stand on it)
const MAP = [
  '########################################',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#....======..................======....#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#............==============............#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#=========....................=========#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#.........=======......=======.........#',
  '#......................................#',
  '#......................................#',
  '########################################',
];
const COLS = MAP[0].length;
const ROWS = MAP.length;

const STEP = 1 / 60;
const MAX_HP = 5;
const RUN = 92;
const JUMP = 290;
const RIFT_XS = [68, 160, 252];

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

interface Rift {
  x: number;
  charge: number;
  queue: Kind | null;
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

  private player: Player | null = null;
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private pickups: Pickup[] = [];
  private pops: { x: number; y: number; text: string; life: number }[] = [];
  private rifts: Rift[] = RIFT_XS.map((x) => ({ x, charge: 0, queue: null }));

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
    this.particles = [];
    this.pops = [];
    this.rifts.forEach((r) => ((r.charge = 0), (r.queue = null)));
    this.score = 0;
    this.combo = 0;
    this.comboT = 0;
    this.deadT = 0;
    this.held.clear();
    this.player = {
      x: 157, y: 176 - 11, w: 6, h: 11, vx: 0, vy: 0, ground: false, wall: false,
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

  /** Back to the idle room behind the menu. */
  attract() {
    this.mode = 'attract';
    this.player = null;
    this.enemies = [];
    this.bullets = [];
    this.pickups = [];
    this.rifts.forEach((r) => ((r.charge = 0), (r.queue = null)));
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

    this.updateRifts(dt);
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
    this.hooks.banner(`Round ${r}`, boss ? 'Something big is coming through' : `${this.toSpawn.length} incoming`);
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
        if (this.openRift(this.toSpawn[0])) {
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
    // Keep the room alive behind the menu: a few monsters wander about.
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.enemies.length + this.queued() < 5) {
      this.openRift(Math.random() < 0.35 ? 'flyer' : 'crawler');
      this.spawnT = rand(1.5, 3);
    }
    for (const e of this.enemies) e.life -= dt;
  }

  private queued() {
    return this.rifts.filter((r) => r.queue).length;
  }

  private openRift(kind: Kind): boolean {
    const free = this.rifts.filter((r) => !r.queue);
    if (!free.length) return false;
    const r = free[Math.floor(Math.random() * free.length)];
    r.queue = kind;
    r.charge = kind === 'boss' ? 1.6 : 0.7;
    if (this.mode === 'play') tone(kind === 'boss' ? 60 : 110, kind === 'boss' ? 30 : 220, kind === 'boss' ? 1.2 : 0.35, 0.05, 'sawtooth');
    return true;
  }

  private updateRifts(dt: number) {
    for (const r of this.rifts) {
      if (!r.queue) continue;
      r.charge -= dt;
      if (r.charge > 0) continue;
      this.spawn(r.queue, r.x);
      r.queue = null;
    }
  }

  private spawn(kind: Kind, x: number) {
    const s = STATS[kind];
    const r = Math.max(1, this.round);
    const hp = { crawler: r >= 6 ? 3 : 2, flyer: r >= 8 ? 2 : 1, brute: 8 + r, boss: 30 + r * 5 }[kind];
    const speed = {
      crawler: Math.min(72, 34 + r * 2.5),
      flyer: Math.min(70, 38 + r * 2),
      brute: Math.min(34, 20 + r),
      boss: 18,
    }[kind];
    this.enemies.push({
      kind, x: x - s.w / 2, y: 9, w: s.w, h: s.h, vx: 0, vy: kind === 'flyer' ? 30 : 0,
      ground: false, wall: false, hp, dir: Math.random() < 0.5 ? 1 : -1, speed, flash: 0,
      t: Math.random() * 10, hop: rand(0.8, 2), life: this.mode === 'play' ? Infinity : rand(9, 14),
    });
    this.puff(x, 10, kind === 'boss' ? 26 : 8, PAL.r);
    if (kind === 'boss') this.shake(6, 0.5);
  }

  // ── Player ──
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

    p.coyote = p.ground ? 0.09 : p.coyote - dt;
    p.buffer = this.jumpPressed ? 0.11 : p.buffer - dt;
    if (p.buffer > 0 && p.coyote > 0) {
      if (h.has('down') && this.onOneWay(p)) {
        p.drop = 0.22; // drop through the platform
        p.y += 1;
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
    this.move(p, dt, p.drop > 0);
    if (!wasGround && p.ground && fallSpeed > 160) {
      this.dust(p.x + p.w / 2, p.y + p.h, 5);
      burst(0.04, 500, 0.12, 'lowpass');
    }

    p.cool -= dt;
    if (h.has('fire') && p.cool <= 0) {
      p.cool = p.rapid > 0 ? 0.08 : 0.17;
      const bx = p.face > 0 ? p.x + p.w + 1 : p.x - 1;
      this.bullets.push({ x: bx, y: p.y + 7, vx: p.face * 300 + p.vx * 0.3, life: 1 });
      p.vx -= p.face * 14; // a little recoil
      this.particles.push({ x: bx, y: p.y + 7, vx: p.face * 30, vy: 0, life: 0.06, max: 0.06, color: PAL.y, grav: 0 });
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
    p.vy = -200;
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

  private onOneWay(b: Body) {
    const r = Math.floor((b.y + b.h + 1) / T);
    let any = false;
    for (let c = Math.floor(b.x / T); c <= Math.floor((b.x + b.w - 0.01) / T); c++) {
      const t = tile(c, r);
      if (t === '#') return false;
      if (t === '=') any = true;
    }
    return any;
  }

  // Axis-separated tile collision. Speeds stay under one tile per step, so
  // nothing tunnels.
  private move(b: Body, dt: number, dropping = false) {
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
        const t = tile(c, r);
        if (t === '#' || (t === '=' && !dropping && prevBottom <= r * T + 0.01)) {
          b.y = r * T - b.h;
          b.vy = 0;
          b.ground = true;
        }
      }
    } else if (b.vy < 0) {
      const r = Math.floor(b.y / T);
      for (let c = c0; c <= c1; c++) if (tile(c, r) === '#') (b.y = (r + 1) * T), (b.vy = 0);
    }
  }

  // ── Monsters ──
  private target(): { x: number; y: number } {
    const p = this.player;
    if (p && !p.dead) return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
    // No one to chase: drift after a point that roams the room.
    return { x: 160 + Math.sin(this.time * 0.35) * 130, y: 110 + Math.sin(this.time * 0.53) * 60 };
  }

  private updateEnemy(e: Enemy, dt: number) {
    e.t += dt;
    e.flash -= dt;
    const tgt = this.target();
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;

    if (e.kind === 'flyer') {
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

    // Walkers: head for the target when it's on about the same level,
    // otherwise keep going and let the platforms sort it out.
    if (e.ground) {
      const dx = tgt.x - cx;
      if (Math.abs(tgt.y - cy) < 30 && Math.abs(dx) > 6) e.dir = dx < 0 ? -1 : 1;
      e.hop -= dt;
      if (e.hop <= 0) {
        e.hop = rand(1, 2.2);
        if (tgt.y < e.y - 14 && Math.random() < 0.65) e.vy = e.kind === 'crawler' ? -270 : e.kind === 'boss' ? -300 : -240;
      }
    }
    const want = e.dir * e.speed;
    e.vx += (want - e.vx) * Math.min(1, (e.ground ? 8 : 2) * dt);
    e.vy = Math.min(330, e.vy + 1100 * dt);
    this.move(e, dt);
    if (e.wall) e.dir = e.dir > 0 ? -1 : 1;
  }

  private hitEnemy(e: Enemy, dir: number) {
    e.hp -= 1;
    e.flash = 0.07;
    const heavy = e.kind === 'brute' || e.kind === 'boss';
    e.vx += dir * (heavy ? 18 : 90);
    if (e.kind === 'crawler') e.vy = Math.min(e.vy, -70);
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
      this.pickups.push({ kind, x: cx - 3, y: cy - 3, w: 7, h: 6, vx: 0, vy: -120, ground: false, wall: false, life: 9 });
    }
  }

  private mult() {
    return Math.min(5, 1 + Math.floor(this.combo / 4));
  }

  // ── Shots, pickups, effects ──
  private updateBullets(dt: number) {
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.life -= dt;
      if (tile(Math.floor(b.x / T), Math.floor(b.y / T)) === '#') {
        b.life = 0;
        this.puff(b.x, b.y, 3, PAL.m);
        continue;
      }
      const box = { x: b.x - 2, y: b.y - 1, w: 4, h: 2 };
      for (const e of this.enemies) {
        if (e.hp > 0 && overlap(box, e)) {
          this.hitEnemy(e, Math.sign(b.vx));
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

  // ── Drawing ──
  private paintRoom(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = VIEW_W;
    c.height = VIEW_H;
    const g = c.getContext('2d')!;
    g.fillStyle = PAL.c;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    // Dot grid, like the paper the rest of the site is printed on.
    g.fillStyle = PAL.w;
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if ((x + y) % 2 === 0) g.fillRect(x * T + 4, y * T + 4, 1, 1);

    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        const t = MAP[r][col];
        const x = col * T;
        const y = r * T;
        if (t === '#') {
          g.fillStyle = PAL.k;
          g.fillRect(x, y, T, T);
          if (tile(col, r - 1) !== '#' && r > 0) {
            g.fillStyle = '#3A3A36';
            g.fillRect(x, y, T, 1);
          }
        } else if (t === '=') {
          g.fillStyle = PAL.k;
          g.fillRect(x, y, T, 3);
          g.fillStyle = '#3A3A36';
          g.fillRect(x, y, T, 1);
          g.fillStyle = PAL.m;
          g.fillRect(x + 1, y + 3, 1, 1);
          g.fillRect(x + 5, y + 3, 1, 1);
        }
      }
    }
    // Rift housings in the ceiling.
    for (const rx of RIFT_XS) {
      g.fillStyle = PAL.c;
      g.fillRect(rx - 7, 5, 14, 3);
      g.fillStyle = PAL.m;
      g.fillRect(rx - 8, 4, 1, 4);
      g.fillRect(rx + 7, 4, 1, 4);
    }
    return c;
  }

  private draw(s: Sprite, x: number, y: number, face: number, flash = false, scale = 1) {
    const img = flash ? s.flash : face < 0 ? s.left : s.right;
    this.ctx.drawImage(img, Math.round(x), Math.round(y), s.w * scale, s.h * scale);
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

    for (const r of this.rifts) {
      if (!r.queue) continue;
      const total = r.queue === 'boss' ? 1.6 : 0.7;
      const p = 1 - Math.max(0, r.charge) / total;
      const w = Math.round(4 + p * (r.queue === 'boss' ? 26 : 10));
      c.fillStyle = PAL.k;
      c.fillRect(r.x - w / 2, 5, w, 3 + Math.round(p * 2));
      c.fillStyle = PAL.r;
      for (let i = 0; i < 4; i++) c.fillRect(Math.round(r.x + rand(-w / 2, w / 2)), Math.round(rand(6, 9 + p * 4)), 1, 1);
    }

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
      if (p.rapid > 0 && Math.floor(this.time * 8) % 2) {
        c.fillStyle = PAL.y;
        c.fillRect(Math.round(p.x + 2), Math.round(p.y - 4), 2, 1);
      }
    }

    c.fillStyle = PAL.g;
    for (const b of this.bullets) {
      c.fillRect(Math.round(b.x - 2), Math.round(b.y - 1), 4, 2);
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
