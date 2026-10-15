// The player: an office worker, anime-style — spiky dark hair, big eyes, white
// shirt and tie, ID on a lanyard. Five views drawn, mirrored for eight. The
// sleeves are part of the body; the hands are drawn live, floating by it, so
// they can hold a gun at any angle without arms stretching to reach it.
//
// And the guns, drawn facing east and turned to 16 aim angles with RotSprite,
// flipped when aiming left so they never hang upside down.
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
// Short sleeves ('w', a shade off the shirt) hang at the sides, ending where
// the free hand rests; in profile the near arm runs down the middle.
const TORSO: Record<View, string[]> = {
  s: ['...hhsshh...', '.whhhrrhhhw.', '.whhhrrhhhw.', '.wkhlrrhwkw.', '..khyrrhwk..', '..hwhhhhwh..', '..kkkykkkk..', '..nnnnnnnn..'],
  se: ['...hhsshh...', '.whhhhrrhhw.', '.whhhhrrhhw.', '.wkhlhrrwkw.', '..khyhrrwk..', '..hwhhhhwh..', '..kkkkykkk..', '..nnnnnnnn..'],
  e: ['...bhsshh...', '...hhhhrh...', '...hwwhrh...', '...hwwhwh...', '...hkkhwh...', '...hhhhwh...', '...kkkkyk...', '...nnnnnn...'],
  ne: ['...hhhhhh...', '.whhhhhhhhw.', '.whhhhhhwhw.', '.wkhhhhhwkw.', '..khhhhhwk..', '..hwhhhhwh..', '..kkkkkkkk..', '..nnnnnnnn..'],
  n: ['...hhhhhh...', '.whhhhhhhhw.', '.whhhhhhhhw.', '.wkwhhhhwkw.', '..kwhhhhwk..', '..hwhhhhwh..', '..kkkkkkkk..', '..nnnnnnnn..'],
};
// A four-step walk: contact, one foot lifted, contact, the other lifted.
// From the side the legs swap front and back, told apart by their shade.
const LEGS: Record<'front' | 'side', { idle: string[]; walk: string[][] }> = {
  front: {
    idle: ['..nnn..nnn..', '..nnN..Nnn..', '..kkk..kkk..'],
    walk: [
      ['..nnn..nnn..', '.nnN....Nnn.', '.kkk....kkk.'],
      ['..nnn..nnn..', '..kkk..Nnn..', '.......kkk..'],
      ['..nnn..nnn..', '.nnN....Nnn.', '.kkk....kkk.'],
      ['..nnn..nnn..', '..nnN..kkk..', '..kkk.......'],
    ],
  },
  side: {
    idle: ['...nnnnn....', '...nnnnn....', '...kkkkkk...'],
    walk: [
      ['..NNn.nnn...', '.NNN...nnn..', '.kkk...kkkk.'],
      ['...Nnnnn....', '...kkknn....', '.....kkkk...'],
      ['..nnN.NNN...', '.nnn...NNN..', '.kkk...kkkk.'],
      ['...nnnnN....', '...nnkkk....', '...kkkk.....'],
    ],
  },
};

export type PersonFrames = { idle: Sprite; blink: Sprite; walk: Sprite[] };

function frames(v: View): PersonFrames {
  const head = HEAD[v];
  const shut = head.slice();
  for (const [row, line] of BLINK[v] ?? []) shut[row] = line;
  const legs = LEGS[v === 'e' ? 'side' : 'front'];
  const make = (h: string[], l: string[]) => personSprite([...h, ...TORSO[v], ...l]);
  return { idle: make(head, legs.idle), blink: make(shut, legs.idle), walk: legs.walk.map((l) => make(head, l)) };
}

// Knocked flat: the profile, turned to lie along the floor, head first.
function fallen(): Sprite {
  const rows = [...HEAD.e.map((r, i) => (i === 4 || i === 5 ? r.replace(/e/g, 'k') : r)), ...TORSO.e, ...LEGS.side.idle];
  const turn = (c: HTMLCanvasElement) => {
    const out = document.createElement('canvas');
    out.width = c.height;
    out.height = c.width;
    const g = out.getContext('2d')!;
    g.translate(out.width, 0);
    g.rotate(Math.PI / 2);
    g.drawImage(c, 0, 0);
    return out;
  };
  const right = turn(paintRows(rows, { outline: true }));
  const left = turn(paintRows(rows, { outline: true, mirror: true }));
  return { w: right.width, h: right.height, right, left, flash: turn(paintRows(rows, { outline: true, solid: '#FFFFFF' })) };
}

export function buildPerson() {
  return { s: frames('s'), se: frames('se'), e: frames('e'), ne: frames('ne'), n: frames('n'), down: fallen() };
}
export type Person = ReturnType<typeof buildPerson>;

/** Which drawing and whether to mirror it, for eight directions (0 = east, clockwise on screen). */
export const PERSON_VIEW: [View, boolean][] = [
  ['e', false], ['se', false], ['s', false], ['se', true],
  ['e', true], ['ne', true], ['n', false], ['ne', false],
];

/** Sprite size including the outline: 14 × 21. The hands are held 9px above
 * the feet, at the bottom of the sleeves; shots fly at that height. */
export const PERSON_SHOULDER = 9;

// ── Guns ──
// Drawn pointing east, held at `grip` (where the hand goes), with the muzzle
// `muzzle` px ahead of it and, for long guns, the other hand `fore` px ahead
// on the fore-grip. No hands in the art: they're drawn live, over it.
interface GunArt {
  rows: string[];
  grip: [number, number];
  muzzle: number;
  fore?: number;
}

const GUN_ART: Record<string, GunArt> = {
  // Slide over a frame, a trigger guard, and the grip raked back.
  pistol: {
    rows: ['.kkkkkkkk.', 'kmmmmmmmmk', 'kMMMMMMMMk', 'kkMMkkkkk.', '.kMMk.k...', '.kMMkkk...', '.kkkk.....'],
    grip: [2, 4],
    muzzle: 7,
  },
  // Stubby, with a stock and a long magazine.
  smg: {
    rows: ['..kkkkkkkkk.', 'kkkmmmmmmmmk', 'kMkMMMMMMMk.', 'kkkMMkkMk...', '...kMk.Mk...', '...kkk.Mk...', '.......kk...'],
    grip: [4, 4],
    muzzle: 7,
    fore: 3,
  },
  // Wooden stock and pump, a long barrel.
  shotgun: {
    rows: ['....kkkkkkkkkkkk', 'kkkkmmmmmmmmmmmk', 'kookMMMkkoooookk', 'kookkMk..kkkkk..', '.kk.kMk.........', '....kk..........'],
    grip: [5, 4],
    muzzle: 10,
    fore: 6,
  },
  // Coils glowing down the barrel.
  rail: {
    rows: ['....kkkkkkkkkkkkk', 'kkkkmgmgmgmgmgmmk', 'kMMkMMMMkkkkkkkk.', 'kMkkMkMk.........', '.k.kMk.k.........', '...kk............'],
    grip: [4, 4],
    muzzle: 12,
    fore: 4,
  },
  // A long barrel, a brass cylinder, a curved wooden grip.
  revolver: {
    rows: ['..kkkkkkkkkk', '.kMmmmmmmmmk', '.kyyMkkkkkk.', '.koMk.k.....', 'kookkk......', 'kok.........', 'kk..........'],
    grip: [2, 4],
    muzzle: 9,
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

// Scale2x: doubles pixel art, rounding off its stairs the way an artist
// would. Outside the image counts as clear.
function scale2x(src: Uint32Array, w: number, h: number): Uint32Array {
  const out = new Uint32Array(w * h * 4);
  const w2 = w * 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = src[y * w + x];
      const a = y > 0 ? src[(y - 1) * w + x] : 0;
      const b = x < w - 1 ? src[y * w + x + 1] : 0;
      const c = x > 0 ? src[y * w + x - 1] : 0;
      const d = y < h - 1 ? src[(y + 1) * w + x] : 0;
      const o = y * 2 * w2 + x * 2;
      out[o] = c === a && c !== d && a !== b ? a : p;
      out[o + 1] = a === b && a !== c && b !== d ? b : p;
      out[o + w2] = d === c && d !== b && c !== a ? c : p;
      out[o + w2 + 1] = b === d && b !== a && d !== c ? d : p;
    }
  }
  return out;
}

// The art at 8×, through Scale2x three times: what RotSprite turns. Made
// once per gun and way up, then turned to every angle.
interface Big {
  px: Uint32Array;
  sw: number; // the art's own size
  sh: number;
}
// A palette colour as an ImageData pixel (bytes R, G, B, A; little-endian).
const pixel = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (0xff << 24) | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16);
};

// Straight from the rows: reading pixels back off a canvas stalls on the GPU.
function enlarge(art: GunArt, flipY: boolean): Big {
  const rows = flipY ? art.rows.slice().reverse() : art.rows;
  const sw = rows[0].length;
  const sh = rows.length;
  let px: Uint32Array = new Uint32Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (rows[y][x] !== '.') px[y * sw + x] = pixel(PEOPLE_PAL[rows[y][x]]);
  for (let k = 0; k < 3; k++) px = scale2x(px, sw << k, sh << k);
  return { px, sw, sh };
}

// Turn the east-facing art about its grip with RotSprite: turn the 8× art
// and take the commonest colour among nine samples in each pixel, so lines
// stay unbroken at every angle. Aiming left uses the art flipped
// top-to-bottom, so the gun stays upright.
function turnGun(art: GunArt, { px: big, sw, sh }: Big, angle: number, flipY: boolean): { c: HTMLCanvasElement; half: number } {
  const bw = sw * 8;
  const gx = art.grip[0] + 0.5;
  const gy = flipY ? sh - (art.grip[1] + 0.5) : art.grip[1] + 0.5;
  const reach = Math.ceil(Math.max(Math.hypot(gx, gy), Math.hypot(sw - gx, gy), Math.hypot(gx, sh - gy), Math.hypot(sw - gx, sh - gy)));
  const size = reach * 2 + 1;
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const g = out.getContext('2d')!;
  const img = g.createImageData(size, size);
  const px = new Uint32Array(img.data.buffer);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const seen = new Uint32Array(9);
  const count = new Uint8Array(9);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let kinds = 0;
      for (let v = -1; v <= 1; v++) {
        for (let u = -1; u <= 1; u++) {
          const dx = x + 0.5 + u / 3 - (reach + 0.5);
          const dy = y + 0.5 + v / 3 - (reach + 0.5);
          const sx = Math.floor((dx * cos - dy * sin + gx) * 8);
          const sy = Math.floor((dx * sin + dy * cos + gy) * 8);
          const col = sx < 0 || sx >= bw || sy < 0 || sy >= sh * 8 ? 0 : big[sy * bw + sx];
          let i = 0;
          while (i < kinds && seen[i] !== col) i++;
          if (i === kinds) (seen[kinds] = col), (count[kinds++] = 0);
          // The middle sample counts a little extra, to settle ties.
          count[i] += u === 0 && v === 0 ? 2 : 1;
        }
      }
      let best = 0;
      for (let i = 1; i < kinds; i++) if (count[i] > count[best]) best = i;
      px[y * size + x] = seen[best];
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
    const upright = enlarge(art, false);
    const flipped = enlarge(art, true);
    for (let k = 0; k < GUN_ANGLES; k++) {
      const a = (k / GUN_ANGLES) * Math.PI * 2;
      const flip = Math.cos(a) < -0.01;
      const t = turnGun(art, flip ? flipped : upright, a, flip);
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
