// The player: an office worker, anime-style — spiky dark hair, big eyes, white
// shirt and tie, ID on a lanyard. Five views drawn, mirrored for eight. Arms
// are drawn live (so they can reach for a gun); the body is armless.
//
// And the guns, drawn facing east and turned to 16 aim angles, flipped when
// aiming left so they never hang upside down.
import type { Sprite } from './sprites';

const PEOPLE_PAL: Record<string, string> = {
  k: '#1B1B1F', // outline, belt, shoes
  b: '#2A2320', // hair
  B: '#4B3B33', // hair highlight
  s: '#F2CDA9', // skin
  S: '#DDAE8C', // skin shade
  e: '#3E5F8A', // iris
  h: '#FFFFFF', // shirt
  w: '#DCDDE2', // shirt shade
  r: '#B4432C', // tie
  n: '#2E3442', // trousers
  N: '#232833', // trousers shade
  y: '#D9A441', // ID badge, brass
  l: '#2E4D3A', // lanyard, pine
  p: '#EBA59C', // blush
  m: '#8A8A90', // metal
  M: '#46464E', // dark metal
  o: '#8A5A3B', // wood
  g: '#5E8A6C', // rail-gun glow
};

/** Paint rows, optionally with a 1px outline around the whole silhouette. */
function paintRows(rows: string[], { mirror = false, outline = false, solid }: { mirror?: boolean; outline?: boolean; solid?: string } = {}) {
  const pad = outline ? 1 : 0;
  const h = rows.length;
  const w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w + pad * 2;
  c.height = h + pad * 2;
  const g = c.getContext('2d')!;
  const on = (x: number, y: number) => y >= 0 && y < h && x >= 0 && x < w && rows[y][x] !== '.';
  const px = (x: number, y: number, col: string) => {
    g.fillStyle = col;
    g.fillRect((mirror ? w - 1 - x : x) + pad, y + pad, 1, 1);
  };
  if (outline) {
    for (let y = -1; y <= h; y++) {
      for (let x = -1; x <= w; x++) {
        if (on(x, y)) continue;
        if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) px(x, y, solid ?? PEOPLE_PAL.k);
      }
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) px(x, y, solid ?? PEOPLE_PAL[rows[y][x]] ?? '#f0f');
  return c;
}

function personSprite(rows: string[]): Sprite {
  return {
    w: rows[0].length + 2,
    h: rows.length + 2,
    right: paintRows(rows, { outline: true }),
    left: paintRows(rows, { outline: true, mirror: true }),
    flash: paintRows(rows, { outline: true, solid: '#FFFFFF' }),
  };
}

type View = 's' | 'se' | 'e' | 'ne' | 'n';

const HEAD: Record<View, string[]> = {
  s: [
    '...bbbbbb...',
    '..bBBbbbbb..',
    '.bbbbbbbbbb.',
    '.bbsbbsbbsb.',
    '.bskksskksb.',
    '.bsehssehsb.',
    '.bspssSspsb.',
    '..bSssssSb..',
  ],
  se: [
    '...bbbbbb...',
    '..bBBbbbbb..',
    '.bbbbbbbbbb.',
    '.bbbsbbsbsb.',
    '.bbskksskss.',
    '.bbsehssess.',
    '.bbspssSsps.',
    '..bSssssS...',
  ],
  e: [
    '...bbbbb....',
    '..bBBbbbb...',
    '.bbbbbbbbb..',
    '.bbbbbsbsb..',
    '.bbbbssskss.',
    '.bbbbsssess.',
    '.bbbSsssps..',
    '..bbSssS....',
  ],
  ne: [
    '...bbbbbb...',
    '..bBBbbbbb..',
    '.bbbbBbbbbb.',
    '.bbbbbbbbbb.',
    '.bbbbbbbbsb.',
    '.bbbbbbbbss.',
    '.bbbbbbbbs..',
    '..bbbbbbbs..',
  ],
  n: [
    '...bbbbbb...',
    '..bBBbbbbb..',
    '.bbbbBbbbbb.',
    '.bbbbbbbbbb.',
    '.bbbbbbbbbb.',
    '.bbbbbbbbbb.',
    '.bbbbbbbbbb.',
    '..bbbbbbbb..',
  ],
};
const BLINK: Partial<Record<View, [number, string][]>> = {
  s: [[4, '.bssssssssb.'], [5, '.bskksskksb.']],
  se: [[4, '.bbssssssss.'], [5, '.bbskksskss.']],
  e: [[4, '.bbbbssssss.'], [5, '.bbbbssskss.']],
};
const TORSO: Record<View, string[]> = {
  s: ['...hhsshh...', '..hhhrrhhh..', '..hhhrrhhh..', '..hlhrrhwh..', '..hyhrrhwh..', '..hwhhhhwh..', '..kkkkkkkk..', '..nnnnnnnn..'],
  se: ['...hhsshh...', '..hhhhrrhh..', '..hhhhrrhh..', '..hlhhrrwh..', '..hyhhrrwh..', '..hwhhhhwh..', '..kkkkkkkk..', '..nnnnnnnn..'],
  e: ['...bhsshh...', '...hhhhrh...', '...hhhhrh...', '...hhhhwh...', '...hhhhwh...', '...hhhhwh...', '...kkkkkk...', '...nnnnnn...'],
  ne: ['...hhsshh...', '..hhhhhhhh..', '..hhhhhhwh..', '..hhhhhhwh..', '..hwhhhhwh..', '..hwhhhhwh..', '..kkkkkkkk..', '..nnnnnnnn..'],
  n: ['...hhsshh...', '..hhhhhhhh..', '..hhhhhhhh..', '..hwhhhhwh..', '..hwhhhhwh..', '..hwhhhhwh..', '..kkkkkkkk..', '..nnnnnnnn..'],
};
const LEGS: Record<'front' | 'side', { idle: string[]; a: string[]; b: string[] }> = {
  front: {
    idle: ['..nnn..nnn..', '..nnN..Nnn..', '..kkk..kkk..'],
    a: ['..nnn..nnn..', '.nnn....nnn.', '.kkk....kkk.'],
    b: ['...nnnnnn...', '...nn..nn...', '...kk..kk...'],
  },
  side: {
    idle: ['...nnnnn....', '...nnnnn....', '...kkkkkk...'],
    a: ['..nnn.nnn...', '.nnn...nnn..', '.kkk...kkkk.'],
    b: ['...nnnnn....', '....nnn.....', '....kkkk....'],
  },
};

export type PersonFrames = { idle: Sprite; a: Sprite; b: Sprite; blink: Sprite };

function frames(v: View): PersonFrames {
  const head = HEAD[v];
  const shut = head.slice();
  for (const [row, line] of BLINK[v] ?? []) shut[row] = line;
  const legs = LEGS[v === 'e' ? 'side' : 'front'];
  const make = (h: string[], l: string[]) => personSprite([...h, ...TORSO[v], ...l]);
  return { idle: make(head, legs.idle), a: make(head, legs.a), b: make(head, legs.b), blink: make(shut, legs.idle) };
}

export function buildPerson() {
  return { s: frames('s'), se: frames('se'), e: frames('e'), ne: frames('ne'), n: frames('n') };
}
export type Person = ReturnType<typeof buildPerson>;

/** Which drawing and whether to mirror it, for eight directions (0 = east, clockwise on screen). */
export const PERSON_VIEW: [View, boolean][] = [
  ['e', false], ['se', false], ['s', false], ['se', true],
  ['e', true], ['ne', true], ['n', false], ['ne', false],
];

/** Sprite size including the outline: 14 × 21. Shoulders sit 8px above the feet. */
export const PERSON_SHOULDER = 8;

// ── Guns ──
// Drawn pointing east, held at `grip` (where the hand is, in pixel-centre
// coordinates), with the muzzle `muzzle` px ahead of it and, for long guns,
// the other hand on the `fore`-grip.
interface GunArt {
  rows: string[];
  grip: [number, number];
  muzzle: number;
  fore?: number;
}

const GUN_ART: Record<string, GunArt> = {
  pistol: {
    rows: ['.kkkkkkk.', '.kmmmmmmk', '.kMMMMkk.', '.ssk.k...', '.ss......'],
    grip: [2, 4],
    muzzle: 7,
  },
  smg: {
    rows: ['..kkkkkkk..', '.kmmmmmmmkk', 'kkMMMMMMk..', 'k.sskk.k...', '..ss.k.....', '.....k.....'],
    grip: [3, 4],
    muzzle: 8,
    fore: 4,
  },
  shotgun: {
    rows: ['....kkkkkkkkkkk', 'kkkkmmmmmmmmmmk', 'kookMMMkkooook.', 'kook.ss....kk..', '.kk..ss........'],
    grip: [6, 4],
    muzzle: 9,
    fore: 5,
  },
  rail: {
    rows: ['....kkkkkkkkkkkk', 'kkkkmgmgmgmgmgmk', 'kMMkMMMMkkkkkkk.', 'kMk.ss.k........', '.k..ss..........'],
    grip: [5, 4],
    muzzle: 11,
    fore: 5,
  },
  revolver: {
    rows: ['..kkkkkkkk', '.kMmmmmmmk', 'kkyyMkkkk.', '.ssk......', '.ss.......'],
    grip: [2, 4],
    muzzle: 8,
  },
};

export const GUN_ANGLES = 16;

export interface Gun {
  frames: HTMLCanvasElement[]; // by angle, each centred on the grip
  half: number; // half the frame size
  muzzle: number;
  fore?: number;
  icon: HTMLCanvasElement;
}

// Turn the east-facing art about its grip, nearest-pixel. Aiming left uses the
// art flipped top-to-bottom first, so the gun stays upright.
function turnGun(art: GunArt, angle: number, flipY: boolean): { c: HTMLCanvasElement; half: number } {
  const src = paintRows(art.rows);
  const sw = src.width;
  const sh = src.height;
  const sd = src.getContext('2d')!.getImageData(0, 0, sw, sh).data;
  const gx = art.grip[0] + 0.5;
  const gy = flipY ? sh - (art.grip[1] + 0.5) : art.grip[1] + 0.5;
  const reach = Math.ceil(Math.max(Math.hypot(gx, gy), Math.hypot(sw - gx, gy), Math.hypot(gx, sh - gy), Math.hypot(sw - gx, sh - gy)));
  const size = reach * 2 + 1;
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const g = out.getContext('2d')!;
  const img = g.createImageData(size, size);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - (reach + 0.5);
      const dy = y + 0.5 - (reach + 0.5);
      const sx = Math.floor(dx * cos - dy * sin + gx);
      let sy = Math.floor(dx * sin + dy * cos + gy);
      if (sx < 0 || sx >= sw || sy < 0 || sy >= sh) continue;
      if (flipY) sy = sh - 1 - sy;
      const i = (sy * sw + sx) * 4;
      if (sd[i + 3] === 0) continue;
      const o = (y * size + x) * 4;
      img.data[o] = sd[i];
      img.data[o + 1] = sd[i + 1];
      img.data[o + 2] = sd[i + 2];
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return { c: out, half: reach + 0.5 };
}

export function buildGuns(): Record<string, Gun> {
  const out: Record<string, Gun> = {};
  for (const [id, art] of Object.entries(GUN_ART)) {
    const frames: HTMLCanvasElement[] = [];
    let half = 0;
    for (let k = 0; k < GUN_ANGLES; k++) {
      const a = (k / GUN_ANGLES) * Math.PI * 2;
      const t = turnGun(art, a, Math.cos(a) < -0.01);
      frames.push(t.c);
      half = t.half;
    }
    out[id] = { frames, half, muzzle: art.muzzle, fore: art.fore, icon: gunIcon(id) };
  }
  return out;
}

/** The gun as a HUD icon (no hand). */
export function gunIcon(id: string): HTMLCanvasElement {
  const art = GUN_ART[id] ?? GUN_ART.pistol;
  return paintRows(art.rows.map((r) => r.replace(/s/g, '.')));
}

export const PEOPLE = PEOPLE_PAL;
