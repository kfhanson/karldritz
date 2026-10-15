// Bug Hunt — a 2.5D survival arena. One office floor seen from a three-quarter
// view; bugs come in through the lifts in the back wall and the side doors,
// round after round, each round bigger and every fifth with a boss. Round
// 10's boss, the Root Bug, smashes the floor at half health and the fight
// drops to B1, the server room below, where the run carries on until round
// 20's boss, the Daemon: beat it and the run is won. Move with WASD, aim at
// the cursor, dash out of trouble.
//
// The world is the floor plane in pixels; things with height (flyers, bullets,
// sparks) carry a z and are drawn that far up the screen, with a shadow on
// the floor. Everything is drawn back to front by its y.
// Fixed 60 Hz simulation on a 320×184 pixel canvas.
//
// This file is the game itself: rounds, the player, the bugs, the fall
// between floors, and drawing the scene. The room and its physics are in
// world.ts, each floor's look and furniture in floors/, and the quake's
// shapes in quake.ts.
import { burst, tone } from './audio';
import { buildSprites, drawText, PAL, type Sprite, type Sprites } from './sprites';
import { buildGuns, buildPerson, GUN_ANGLES, PEOPLE, PERSON_SHOULDER, PERSON_VIEW } from './people';
import { drawProp, FLOORS } from './floors';
import { BREAK, crackReach, DEPTH, FALL_G, paintCracks, SLAM, TILE_H, TILE_W, tileAt, type Faller, type Quake, type Rubble, type Tile } from './quake';
import {
  ARENA, blocked, clamp, collide, DOORS, FLOOR_TOP, FRONT, len, PROPS, prune, rand, setProps, SHADOW, SIDE, Sparks, stopsShot,
  VIEW_H, VIEW_W, WALL_TOP, type Body, type DoorSide, type Prop,
} from './world';
import { freshLoadout, liftKinds, LIFT_LABEL, makeOffer, WEAPONS, type Ctx, type Loadout, type Offer, type OfferKind } from './upgrades';

export { VIEW_H, VIEW_W };

// Who stays in a list for another tick.
const lasts = (x: { life: number }) => x.life > 0;
const alive = (e: { hp: number; life: number }) => e.hp > 0 && e.life > 0;
const spreading = (w: { r: number; max: number }) => w.r < w.max;

// The headings a bug tries, nearest first, to get round furniture.
const STEER_FAN = [0, 0.5, -0.5, 1, -1, 1.6, -1.6];

const KING_ROUND = 10;
const DAEMON_ROUND = 20; // the last round: beat its boss to win the run

// How dangerous a round's bugs are: tougher, quicker, more of them at once,
// and more flyers and brutes. It climbs twice as fast as the rounds, so a
// twenty-round run ramps up like a much longer one would.
const danger = (round: number) => Math.max(1, round * 2 - 1);

const STEP = 1 / 60;
const SPEED = 80;
const DASH_SPEED = 250;
const DASH_TIME = 0.17;
const DASH_COOL = 0.65;
const BULLET = 300;
const GUN_Z = PERSON_SHOULDER; // shots fly at shoulder height
const REACH = 4; // how far the gun hand is from the shoulder

export type Kind = 'crawler' | 'flyer' | 'brute' | 'boss' | 'king' | 'daemon';

// The big ones: they come by lift, shrug off knockback and drop a heart.
const big = (k: Kind) => k === 'boss' || k === 'king' || k === 'daemon';

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

export interface Enemy extends Body {
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
  move: Move; // a boss's attack being wound up
  rage: boolean; // the king after the fall; the Daemon overclocked
  volley: number; // the Daemon: rings of packets still to fire
}

export type Move = 'none' | 'charge' | 'slam' | 'spit' | 'summon' | 'beam' | 'packets' | 'blink' | 'fork';

// How long a boss winds up each move (quicker when enraged or overclocked).
const WIND: Record<Move, number> = { none: 0, charge: 0.6, slam: 0.8, spit: 0.5, summon: 0.6, beam: 1, packets: 0.55, blink: 0.45, fork: 0.6 };

/** The king's acid and the Daemon's packets: slow shots that hurt the player. */
interface Spit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  packet: boolean;
}

/**
 * The Daemon's beam. Aimed while it warms up (drawn as a flickering dotted
 * line), then on for a moment. Furniture that stops shots stops it too, so
 * the server racks are cover; a dash goes through it.
 */
interface Beam {
  src: Enemy;
  a: number; // heading across the floor
  on: boolean;
  t: number; // time left on
  hit: boolean; // it has already hurt the player
  ex: number; // where it ends, this tick
  ey: number;
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
  hit: Enemy[] | null; // already struck, so a piercing shot doesn't hit twice (made on its first hit)
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
  time: number; // whole seconds
}

export interface RunResult {
  score: number;
  round: number;
  best: number;
  record: boolean;
  won: boolean; // beat the Daemon
  time: number; // seconds of play: pauses and the lifts' menus don't count
}

export interface Hooks {
  hud(h: Hud): void;
  /** `dark`: the floor behind it is dark (B1), so the text should be light. */
  banner(title: string, sub?: string, dark?: boolean): void;
  over(result: RunResult): void;
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
  daemon: { r: 12, score: 5000 },
};

// One of a boss's moves, by weight, for a roll in [0, 1).
function weighted(moves: [Move, number][], roll: number): Move {
  const total = moves.reduce((a, m) => a + m[1], 0);
  let acc = 0;
  return moves.find((m) => (acc += m[1] / total) >= roll)?.[0] ?? moves[0][0];
}

// Turn heading a toward b by at most `max` radians.
function turn(a: number, b: number, max: number) {
  return a + clamp(Math.atan2(Math.sin(b - a), Math.cos(b - a)), -max, max);
}

function loadBest(): number {
  try {
    return Number(localStorage.getItem('egg-best')) || 0;
  } catch {
    return 0;
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
  private beam: Beam | null = null;
  private quake: Quake | null = null;
  private barLag = 1; // the boss bar's trailing chunk, as a fraction
  // Scratch vectors for the bugs' steering, which runs for every bug every
  // tick. Each is read straight after it's written, never kept.
  private tgt = { x: 0, y: 0 };
  private want = { x: 0, y: 0 };
  private drawList: { y: number; kind: number; ref: unknown }[] = [];
  private drawn = 0; // entries in use this frame
  private paintedAt = -Infinity;
  private frameNo = 0;
  private pickups: Pickup[] = [];
  private pops: { x: number; y: number; text: string; life: number }[] = [];
  private doors: Door[] = DOORS.map((d) => ({ ...d, charge: 0, queue: null, open: 0, hold: 0 }));
  private back = this.doors.filter((d) => d.side === 'back'); // the lifts, left to right

  private round = 0;
  private phase: 'intro' | 'fight' | 'clear' | 'lifts' | 'riding' | 'arriving' | 'won' = 'intro';
  private ticks = 0; // the run's clock, in steps of play
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
  private still = window.matchMedia('(prefers-reduced-motion: reduce)'); // live, so it follows the setting
  private deadT = 0;
  private lastHud: Hud | null = null;
  private hudAt = -Infinity;

  constructor(
    private canvas: HTMLCanvasElement,
    private hooks: Hooks,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.rooms = FLOORS.map((f) => f.paint());
    this.toFloor(0);
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
    this.ticks = 0;
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
    if (n === 0 && this.floor !== 0) this.rooms[this.floor] = FLOORS[this.floor].paint();
    this.floor = n;
    setProps(FLOORS[n].props);
    this.quake = null;
    this.spit = [];
    this.waves = [];
    this.beam = null;
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
    // Paused, or in the shop: the frame drawn as it stopped stays up.
    if (this.mode === 'paused' || this.mode === 'offer') return;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps++ < 5) {
      this.update(STEP);
      this.acc -= STEP;
    }
    if (steps > 5) this.acc = 0;
    // Behind the menu and the game-over card the room only idles, so it's
    // drawn at 30fps: half the painting, and less for the browser to
    // composite, for motion nobody is watching closely.
    if ((this.mode === 'attract' || this.mode === 'over') && now - this.paintedAt < 1000 / 30 - 4) return;
    this.paintedAt = now;
    this.render();
  };

  private update(dt: number) {
    // The clock runs from the first step to the last blow, hitstop and all.
    if (this.mode === 'play' && this.player && !this.player.dead && this.phase !== 'won') this.ticks++;
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
    prune(this.enemies, alive);
    this.updateBar(dt);
    this.pushHud();
  }

  private banner(title: string, sub?: string) {
    this.hooks.banner(title, sub, FLOORS[this.floor].dark);
  }

  // The boss with a health bar across the top: the Root Bug or the Daemon.
  private headliner(): Enemy | undefined {
    if (this.quake) return this.quake.king;
    for (const e of this.enemies) if (e.kind === 'king' || e.kind === 'daemon') return e;
    return undefined;
  }

  // The boss bar's white chunk drains after the damage, so hits read.
  private updateBar(dt: number) {
    const k = this.headliner();
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
    const sub =
      r === DAEMON_ROUND ? 'Final round'
      : r === KING_ROUND ? 'The floor is shaking'
      : boss ? 'Something big is riding the lift'
      : `${this.toSpawn.length} bugs inbound`;
    this.banner(`Round ${r}`, sub);
    [523, 659, 784].forEach((f, i) => tone(f, f, 0.12, 0.08, 'square', i * 0.11));
  }

  private roster(r: number): Kind[] {
    // The king brings its own swarm; a few stragglers come through the doors.
    if (r === DAEMON_ROUND) {
      return ['daemon', ...Array.from({ length: 14 }, (): Kind => {
        const roll = Math.random();
        return roll < 0.15 ? 'brute' : roll < 0.55 ? 'flyer' : 'crawler';
      })];
    }
    if (r === KING_ROUND) return ['king', ...Array.from({ length: 10 }, (): Kind => (Math.random() < 0.3 ? 'flyer' : 'crawler'))];
    const list: Kind[] = [];
    const n = Math.min(40, 6 + r * 2);
    const d = danger(r);
    const flyer = d >= 2 ? Math.min(0.4, 0.1 + 0.05 * d) : 0;
    const brute = d >= 4 ? Math.min(0.2, 0.04 + 0.02 * d) : 0;
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
    if (this.phase === 'won') {
      if (this.phaseT <= 0) this.gameOver(true);
      return;
    }
    if (this.phase === 'intro' && this.phaseT <= 0) this.phase = 'fight';
    else if (this.phase === 'fight') {
      const maxAlive = Math.min(18, 6 + danger(this.round));
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.toSpawn.length && this.enemies.length + this.queued() < maxAlive) {
        if (this.callDoor(this.toSpawn[0])) {
          this.toSpawn.shift();
          this.spawnT = Math.max(0.35, 1.3 - danger(this.round) * 0.08);
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
      const back = this.back;
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
      const back = this.back;
      back.forEach((d, i) => (d.open = Math.max(0, d.open - dt * (i === this.ride ? 2.2 : 4))));
      if (this.phaseT <= 0) {
        const kind = this.lifts[this.ride];
        this.mode = 'offer';
        this.hooks.offer(makeOffer(kind, this.loadout, this.chips, this.round / 5));
      }
    } else if (this.phase === 'arriving') {
      // Back down: the doors open and out it steps.
      const d = this.back[this.ride];
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
    const d = this.back[this.ride];
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
    let n = 0;
    for (const d of this.doors) if (d.queue) n++;
    return n;
  }

  // Pick an idle door, preferring ones away from the player.
  private callDoor(kind: Kind): boolean {
    const p = this.player;
    const lift = big(kind);
    let free = this.doors.filter((d) => !d.queue && (!lift || d.side === 'back'));
    if (p && free.length > 1) {
      const far = free.filter((d) => len(d.x - p.x, d.y - p.y) > 70);
      if (far.length) free = far;
    }
    if (!free.length) return false;
    const d = free[Math.floor(Math.random() * free.length)];
    d.queue = kind;
    d.charge = lift ? 1.8 : 0.9;
    if (this.mode === 'play') tone(lift ? 330 : 880, lift ? 330 : 880, 0.08, 0.04, 'sine');
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
    } else if (kind === 'daemon') {
      this.shake(6, 0.6);
      tone(1760, 220, 0.6, 0.06, 'square');
      burst(0.5, 2400, 0.3, 'bandpass');
      this.banner('The Daemon', 'Its beam stops at the server racks');
    }
  }

  private spawnAt(kind: Kind, x: number, y: number) {
    const r = danger(this.round);
    const hp = { crawler: r >= 6 ? 3 : 2, flyer: r >= 8 ? 2 : 1, brute: 8 + r, boss: 30 + r * 5, king: 60 + r * 14, daemon: 80 + r * 14 }[kind];
    const speed = {
      crawler: Math.min(66, 32 + r * 2.5),
      flyer: Math.min(64, 36 + r * 2),
      brute: Math.min(30, 18 + r),
      boss: 16,
      king: 18,
      daemon: 34,
    }[kind];
    const large = big(kind);
    this.enemies.push({
      kind, x, y, z: kind === 'flyer' ? 12 : kind === 'daemon' ? 7 : 0, vx: 0, vy: 0, vz: 0, r: STATS[kind].r, hp, max: hp, speed,
      dir: 1, flash: 0, t: Math.random() * 10, wind: 0, rush: 0, rx: 0, ry: 0, next: rand(1.5, 3),
      life: this.mode === 'play' ? Infinity : rand(9, 14), move: 'none', rage: false, volley: 0,
    });
    this.puff(x, y, large ? 26 : 6, PAL.r);
    if (large) this.shake(6, 0.5);
    if (kind === 'king' || kind === 'daemon') this.barLag = 1;
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
    const d = len(dx, dy);
    return d < 4 ? { x: p.lx, y: p.ly } : { x: dx / d, y: dy / d };
  }

  private updatePlayer(p: Player, dt: number) {
    if (p.dead) return;
    const h = this.held;
    let ix = (h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0);
    let iy = (h.has('down') ? 1 : 0) - (h.has('up') ? 1 : 0);
    const il = len(ix, iy);
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

    if (this.aimMode === 'facing' && il) (p.lx = ix), (p.ly = iy);
    const aim = this.aimDir(p);
    if (this.aimMode !== 'facing') (p.lx = aim.x), (p.ly = aim.y);
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
          dmg: w.dmg + l.dmg, pierce: w.pierce + l.pierce, bounce: w.bounce, size: w.size, color: w.color, hit: null,
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
    p.anim += len(p.vx, p.vy) * dt;

    for (const e of this.enemies) {
      if (p.inv > 0 || e.hp <= 0 || e.z > 18) continue;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const reach = p.r + e.r - 1;
      if (dx * dx + dy * dy < reach * reach) {
        const d = len(dx, dy) || 1;
        this.hurt(p, dx / d, dy / d);
      }
    }
  }

  private hurt(p: Player, nx: number, ny: number) {
    if (this.phase === 'won') return; // nothing left can touch you
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

  private gameOver(won = false) {
    const record = this.score > this.best;
    if (record) {
      this.best = this.score;
      try {
        localStorage.setItem('egg-best', String(this.score));
      } catch {}
    }
    this.mode = 'over';
    this.player = null;
    this.hooks.over({ score: this.score, round: this.round, best: this.best, record, won, time: this.ticks / 60 });
  }

  // ── Bugs ──
  private target(): { x: number; y: number } {
    const p = this.player;
    const t = this.tgt;
    if (p && !p.dead) (t.x = p.x), (t.y = p.y);
    else {
      // No one to chase: drift after a point that roams the room.
      t.x = 160 + Math.sin(this.time * 0.35) * 120;
      t.y = 110 + Math.sin(this.time * 0.53) * 50;
    }
    return t;
  }

  // Head for (tx, ty), sliding round furniture: try the straight line, then
  // fan out until a way is clear.
  private steer(e: Enemy, tx: number, ty: number, speed: number) {
    const base = Math.atan2(ty - e.y, tx - e.x);
    const look = e.r + 6;
    let a = base;
    for (const off of STEER_FAN) {
      const t = base + off * e.dir;
      if (!blocked(e.x + Math.cos(t) * look, e.y + Math.sin(t) * look, e.r)) {
        a = t;
        break;
      }
    }
    const w = this.want;
    w.x = Math.cos(a) * speed;
    w.y = Math.sin(a) * speed;
    return w;
  }

  private updateEnemy(e: Enemy, dt: number) {
    e.t += dt;
    e.flash -= dt;
    if (e.kind === 'king') return this.updateKing(e, dt);
    if (e.kind === 'daemon') return this.updateDaemon(e, dt);
    const tgt = this.target();
    const dist = len(tgt.x - e.x, tgt.y - e.y);

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
    let want = this.want;
    want.x = want.y = 0;
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
      want.x = e.rx * s;
      want.y = e.ry * s;
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
    if (len(e.x - bx, e.y - by) > 0.5 && Math.random() < 0.05) e.dir = e.dir > 0 ? -1 : 1;
  }

  // The Root Bug walks you down, then winds up one of four moves: a charge,
  // a slam that sends a shockwave along the floor, a fan of acid (only once
  // it's enraged) or a brood of bugs. Enraged, it's quicker at all of them.
  private updateKing(e: Enemy, dt: number) {
    const tgt = this.target();
    const dx = tgt.x - e.x;
    const dy = tgt.y - e.y;
    const dist = len(dx, dy) || 1;
    let want = this.want;
    want.x = want.y = 0;
    if (e.wind > 0) {
      e.wind -= dt;
      // A slam rears up first; everything else just trembles.
      e.z = e.move === 'slam' ? 14 * Math.min(1, (0.8 - e.wind) / 0.5) : 0;
      if (e.wind <= 0) this.kingMove(e);
    } else if (e.rush > 0) {
      e.rush -= dt;
      const s = e.rage ? 230 : 200;
      want.x = e.rx * s;
      want.y = e.ry * s;
      if (Math.random() < 0.5) this.dust(e.x + rand(-8, 8), e.y, 1);
      if (e.rush <= 0) e.next = e.rage ? rand(0.9, 1.6) : rand(1.4, 2.3);
    } else {
      want = this.steer(e, tgt.x, tgt.y, e.rage ? e.speed * 1.4 : e.speed);
      e.next -= dt;
      if (e.next <= 0 && this.player && !this.player.dead) {
        const roll = Math.random();
        const crowd = this.enemies.length > 9;
        e.move = weighted(
          e.rage
            ? [['charge', 0.25], ['slam', 0.3], ['spit', 0.3], ['summon', crowd ? 0 : 0.15]]
            : [['charge', 0.4], ['slam', 0.35], ['summon', crowd ? 0 : 0.25]],
          roll,
        );
        e.wind = WIND[e.move];
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
        this.spit.push({ x: e.x + Math.cos(a) * 10, y: e.y + Math.sin(a) * 6, vx: Math.cos(a) * 92, vy: Math.sin(a) * 92, life: 3, packet: false });
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

  // The Daemon keeps its distance, circling the player over the furniture,
  // and winds up one of four moves: a beam, rings of packets, a blink to the
  // far side of the room, or a fork of new bugs. Overclocked (from half
  // health) it's quicker, fires more packets, and its beam follows you.
  private updateDaemon(e: Enemy, dt: number) {
    const tgt = this.target();
    const dx = tgt.x - e.x;
    const dy = tgt.y - e.y;
    const want = this.want;
    want.x = want.y = 0;
    e.z = 7 + Math.sin(e.t * 2.2) * 2;
    if (e.volley > 0 && (e.rush -= dt) <= 0) {
      e.volley -= 1;
      e.rush = 0.32;
      this.packets(e, e.volley % 2 ? 0.5 : 0);
    }
    const b = this.beam;
    if (e.wind > 0) {
      e.wind -= dt;
      // The aim follows the player until just before it fires.
      if (e.move === 'beam' && b && e.wind > 0.3) b.a = turn(b.a, Math.atan2(dy, dx), dt * 2.5);
      if (e.wind <= 0) this.daemonMove(e);
    } else if (!b) {
      // A point on a slow circle round the player, about 80px out.
      const orbit = e.t * (e.rage ? 0.5 : 0.35) * e.dir;
      const ox = clamp(tgt.x + Math.cos(orbit) * 80, ARENA.x0 + 16, ARENA.x1 - 16) - e.x;
      const oy = clamp(tgt.y + Math.sin(orbit) * 50, ARENA.y0 + 10, ARENA.y1 - 6) - e.y;
      const d = len(ox, oy);
      if (d > 4) {
        const s = e.rage ? e.speed * 1.4 : e.speed;
        want.x = (ox / d) * s;
        want.y = (oy / d) * s;
      }
      e.next -= dt;
      if (e.next <= 0 && this.player && !this.player.dead) {
        const roll = Math.random();
        const crowd = this.enemies.length > 9;
        e.move = weighted(
          e.rage
            ? [['beam', 0.35], ['packets', 0.3], ['blink', 0.2], ['fork', crowd ? 0 : 0.15]]
            : [['beam', 0.4], ['packets', 0.35], ['blink', 0.15], ['fork', crowd ? 0 : 0.1]],
          roll,
        );
        e.wind = WIND[e.move];
        if (e.rage) e.wind *= 0.75;
        if (e.move === 'beam') {
          this.beam = { src: e, a: Math.atan2(dy, dx), on: false, t: 0, hit: false, ex: e.x, ey: e.y };
          tone(440, 880, e.wind, 0.04, 'sine');
        } else tone(e.move === 'blink' ? 1200 : 660, e.move === 'blink' ? 300 : 520, 0.2, 0.05, 'square');
      }
    }
    const k = Math.min(1, 4 * dt);
    e.vx += (want.x - e.vx) * k;
    e.vy += (want.y - e.vy) * k;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    if (Math.abs(e.vx) > 4) e.dir = e.vx < 0 ? -1 : 1;
    collide(e, false); // it floats over the furniture
  }

  private daemonMove(e: Enemy) {
    const move = e.move;
    e.move = 'none';
    e.next = e.rage ? rand(0.8, 1.4) : rand(1.3, 2.1);
    if (move === 'beam' && this.beam) {
      this.beam.on = true;
      this.beam.t = e.rage ? 1.1 : 0.55;
      this.shake(3, 0.2);
      tone(1800, 600, 0.4, 0.06, 'sawtooth');
      burst(0.3, 3000, 0.25, 'highpass');
    } else if (move === 'packets') {
      this.packets(e, 0);
      e.volley = e.rage ? 2 : 1;
      e.rush = 0.32;
    } else if (move === 'blink') {
      // Gone, and back somewhere across the room from the player.
      const p = this.player;
      let bx = e.x;
      let by = e.y;
      let far = -1;
      for (let i = 0; i < 12; i++) {
        const x = rand(ARENA.x0 + 20, ARENA.x1 - 20);
        const y = rand(ARENA.y0 + 12, ARENA.y1 - 10);
        const d = p ? len(x - p.x, y - p.y) : 0;
        if (d > far) (far = d), (bx = x), (by = y);
        if (d > 110) break;
      }
      this.puff(e.x, e.y, 14, PAL.l, e.z + 10);
      e.x = bx;
      e.y = by;
      e.vx = e.vy = 0;
      this.puff(e.x, e.y, 14, PAL.r, e.z + 10);
      e.next = 0.35; // and straight into the next move
      tone(300, 1500, 0.15, 0.05, 'square');
    } else if (move === 'fork') {
      const kinds: Kind[] = e.rage ? ['flyer', 'flyer', 'crawler', 'crawler'] : ['flyer', 'flyer', 'flyer'];
      kinds.forEach((kind, i) => {
        const a = (i / kinds.length) * Math.PI * 2 + rand(0, 1);
        const x = clamp(e.x + Math.cos(a) * 20, ARENA.x0 + 6, ARENA.x1 - 6);
        const y = clamp(e.y + Math.sin(a) * 12, ARENA.y0 + 6, ARENA.y1 - 2);
        if (kind === 'flyer' || !blocked(x, y, 4)) this.spawnAt(kind, x, y);
      });
      tone(300, 900, 0.25, 0.05, 'triangle');
    }
  }

  // A ring of packets, turned by `offset` of a step so rings interleave.
  private packets(e: Enemy, offset: number) {
    const n = e.rage ? 16 : 12;
    for (let i = 0; i < n; i++) {
      const a = ((i + offset) / n) * Math.PI * 2;
      this.spit.push({ x: e.x + Math.cos(a) * 8, y: e.y + Math.sin(a) * 5, vx: Math.cos(a) * 62, vy: Math.sin(a) * 62, life: 4, packet: true });
    }
    tone(990, 660, 0.08, 0.05, 'square');
  }

  // The beam's reach, this tick: out from the Daemon until a wall or
  // furniture that stops shots. Its first few pixels pass over whatever
  // it's floating above.
  private aimBeam(b: Beam) {
    const cx = Math.cos(b.a);
    const cy = Math.sin(b.a);
    let d = 0;
    for (; d < 400; d += 2) {
      const x = b.src.x + cx * d;
      const y = b.src.y + cy * d;
      if (x < ARENA.x0 || x > ARENA.x1 || y < FLOOR_TOP || y > FRONT || (d > 10 && stopsShot(x, y))) break;
    }
    b.ex = b.src.x + cx * d;
    b.ey = b.src.y + cy * d;
  }

  private updateBeam(b: Beam, dt: number) {
    if (b.src.hp <= 0) return void (this.beam = null);
    const p = this.player;
    // Overclocked, it sweeps after the player as it burns.
    if (b.on && b.src.rage && p) b.a = turn(b.a, Math.atan2(p.y - b.src.y, p.x - b.src.x), dt * 0.75);
    this.aimBeam(b);
    if (!b.on) return;
    b.t -= dt;
    if (b.t <= 0) return void (this.beam = null);
    if (Math.random() < 0.5) this.sparks.add(b.ex, b.ey, b.src.z + 18, rand(-40, 40), rand(-20, 20), rand(20, 60), 0.2, Math.random() < 0.5 ? PAL.y : PAL.c);
    if (!p || p.dead || p.inv > 0 || b.hit) return;
    // Distance from the player to the beam, across the floor.
    const sx = b.src.x;
    const sy = b.src.y;
    const vx = b.ex - sx;
    const vy = b.ey - sy;
    const l2 = vx * vx + vy * vy || 1;
    const u = clamp(((p.x - sx) * vx + (p.y - sy) * vy) / l2, 0, 1);
    const ox = p.x - (sx + vx * u);
    const oy = p.y - (sy + vy * u);
    if (ox * ox + oy * oy < (p.r + 1.5) ** 2) {
      b.hit = true;
      const l = Math.sqrt(l2);
      this.hurt(p, vx / l, vy / l);
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
      const prop = stopsShot(s.x, s.y);
      if (wall || prop) {
        s.life = 0;
        this.puff(s.x, s.y, 4, s.packet ? PAL.y : PAL.l, 4);
      } else if (open && len(p.x - s.x, p.y - s.y) < p.r + 2) {
        s.life = 0;
        const d = len(s.vx, s.vy) || 1;
        this.hurt(p, s.vx / d, s.vy / d);
      }
    }
    prune(this.spit, lasts);
    for (const w of this.waves) {
      w.r += w.speed * dt;
      // Seen in perspective, the ring is squashed: measure in floor space.
      if (open && !w.hit && p.z === 0) {
        const d = len(p.x - w.x, (p.y - w.y) / 0.6);
        if (Math.abs(d - w.r) < 3) {
          w.hit = true;
          const n = len(p.x - w.x, p.y - w.y) || 1;
          this.hurt(p, (p.x - w.x) / n, (p.y - w.y) / n);
        }
      }
    }
    prune(this.waves, spreading);
    if (this.beam) this.updateBeam(this.beam, dt);
  }

  // ── The fall to B1 ──
  private startQuake(king: Enemy) {
    const tiles: Tile[] = [];
    for (let y = FLOOR_TOP; y < FRONT; y += TILE_H) {
      for (let x = SIDE; x < VIEW_W - SIDE; x += TILE_W) {
        // Outward from the impact, a little ragged.
        const d = len(x + TILE_W / 2 - king.x, (y + TILE_H / 2 - king.y) / 0.6);
        tiles.push({ x, y, at: BREAK + d / 240 + rand(0, 0.16), h: 0, v: 0 });
      }
    }
    const cracks = paintCracks(king.x, king.y);
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
      collide(at, true, FLOORS[1].props);
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
      const r = crackReach(q);
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
      if (q.t < tileAt(q, b.x, b.y).at) return;
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
    setProps(FLOORS[1].props);
    this.quake = null;
    this.shake(6, 0.6);
    this.banner('B1 · Server room', 'The Root Bug is enraged');
    tone(220, 60, 0.8, 0.12, 'sawtooth');
    burst(0.5, 300, 0.4, 'lowpass');
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
        const d = len(dx, dy);
        const min = a.r + b.r;
        if (d >= min || d < 0.001) continue;
        const push = (min - d) / 2;
        const wa = big(a.kind) ? 0.1 : 1;
        const wb = big(b.kind) ? 0.1 : 1;
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
    const boss = big(e.kind);
    const heavy = e.kind === 'brute' || boss;
    const headliner = e.kind === 'king' || e.kind === 'daemon';
    e.vx += dx * (headliner ? 6 : heavy ? 20 : 110);
    e.vy += dy * (headliner ? 6 : heavy ? 20 : 110);
    burst(0.05, 3000, 0.2);
    if (this.quake) return;
    // Half its health gone in the office: it takes the floor out.
    if (e.kind === 'king' && !e.rage && this.floor === 0 && e.hp <= e.max / 2) {
      e.hp = Math.ceil(e.max / 2);
      this.startQuake(e);
      return;
    }
    if (e.kind === 'daemon' && !e.rage && e.hp > 0 && e.hp <= e.max / 2) this.overclock(e);
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
    this.hitstop = e.kind === 'daemon' ? 0.5 : e.kind === 'king' ? 0.35 : boss ? 0.2 : heavy ? 0.06 : 0.025;
    if (e.kind === 'daemon') this.win(e);
    else if (e.kind === 'king') {
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
    const worth = Math.round({ crawler: 1, flyer: 1, brute: 3, boss: 15, king: 40, daemon: 60 }[e.kind] * l.chipMult);
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

  // Half its health gone: it overclocks.
  private overclock(e: Enemy) {
    e.rage = true;
    e.flash = 0.3;
    e.next = Math.min(e.next, 1);
    this.shake(5, 0.5);
    this.puff(e.x, e.y, 24, PAL.r, e.z + 12);
    tone(220, 1760, 0.6, 0.07, 'sawtooth');
    this.banner('Overclocked', 'Now its beam follows you');
  }

  // The Daemon is down, and the run is won. Everything it was running goes
  // with it; a moment to take it in, then the result.
  private win(e: Enemy) {
    this.phase = 'won';
    this.phaseT = 3.2;
    this.beam = null;
    this.spit = [];
    this.waves = [];
    this.toSpawn = [];
    for (const d of this.doors) d.queue = null;
    for (const o of this.enemies) {
      if (o === e || o.hp <= 0) continue;
      o.hp = 0;
      this.puff(o.x, o.y, 8, PAL.k, o.z + 4);
    }
    this.puff(e.x, e.y, 40, PAL.y, e.z + 12);
    this.puff(e.x, e.y, 30, PAL.l, e.z + 12);
    [1760, 1320, 990, 660, 440].forEach((f, i) => tone(f, f * 0.5, 0.18, 0.08, 'square', i * 0.09));
    [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.2, 0.08, 'triangle', 0.9 + i * 0.12));
    this.banner('Daemon terminated', 'B1 is clear');
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
        b.hit = null;
        this.puff(b.x, b.y, 2, PAL.l, GUN_Z);
        tone(1600, 1200, 0.03, 0.03, 'triangle');
      }
      const wall = b.x < ARENA.x0 || b.x > ARENA.x1 || b.y < FLOOR_TOP || b.y > FRONT;
      const hitProp = stopsShot(b.x, b.y);
      if (wall || hitProp) {
        b.life = 0;
        this.puff(b.x, b.y, 3, PAL.m, GUN_Z);
        continue;
      }
      for (const e of this.enemies) {
        if (e.hp <= 0 || b.hit?.includes(e)) continue;
        const reach = e.r + 1 + b.size / 2;
        const dx = b.x - e.x;
        const dy = b.y - e.y;
        if (dx * dx + dy * dy < reach * reach) {
          const speed = len(b.vx, b.vy) || 1;
          this.hitEnemy(e, b.vx / speed, b.vy / speed, b.dmg);
          if (b.pierce > 0) {
            b.pierce -= 1;
            (b.hit ??= []).push(e);
          }
          else {
            b.life = 0;
            break;
          }
        }
      }
    }
    prune(this.bullets, lasts);
  }

  private updatePickups(dt: number) {
    const p = this.player;
    for (const k of this.pickups) {
      k.life -= dt;
      k.vz -= 400 * dt;
      k.z = Math.max(0, k.z + k.vz * dt);
      if (k.z === 0) k.vz = Math.abs(k.vz) > 30 ? -k.vz * 0.4 : 0;
      // Chips roll to the player once they've landed (anything does, with the magnet).
      const d = p && !p.dead ? len(p.x - k.x, p.y - k.y) : Infinity;
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
    prune(this.pickups, lasts);
  }

  private updateFx(dt: number) {
    this.sparks.update(dt);
    this.lower.update(dt);
    for (const pop of this.pops) {
      pop.life -= dt;
      pop.y -= 14 * dt;
    }
    prune(this.pops, lasts);
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
    if (this.still.matches) return;
    this.shakeK = Math.max(this.shakeT > 0 ? this.shakeK : 0, k);
    this.shakeT = Math.max(this.shakeT, t);
  }

  // Runs every tick, so it only builds a new HUD when something on it changed.
  private pushHud() {
    const p = this.player;
    const last = this.lastHud;
    // Once the run is over, the hearts stay as they ended.
    const hp = p ? Math.max(0, p.hp) : (last?.hp ?? 0);
    const rapid = !!p && p.rapid > 0;
    const mult = this.mult();
    const best = Math.max(this.best, this.score);
    const l = this.loadout;
    const time = Math.floor(this.ticks / 60);
    if (
      last && last.round === this.round && last.score === this.score && last.best === best && last.hp === hp && last.time === time &&
      last.maxHp === l.maxHp && last.chips === this.chips && last.weaponId === l.weapon && last.mult === mult && last.rapid === rapid
    ) return;
    // At most ten updates a second, except when health or the round changes.
    const now = performance.now();
    if (last && now - this.hudAt < 100 && hp === last.hp && this.round === last.round) return;
    this.hudAt = now;
    this.lastHud = {
      round: this.round, score: this.score, best, hp, maxHp: l.maxHp, chips: this.chips,
      weapon: WEAPONS[l.weapon].name, weaponId: l.weapon, mult, rapid, time,
    };
    this.hooks.hud(this.lastHud);
  }

  // ── Drawing ──
  private drawDoors(floor: number) {
    const c = this.ctx;
    const look = FLOORS[floor].doors;
    const steel = look.steel;
    for (const d of this.doors) {
      const coming = !!d.queue && Math.floor(this.time * 8) % 2 === 0;
      if (d.side === 'back') {
        const half = Math.round(8 * (1 - d.open));
        c.fillStyle = steel;
        c.fillRect(d.x - 8, FLOOR_TOP - 23, half, 23);
        c.fillRect(d.x + 8 - half, FLOOR_TOP - 23, half, 23);
        if (look.ribs && half > 2) {
          // Freight doors: ribbed.
          c.fillStyle = look.ribs;
          for (let y = FLOOR_TOP - 20; y < FLOOR_TOP - 2; y += 4) {
            c.fillRect(d.x - 8, y, half, 1);
            c.fillRect(d.x + 8 - half, y, half, 1);
          }
        }
        c.fillStyle = look.edge;
        if (half > 1) {
          c.fillRect(d.x - 8, FLOOR_TOP - 23, 1, 23);
          c.fillRect(d.x + 8 - half, FLOOR_TOP - 23, 1, 23);
        }
        const k = this.back.indexOf(d);
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
    const n = Math.max(1, Math.ceil(len(to.x - from.x, to.y - from.y)));
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
    // Blinking out: it flickers before it goes.
    if (e.move === 'blink' && e.wind > 0 && Math.floor(e.t * 30) % 2) return;
    const s =
      e.kind === 'crawler' ? sp.crawler[frame]
      : e.kind === 'flyer' ? sp.flyer[frame]
      : e.kind === 'king' ? (e.rage ? sp.kingRage : sp.king)[frame]
      : e.kind === 'daemon' ? (e.rage ? sp.daemonHot : sp.daemon)[frame]
      : sp.brute[frame];
    const scale = big(e.kind) ? 2 : 1;
    this.draw(s, e.x - (s.w * scale) / 2, e.y - e.z - s.h * scale + 1, e.dir, flash, scale);
  }

  private drawPlayer(p: Player) {
    const c = this.ctx;
    // Body: one of eight views, from where it's looking.
    const oct = (Math.round(Math.atan2(p.ly, p.lx) / (Math.PI / 4)) + 8) % 8;
    const [view, mirror] = PERSON_VIEW[oct];
    const f = this.person[view];
    const moving = len(p.vx, p.vy) > 10;
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
        const r = crackReach(q);
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
    if (this.beam?.on) this.beamLine(this.beam, 0, 1, 'rgba(17,17,17,0.2)');

    // Then everything with height, back to front. One reused list of plain
    // entries rather than a fresh array of closures every frame: less garbage
    // for the collector in long, busy rounds.
    const list = this.drawList;
    this.drawn = 0;
    for (const pr of PROPS) this.put(pr.y + pr.h, 0, pr);
    for (const k of this.pickups) if (!(k.life < 2 && Math.floor(k.life * 10) % 2)) this.put(k.y, 1, k);
    for (const e of this.enemies) this.put(e.y, 2, e);
    if (p && !(p.inv > 0 && p.dash <= 0 && Math.floor(p.inv * 14) % 2)) this.put(p.y, 3, p);
    const n = this.drawn;
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
      if (it.kind === 0) drawProp(this.ctx, it.ref as Prop, this.time);
      else if (it.kind === 1) this.drawPickup(it.ref as Pickup);
      else if (it.kind === 2) this.drawEnemy(it.ref as Enemy);
      else this.drawPlayer(it.ref as Player);
    }

    // Shots and sparks on top.
    for (const b of this.bullets) {
      const sy = b.y - GUN_Z;
      const sp2 = len(b.vx, b.vy) || 1;
      const h = Math.floor(b.size / 2);
      c.fillStyle = b.color;
      c.fillRect(Math.round(b.x - h), Math.round(sy - h), b.size, b.size);
      c.fillStyle = PAL.y;
      const tail = b.size >= 3 ? 5 : 2; // the laser leaves a longer streak
      for (let t = 1; t <= tail; t += b.size >= 3 ? 1 : tail) {
        c.fillRect(Math.round(b.x - (b.vx / sp2) * (t + h)), Math.round(sy - (b.vy / sp2) * (t + h)), 1, 1);
      }
    }
    if (this.beam) this.drawBeam(this.beam);
    for (const s of this.spit) {
      if (s.packet) {
        // A packet: a square of brass, outlined, blinking white.
        const x = Math.round(s.x);
        const y = Math.round(s.y - 8);
        c.fillStyle = PAL.k;
        c.fillRect(x - 2, y - 2, 5, 5);
        c.fillStyle = Math.floor(s.life * 12) % 2 ? PAL.y : '#FFFFFF';
        c.fillRect(x - 1, y - 1, 3, 3);
        continue;
      }
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

  private put(y: number, kind: number, ref: unknown) {
    const list = this.drawList;
    const it = list[this.drawn] ?? (list[this.drawn] = { y: 0, kind: 0, ref: null });
    it.y = y;
    it.kind = kind;
    it.ref = ref;
    this.drawn++;
  }

  // The Daemon's beam, at the height of its eye. Warming up, a dotted line
  // that flickers; on, a white-hot core in a band of rust.
  private drawBeam(b: Beam) {
    const h = b.src.z + 18;
    if (!b.on) {
      if (Math.floor(this.time * 16) % 2) this.beamLine(b, h, 1, PAL.r, 4);
      return;
    }
    this.beamLine(b, h, 3, b.src.rage ? PAL.r : PAL.y);
    this.beamLine(b, h, 1, '#FFFFFF');
  }

  // A line of `w`-pixel squares from the Daemon to the beam's end, `h` up;
  // every `gap`-th pixel only, for a dotted line. One path, one fill.
  private beamLine(b: Beam, h: number, w: number, color: string, gap = 1) {
    const c = this.ctx;
    const sx = b.src.x;
    const sy = b.src.y - h;
    const dx = b.ex - b.src.x;
    const dy = b.ey - b.src.y;
    const n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
    const o = Math.floor(w / 2);
    c.beginPath();
    for (let i = 6; i <= n; i += gap) {
      c.rect(Math.round(sx + (dx * i) / n) - o, Math.round(sy + (dy * i) / n) - o, w, w);
    }
    c.fillStyle = color;
    c.fill();
  }

  // A shockwave: a pixel ellipse along the floor, brass (rust in a rage)
  // with an ink ring inside.
  private drawWave(w: Wave) {
    this.ring(w, w.r, this.headliner()?.rage ? PAL.r : PAL.y);
    this.ring(w, w.r - 2, PAL.k);
  }

  // All of a ring's pixels go in one path and one fill.
  private ring(w: Wave, r: number, color: string) {
    if (r <= 0) return;
    const c = this.ctx;
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
      lx = x;
      ly = y;
    }
    c.fillStyle = color;
    c.fill();
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
      const things: { y: number; draw: () => void }[] = FLOORS[1].props.map((pr) => ({ y: pr.y + pr.h, draw: () => drawProp(this.ctx, pr, this.time) }));
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

    const fallen = (x: number, y: number) => tileAt(q, x, y).h;
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
      if (h > 0) sinking(pr.y + pr.h, h, () => drawProp(this.ctx, pr, this.time), pr.x + pr.w / 2);
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
    for (const pr of PROPS) if (fallen(pr.x + pr.w / 2, pr.y + pr.h / 2) === 0) standing.push({ y: pr.y + pr.h, draw: () => drawProp(this.ctx, pr, this.time) });
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

  // Across the top: the headliner's health, under a crown for the Root Bug or
  // horns for the Daemon. A notch marks half, where the king takes the floor
  // out and the Daemon overclocks.
  private drawBossBar() {
    const k = this.headliner();
    if (!k || this.mode === 'attract') return;
    const c = this.ctx;
    const w = 120;
    const x = Math.round((VIEW_W - w) / 2);
    const y = 2;
    const f = clamp(k.hp / k.max, 0, 1);
    const icon = k.kind === 'daemon' ? this.sprites.horns : this.sprites.crown;
    c.drawImage(icon, x - 10, y - 1);
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
