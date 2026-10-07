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
    crawler: [sprite([...CRAWLER, CRAWLER_LEGS[0]]), sprite([...CRAWLER, CRAWLER_LEGS[1]])],
    flyer: [sprite(FLYER_UP), sprite(FLYER_DOWN)],
    brute: BRUTE_LEGS.map((legs) => sprite([...BRUTE, ...legs])),
    heart: sprite(HEART),
    chip: sprite(['.yy.', 'ywyy', 'yyyy', '.yy.']),
    // Signs over the lifts after a boss.
    signs: {
      shop: sprite(['.yyy.', 'yykyy', 'ykyyy', 'yykyy', 'yyyky', 'yykyy', '.yyy.']),
      perk: sprite(['...y...', '..yyy..', 'yyyyyyy', '.yyyyy.', '..yyy..', '.yy.yy.', 'y.....y']),
      weapon: sprite(['..k....', '.kck...', 'kcckkkk', 'kcccccc', 'kcwkkkk', '.kkk...']),
      repair: sprite(['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...']),
    },
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
  '-': '000000111000000',
};

/**
 * A row of pixel art for the HUD: optional icon, then 3×5 digits, at 1px per
 * pixel (CSS scales it up with crisp edges). Icon and digits share a baseline.
 */
export function pixelLine(text: string, icon?: HTMLCanvasElement, color = PAL.k): HTMLCanvasElement {
  const glyphW = text.length ? text.length * 4 - 1 : 0;
  const gap = icon && text ? 2 : 0;
  const h = Math.max(5, icon?.height ?? 0);
  const c = document.createElement('canvas');
  c.width = Math.max(1, (icon?.width ?? 0) + gap + glyphW);
  c.height = h;
  const g = c.getContext('2d')!;
  if (icon) g.drawImage(icon, 0, h - icon.height);
  drawText(g, text, (icon?.width ?? 0) + gap + glyphW / 2, h - 5, color);
  return c;
}

// The HUD's coin, a little bigger than the one on the floor.
export const HUD_COIN = (): HTMLCanvasElement =>
  paint(['.kkk.', 'kyyyk', 'kywyk', 'kyyyk', '.kkk.']);


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
