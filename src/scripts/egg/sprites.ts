// Pixel sprites, drawn as text. Each character is one pixel; '.' is clear.
// Colours come from the site palette plus one rust accent for the monsters.

export const PAL: Record<string, string> = {
  k: '#111111', // ink
  c: '#F6F5F1', // canvas cream
  w: '#E5E2DA', // wire
  m: '#6B6B66', // muted ink
  g: '#2E4D3A', // pine
  l: '#5E8A6C', // light pine
  r: '#C4532F', // rust
  y: '#D9A441', // brass
  h: '#FFFFFF', // highlight
};

export interface Sprite {
  w: number;
  h: number;
  right: HTMLCanvasElement;
  left: HTMLCanvasElement;
  flash: HTMLCanvasElement; // white silhouette, for hit flashes
}

function paint(rows: string[], color?: string, mirror = false): HTMLCanvasElement {
  const h = rows.length;
  const w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.' || ch === undefined) continue;
      ctx.fillStyle = color ?? PAL[ch];
      ctx.fillRect(mirror ? w - 1 - x : x, y, 1, 1);
    }
  });
  return c;
}

function sprite(rows: string[]): Sprite {
  return {
    w: rows[0].length,
    h: rows.length,
    right: paint(rows),
    left: paint(rows, undefined, true),
    flash: paint(rows, '#FFFFFF'),
  };
}

// ── Player: a little robot, drawn from five angles ──
// Big round head with a screen for a face, antenna, stubby body. The other
// three angles are mirrors (the sprite's `left`). 13 × 14.
type Dir5 = 's' | 'se' | 'e' | 'ne' | 'n';

const HEAD: Record<Dir5, string[]> = {
  s: [
    '......y......',
    '......k......',
    '...kkkkkkk...',
    '..kccccccck..',
    '..kccccccck..',
    '..kckccckck..',
    '..kckccckck..',
    '..krcckccrk..',
    '..kwcccccwk..',
    '...kkkkkkk...',
  ],
  se: [
    '.....y.......',
    '.....k.......',
    '...kkkkkkk...',
    '..kwcccccck..',
    '..kwcccccck..',
    '..kwckcckck..',
    '..kwckcckck..',
    '..kwrcckcrk..',
    '..kwwccccwk..',
    '...kkkkkkk...',
  ],
  e: [
    '.....y.......',
    '.....k.......',
    '...kkkkkkk...',
    '..kwwccccck..',
    '..kwmccccck..',
    '..kwmccckck..',
    '..kwmccckck..',
    '..kwccrcckk..',
    '..kwwccccwk..',
    '...kkkkkkk...',
  ],
  ne: [
    '.......y.....',
    '.......k.....',
    '...kkkkkkk...',
    '..kccccccwk..',
    '..kcmcmccwk..',
    '..kcccccckk..',
    '..kcmcmcckk..',
    '..kccccccwk..',
    '..kwccccwwk..',
    '...kkkkkkk...',
  ],
  n: [
    '......y......',
    '......k......',
    '...kkkkkkk...',
    '..kccccccck..',
    '..kcwcccwck..',
    '..kccccccck..',
    '..kcmmmmmck..',
    '..kccccccck..',
    '..kwcccccwk..',
    '...kkkkkkk...',
  ],
};
// Eyes shut: half as tall.
const BLINK: Partial<Record<Dir5, [number, string][]>> = {
  s: [[5, '..kccccccck..']],
  se: [[5, '..kwcccccck..']],
  e: [[5, '..kwmccccck..']],
};
const TORSO: Record<Dir5, string[]> = {
  s: ['....kgggk....', '....kglgk....', '....kgggk....'],
  se: ['....kgggk....', '....kgglk....', '....kgggk....'],
  e: ['....kgggk....', '....kgglk....', '....kgggk....'],
  ne: ['....kgygk....', '....kgygk....', '....kgggk....'],
  n: ['....kgygk....', '....kgygk....', '....kgggk....'],
};
const FEET = {
  idle: ['....kk.kk....'],
  a: ['...kk...kk...'],
  b: ['.....kkk.....'],
};

export type BotFrames = { idle: Sprite; a: Sprite; b: Sprite; blink: Sprite };

function botFrames(d: Dir5): BotFrames {
  const head = HEAD[d];
  const shut = head.slice();
  for (const [row, line] of BLINK[d] ?? []) shut[row] = line;
  const build = (h: string[], feet: string[]) => sprite([...h, ...TORSO[d], ...feet]);
  return { idle: build(head, FEET.idle), a: build(head, FEET.a), b: build(head, FEET.b), blink: build(shut, FEET.idle) };
}

/** Which drawing and whether to mirror it, for eight directions (0 = east, clockwise on screen). */
export const BOT_VIEW: [Dir5, boolean][] = [
  ['e', false], ['se', false], ['s', false], ['se', true],
  ['e', true], ['ne', true], ['n', false], ['ne', false],
];

// ── The finger-gun hand ──
// Drawn by hand pointing east and south-east, with the thumb cocked up; the
// other six directions are those turned a quarter or mirrored. 11 × 11, the
// fist near the middle so it turns about itself.
const HAND_E = [
  '...........',
  '...........',
  '..kk.......',
  '.kcck......',
  '.kccckkkkk.',
  '.kcccccccck',
  '.kcwckkkkk.',
  '.kwwwk.....',
  '..kkk......',
  '...........',
  '...........',
];
const HAND_SE = [
  '...k.......',
  '..kck......',
  '.kkckk.....',
  '.kccck.....',
  '.kcccck....',
  '.kwcccck...',
  '..kwkccck..',
  '...k.kccck.',
  '......kcck.',
  '.......kk..',
  '...........',
];
const turnCW = (r: string[]) => r.map((_, y) => r.map((row) => row[y]).reverse().join(''));
const turnCCW = (r: string[]) => turnCW(turnCW(turnCW(r)));
const flip = (r: string[]) => r.map((row) => [...row].reverse().join(''));

export const HAND_ANGLES = 8;
export function buildHands(): HTMLCanvasElement[] {
  // 0 = east, clockwise on screen.
  const rows = [
    HAND_E,
    HAND_SE,
    turnCW(HAND_E),
    flip(HAND_SE),
    flip(HAND_E),
    flip(turnCCW(HAND_SE)),
    flip(turnCCW(HAND_E)),
    turnCCW(HAND_SE),
  ];
  return rows.map((r) => paint(r));
}

// The other hand, just a mitten.
const MITTEN = ['.kkk.', 'kccck', 'kcwck', '.kkk.'];

// ── Monsters ──
const CRAWLER = [
  '.k......k.',
  '..k....k..',
  '..kkkkkk..',
  '.kkrkkrkk.',
  'kkkkkkkkkk',
  '.kkkkkkkk.',
];
const CRAWLER_LEGS = ['.k.k..k.k.', 'k.k....k.k'];

const FLYER_UP = [
  'r.......r',
  'rr.....rr',
  'rrrkkkrrr',
  '.rkckckr.',
  '..kkkkk..',
  '...k.k...',
];
const FLYER_DOWN = [
  '.........',
  '...kkk...',
  'rrkckckrr',
  'rrrkkkrrr',
  'rr.k.k.rr',
  'r.......r',
];

const BRUTE = [
  'k............k',
  'kk..........kk',
  '.kkkkkkkkkkkk.',
  '.kkkkkkkkkkkk.',
  '.kkrrkkkkrrkk.',
  '.kkrrkkkkrrkk.',
  '.kkkkkkkkkkkk.',
  '.kkcckcckcckk.',
  '.kkkkkkkkkkkk.',
  '..kkkkkkkkkk..',
  '..kkk....kkk..',
];
const BRUTE_LEGS = [
  ['..kk......kk..', '.kkk......kkk.'],
  ['...kk....kk...', '..kkk....kkk..'],
];

const HEART = ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'];
const BOLT = ['...yy', '..yy.', '.yyyy', '..yy.', '.yy..', 'yy...'];

export function buildSprites() {
  return {
    bot: { s: botFrames('s'), se: botFrames('se'), e: botFrames('e'), ne: botFrames('ne'), n: botFrames('n') },
    hands: buildHands(),
    mitten: sprite(MITTEN),
    crawler: [sprite([...CRAWLER, CRAWLER_LEGS[0]]), sprite([...CRAWLER, CRAWLER_LEGS[1]])],
    flyer: [sprite(FLYER_UP), sprite(FLYER_DOWN)],
    brute: BRUTE_LEGS.map((legs) => sprite([...BRUTE, ...legs])),
    heart: sprite(HEART),
    bolt: sprite(BOLT),
  };
}

export type Sprites = ReturnType<typeof buildSprites>;

// ── 3×5 digits for score pop-ups ──
const GLYPHS: Record<string, string> = {
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '111001111100111',
  '3': '111001111001111',
  '4': '101101111001001',
  '5': '111100111001111',
  '6': '111100111101111',
  '7': '111001010010010',
  '8': '111101111101111',
  '9': '111101111001111',
  '+': '000010111010000',
  x: '000101010101000',
};

export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  let cx = Math.round(x - (text.length * 4 - 1) / 2);
  const cy = Math.round(y);
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (g) {
      for (let i = 0; i < 15; i++) if (g[i] === '1') ctx.fillRect(cx + (i % 3), cy + Math.floor(i / 3), 1, 1);
    }
    cx += 4;
  }
}
