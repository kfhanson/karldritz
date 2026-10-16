// The office tower, 10F down to the ground floor: one floor a round. Every
// floor is the same building — glass and steel, the lifts, two pillars — with
// its own fit-out: open plan, cubicles, meeting rooms, a lounge, an IT floor,
// and the lobby at the bottom. Each has its own tiles or carpet, a colour on
// the wall and its number by the lifts; the higher the floor, the further
// down the city outside sits in the windows.
import { drawText, PAL } from '../sprites';
import { DOORS, FLOOR_TOP, FRONT, prop, SIDE, VIEW_H, VIEW_W, WALL_TOP, type Prop } from '../world';
import type { Floor, PropDraw } from '.';

const STEEL = '#BDBBB3';
const STEEL_HI = '#D6D4CD';
const GLASS = '#E2E7E5';
const SKYLINE = '#CDD4D0';
const MULLION = '#9C9B94';
const BLUE = '#3E5F8A';

// What's underfoot and on the walls.
interface Look {
  wall: string;
  a: string; // floor, alternate tiles
  b: string;
  grout: string;
  under: 'tile' | 'carpet' | 'marble';
  accent: string; // the band along the wall, the number plate
}

const PALE: Omit<Look, 'accent'> = { wall: '#F1EFE9', a: '#ECEAE3', b: '#E7E4DC', grout: '#DDD9D0', under: 'tile' };
const SAND: Omit<Look, 'accent'> = { wall: '#F3EEE6', a: '#EDE5D8', b: '#E8DFD0', grout: '#DCD2C1', under: 'tile' };
const SLATE: Omit<Look, 'accent'> = { wall: '#EEF0EF', a: '#D9DEDF', b: '#D3D9DA', grout: '#C9D0D1', under: 'carpet' };
const SAGE: Omit<Look, 'accent'> = { wall: '#F0F1EC', a: '#D9E0D6', b: '#D3DBD0', grout: '#C8D1C5', under: 'carpet' };
const MARBLE: Omit<Look, 'accent'> = { wall: '#F2EFE8', a: '#F5F3EE', b: '#EAE6DD', grout: '#D6D1C6', under: 'marble' };

type Plan = 'open' | 'cubicles' | 'meeting' | 'lounge' | 'it' | 'lobby';

// The pillars stand on every floor, over B1's columns. The landings in front
// of the lifts and the side doors are kept clear.
const PILLARS = () => [prop('pillar', 84, 92, 12, 7, 46, true), prop('pillar', 224, 92, 12, 7, 46, true)];

const PLANS: Record<Plan, () => Prop[]> = {
  open: () => [
    ...PILLARS(),
    prop('desk', 34, 64, 30, 9, 8),
    prop('desk', 256, 64, 30, 9, 8),
    prop('desk', 40, 140, 30, 9, 8),
    prop('desk', 250, 140, 30, 9, 8),
    prop('rack', 146, 154, 28, 8, 30, true),
    prop('plant', 120, 60, 6, 4, 14),
    prop('plant', 194, 60, 6, 4, 14),
    prop('plant', 20, 104, 6, 4, 14),
    prop('plant', 294, 104, 6, 4, 14),
  ],
  cubicles: () => [
    ...PILLARS(),
    prop('desk', 22, 60, 28, 9, 8),
    prop('desk', 52, 60, 28, 9, 8),
    prop('desk', 240, 60, 28, 9, 8),
    prop('desk', 270, 60, 28, 9, 8),
    prop('desk', 30, 146, 28, 9, 8),
    prop('desk', 60, 146, 28, 9, 8),
    prop('desk', 232, 146, 28, 9, 8),
    prop('desk', 262, 146, 28, 9, 8),
    prop('cabinet', 148, 158, 24, 7, 18, true),
    prop('plant', 20, 104, 6, 4, 14),
  ],
  meeting: () => [
    ...PILLARS(),
    prop('table', 28, 138, 46, 12, 7),
    prop('table', 246, 138, 46, 12, 7),
    prop('copier', 24, 58, 18, 9, 14, true),
    prop('cabinet', 256, 58, 36, 7, 18, true),
    prop('vending', 150, 150, 18, 8, 28, true),
    prop('cooler', 176, 156, 6, 4, 16),
    prop('plant', 120, 60, 6, 4, 14),
    prop('plant', 194, 60, 6, 4, 14),
    prop('plant', 294, 104, 6, 4, 14),
  ],
  lounge: () => [
    ...PILLARS(),
    prop('sofa', 28, 60, 32, 9, 9),
    prop('sofa', 260, 60, 32, 9, 9),
    prop('table', 136, 142, 48, 10, 6),
    prop('vending', 24, 140, 18, 8, 28, true),
    prop('vending', 44, 140, 18, 8, 28, true),
    prop('cooler', 286, 150, 6, 4, 16),
    prop('plant', 120, 60, 6, 4, 14),
    prop('plant', 194, 60, 6, 4, 14),
    prop('plant', 296, 104, 6, 4, 14),
  ],
  it: () => [
    ...PILLARS(),
    prop('rack', 24, 62, 28, 8, 30, true),
    prop('rack', 268, 62, 28, 8, 30, true),
    prop('desk', 40, 140, 30, 9, 8),
    prop('desk', 250, 140, 30, 9, 8),
    prop('cabinet', 134, 158, 24, 7, 18, true),
    prop('copier', 162, 156, 18, 9, 14, true),
    prop('plant', 20, 104, 6, 4, 14),
    prop('plant', 294, 104, 6, 4, 14),
  ],
  lobby: () => [
    ...PILLARS(),
    prop('reception', 124, 146, 72, 10, 12, true),
    prop('bench', 28, 64, 34, 6, 6),
    prop('bench', 258, 64, 34, 6, 6),
    prop('bench', 36, 150, 34, 6, 6),
    prop('bench', 250, 150, 34, 6, 6),
    prop('plant', 120, 58, 6, 4, 14),
    prop('plant', 194, 58, 6, 4, 14),
    prop('plant', 20, 104, 6, 4, 14),
    prop('plant', 294, 104, 6, 4, 14),
  ],
};

// Where each plan's rug goes, if the floor has one: [x, y, w, h].
const RUGS: Partial<Record<Plan, [number, number, number, number]>> = {
  open: [118, 86, 84, 48],
  meeting: [32, 130, 38, 28],
  lounge: [124, 120, 72, 46],
  lobby: [130, 70, 60, 50],
};

interface Level {
  name: string; // on the HUD
  title: string; // on the banner
  plan: Plan;
  look: Look;
  rug?: [string, string]; // fill and edge
  blinds?: boolean;
}

// Top down: round 1 is on 10F, round 10 on the ground floor.
const LEVELS: Level[] = [
  { name: '10F', title: 'Floor 10', plan: 'open', look: { ...PALE, accent: PAL.g }, rug: ['#D9E0DA', '#C9D2CB'] },
  { name: '9F', title: 'Floor 9', plan: 'cubicles', look: { ...SAND, accent: PAL.r }, blinds: true },
  { name: '8F', title: 'Floor 8', plan: 'meeting', look: { ...SLATE, accent: BLUE }, rug: ['#C5CED1', '#B4BEC2'] },
  { name: '7F', title: 'Floor 7', plan: 'lounge', look: { ...PALE, accent: PAL.y }, rug: ['#E6D9C2', '#D6C6AA'] },
  { name: '6F', title: 'Floor 6', plan: 'it', look: { ...SAGE, accent: PAL.g }, blinds: true },
  { name: '5F', title: 'Floor 5', plan: 'open', look: { ...SAND, accent: BLUE }, rug: ['#D7DDE3', '#C6CED6'] },
  { name: '4F', title: 'Floor 4', plan: 'cubicles', look: { ...SLATE, accent: PAL.r } },
  { name: '3F', title: 'Floor 3', plan: 'meeting', look: { ...SAGE, accent: PAL.y }, rug: ['#E9DFC9', '#D9CCB0'], blinds: true },
  { name: '2F', title: 'Floor 2', plan: 'lounge', look: { ...SAND, accent: PAL.g }, rug: ['#D2DDD3', '#C0CEC2'] },
  { name: 'G', title: 'Ground floor', plan: 'lobby', look: { ...MARBLE, accent: PAL.y }, rug: ['#C9B48A', '#B39C6E'] },
];

// The floor number on a plate between the left and middle lifts, twice size.
function plate(g: CanvasRenderingContext2D, text: string, accent: string) {
  const w = text.length * 8 + 4;
  const x = 136 - Math.round(w / 2);
  const y = WALL_TOP + 7;
  g.fillStyle = PAL.k;
  g.fillRect(x, y, w, 15);
  g.fillStyle = accent;
  g.fillRect(x, y + 13, w, 2);
  const t = document.createElement('canvas');
  t.width = text.length * 4;
  t.height = 5;
  drawText(t.getContext('2d')!, text, t.width / 2 - 0.5, 0, PAL.c);
  g.imageSmoothingEnabled = false;
  g.drawImage(t, x + 3, y + 2, t.width * 2, 10);
}

// `n` floors down from the top.
function paintOffice(lv: Level, n: number): HTMLCanvasElement {
  const { look } = lv;
  const c = document.createElement('canvas');
  c.width = VIEW_W;
  c.height = VIEW_H;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  const inner = VIEW_W - SIDE * 2;
  const ground = lv.plan === 'lobby';

  px(0, 0, VIEW_W, VIEW_H, PAL.k);

  // Back wall.
  px(SIDE, WALL_TOP, inner, FLOOR_TOP - WALL_TOP, look.wall);
  px(SIDE, WALL_TOP, inner, 1, '#3A3A36');
  // The city: the higher the floor, the lower the rooftops sit in the glass.
  // From the lobby, the street: trees in front of the buildings opposite.
  const low = n * 1.1;
  const skyline: number[] = [];
  for (let x = 0; x < VIEW_W; ) {
    const w = 5 + Math.floor(Math.random() * 12);
    const h = Math.round(ground ? 14 + Math.random() * 6 : 4 + low + Math.random() * 12);
    for (let k = 0; k < w; k++) skyline.push(h);
    x += w;
  }
  // Windows either side of the lift lobby.
  for (const [x0, x1] of [[SIDE + 6, 96], [224, VIEW_W - SIDE - 6]]) {
    const wy = WALL_TOP + 5;
    const wh = 20;
    px(x0, wy, x1 - x0, wh, GLASS);
    for (let x = x0; x < x1; x++) {
      const h = Math.min(wh, skyline[x]);
      px(x, wy + wh - h, 1, h, SKYLINE);
      if (x % 3 === 0 && (x * 7) % 5 === 0) px(x, wy + wh - h + 2, 1, 1, look.wall);
    }
    if (ground) {
      // Street trees and the kerb.
      for (let x = x0 + 4; x < x1 - 4; x += 16) {
        px(x, wy + wh - 9, 7, 5, '#A9BFAF');
        px(x + 1, wy + wh - 10, 5, 1, '#A9BFAF');
        px(x + 3, wy + wh - 4, 1, 3, '#9C9B94');
      }
      px(x0, wy + wh - 1, x1 - x0, 1, '#B9B7AF');
    }
    for (let x = x0 + 4; x < x1 - 6; x += 19) for (let d = 0; d < 6; d++) px(x + d, wy + 2 + d * 2, 1, 2, 'rgba(255,255,255,0.55)');
    if (lv.blinds) {
      // Blinds part-way down.
      for (let y = wy + 1; y < wy + 8; y += 2) px(x0, y, x1 - x0, 1, '#D6D3CB');
      px(x0, wy + 8, x1 - x0, 1, '#BDBAB2');
    }
    for (let x = x0; x <= x1; x += 14) px(Math.min(x, x1), wy, 1, wh, MULLION);
    px(x0, wy, x1 - x0 + 1, 1, MULLION);
    px(x0, wy + wh, x1 - x0 + 1, 1, MULLION);
  }
  // Lift lobby panelling and frames.
  px(96, WALL_TOP + 1, 128, FLOOR_TOP - WALL_TOP - 1, ground ? '#E6E1D6' : '#ECEAE4');
  for (const d of DOORS) {
    if (d.side !== 'back') continue;
    px(d.x - 10, FLOOR_TOP - 25, 20, 25, ground ? '#B8913F' : PAL.m);
    px(d.x - 9, FLOOR_TOP - 24, 18, 24, PAL.k);
  }
  plate(g, lv.name === 'G' ? 'G' : lv.name.replace('F', ''), look.accent);
  decor(px, lv);
  // Ceiling lights along the wall head, and the floor's colour in a band.
  for (let x = SIDE + 14; x < VIEW_W - SIDE - 14; x += 34) px(x, WALL_TOP + 1, 12, 1, '#FFF4D6');
  px(SIDE, FLOOR_TOP - 5, 86, 2, look.accent);
  px(224, FLOOR_TOP - 5, VIEW_W - SIDE - 224, 2, look.accent);
  px(SIDE, FLOOR_TOP - 2, inner, 2, '#DAD7CF'); // skirting

  // Floor.
  if (look.under === 'marble') {
    // Big stone slabs, laid diagonally in two tones, with veins.
    px(SIDE, FLOOR_TOP, inner, FRONT - FLOOR_TOP, look.a);
    for (let y = FLOOR_TOP; y < FRONT; y++) {
      // In runs along each row: a pixel at a time was 40,000 calls.
      g.fillStyle = look.b;
      let from = -1;
      for (let x = SIDE; x <= VIEW_W - SIDE; x++) {
        const u = Math.floor((x - SIDE + (y - FLOOR_TOP) * 1.6) / 24);
        const v = Math.floor((x - SIDE - (y - FLOOR_TOP) * 1.6 + 400) / 24);
        const on = x < VIEW_W - SIDE && (u + v) % 2 === 1;
        if (on && from < 0) from = x;
        else if (!on && from >= 0) (g.fillRect(from, y, x - from, 1), (from = -1));
      }
    }
    for (let i = 0; i < 26; i++) {
      let x = SIDE + Math.random() * inner;
      let y = FLOOR_TOP + Math.random() * (FRONT - FLOOR_TOP);
      for (let k = 0; k < 14; k++) {
        px(Math.round(x), Math.round(y), 1, 1, look.grout);
        x += Math.random() * 2 - 0.4;
        y += Math.random() - 0.5;
      }
    }
  } else {
    for (let y = FLOOR_TOP; y < FRONT; y += 12) {
      for (let x = SIDE; x < VIEW_W - SIDE; x += 20) {
        const odd = ((x - SIDE) / 20 + (y - FLOOR_TOP) / 12) % 2 === 1;
        px(x, y, 20, 12, odd ? look.b : look.a);
        if (look.under === 'carpet') {
          // Carpet tiles: a fine weave, turned on alternate tiles.
          for (let k = 2; k < (odd ? 20 : 12); k += 3) {
            if (odd) px(x + k, y + 1, 1, 10, look.grout);
            else px(x + 1, y + k, 18, 1, look.grout);
          }
        }
      }
    }
    if (look.under === 'tile') {
      for (let y = FLOOR_TOP; y < FRONT; y += 12) px(SIDE, y, inner, 1, look.grout);
      for (let x = SIDE; x < VIEW_W - SIDE; x += 20) px(x, FLOOR_TOP, 1, FRONT - FLOOR_TOP, look.grout);
    }
  }
  const rug = RUGS[lv.plan];
  if (rug && lv.rug) {
    const [x, y, w, h] = rug;
    const [fill, edge] = lv.rug;
    px(x, y, w, h, fill);
    px(x, y, w, 1, edge);
    px(x, y + h - 1, w, 1, edge);
    px(x + 3, y + 3, w - 6, 1, edge);
    px(x + 3, y + h - 4, w - 6, 1, edge);
  }
  // A soft shade along the foot of the back wall.
  px(SIDE, FLOOR_TOP, inner, 2, 'rgba(17,17,17,0.08)');

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
  px(SIDE, FRONT, inner, 1, '#3A3A36');
  return c;
}

// Something on the wall between the middle and right lifts, by plan.
function decor(px: (x: number, y: number, w: number, h: number, col: string) => void, lv: Level) {
  const x = 172;
  const y = WALL_TOP + 7;
  const a = lv.look.accent;
  switch (lv.plan) {
    case 'open': // a clock
      px(x + 6, y + 1, 10, 10, PAL.k);
      px(x + 7, y + 2, 8, 8, PAL.c);
      px(x + 11, y + 3, 1, 4, PAL.k);
      px(x + 11, y + 6, 3, 1, PAL.k);
      break;
    case 'cubicles': // a pinboard of notes
      px(x, y, 22, 14, '#B99A74');
      px(x + 1, y + 1, 20, 12, '#CDB08A');
      [[2, 2, PAL.y], [8, 3, PAL.c], [14, 2, a], [4, 8, PAL.c], [11, 8, '#9CC3A8']].forEach(([dx, dy, col]) => px(x + (dx as number), y + (dy as number), 5, 4, col as string));
      break;
    case 'meeting': // a screen with a chart
      px(x, y, 22, 14, PAL.k);
      px(x + 1, y + 1, 20, 11, '#E8EEF0');
      [3, 6, 4, 8, 7].forEach((h, i) => px(x + 3 + i * 4, y + 11 - h, 2, h, i === 3 ? a : PAL.m));
      break;
    case 'lounge': // a coffee sign
      px(x + 2, y, 18, 14, PAL.k);
      px(x + 7, y + 4, 8, 6, PAL.c);
      px(x + 15, y + 5, 2, 3, PAL.c);
      px(x + 8, y + 2, 1, 1, PAL.w);
      px(x + 11, y + 1, 1, 2, PAL.w);
      px(x + 2, y + 12, 18, 2, a);
      break;
    case 'it': // a status board
      px(x, y, 22, 14, '#2A2A27');
      for (let i = 0; i < 12; i++) px(x + 2 + (i % 6) * 3, y + 3 + Math.floor(i / 6) * 4, 2, 2, i === 7 ? PAL.r : '#7FD39A');
      px(x + 2, y + 11, 18, 1, PAL.m);
      break;
    case 'lobby': // the company mark in brass
      px(x + 3, y + 1, 16, 12, '#B8913F');
      px(x + 5, y + 3, 12, 8, '#E6E1D6');
      px(x + 8, y + 5, 6, 4, '#B8913F');
      break;
  }
}

// The furniture, drawn live so bodies can pass behind it.
const draw: Record<'pillar' | 'rack' | 'desk' | 'plant' | 'table' | 'sofa' | 'cabinet' | 'vending' | 'cooler' | 'copier' | 'reception' | 'bench', PropDraw> = {
  pillar(px, { x, y, w, h, height }) {
    px(x, y + h - height, w, height, '#D9D6CE'); // face
    px(x, y + h - height, w, 2, '#EEECE6');
    px(x + w - 3, y + h - height, 3, height, '#C9C5BC'); // side
    px(x, y + h - 2, w, 2, '#BDB9AF'); // base
  },
  rack(px, { x, y, w, h, height }, time) {
    px(x, y + h - height, w, height, PAL.k);
    for (let yy = y + h - height + 3; yy < y + h - 2; yy += 3) px(x + 2, yy, w - 4, 1, '#2A2A27');
    for (let i = 0; i < 6; i++) {
      const on = Math.sin(time * (3 + i * 1.7) + i + x) > 0.2;
      px(x + w - 4, y + h - height + 4 + i * 4, 1, 1, on ? (i % 3 === 0 ? PAL.r : '#7FD39A') : '#2A2A27');
    }
  },
  desk(px, { x, y, w, h, height }) {
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
  },
  plant(px, { x, y, w }) {
    px(x, y - 4, w, 5, PAL.k); // pot
    px(x + 1, y - 13, 1, 9, PAL.g);
    px(x + 3, y - 14, 1, 10, PAL.g);
    px(x + 4, y - 11, 1, 7, PAL.g);
    px(x, y - 12, 1, 3, PAL.l);
    px(x + 5, y - 10, 1, 3, PAL.l);
    px(x + 2, y - 15, 1, 3, PAL.l);
  },
  table(px, { x, y, w, h, height }) {
    // A wooden table with chairs tucked in behind it.
    const top = y + h - height - h;
    for (let cx = x + 4; cx < x + w - 6; cx += 10) px(cx, top - 4, 6, 5, '#46464E');
    px(x, top, w, h, '#B99A74');
    px(x, top, w, 1, '#D2B794');
    px(x + 2, top + 2, w - 4, 1, '#C7A985');
    px(x, y + h - height, w, height, '#8C6B4A');
    px(x, y + h - height, w, 1, '#6F5338');
    px(x + 2, y + h - 2, 2, 2, PAL.k);
    px(x + w - 4, y + h - 2, 2, 2, PAL.k);
    px(x + w / 2 - 4, top + 4, 8, 3, PAL.c); // papers
  },
  sofa(px, { x, y, w, h, height }) {
    // Its back along the top, seat cushions, arms either end.
    const top = y + h - height - h;
    px(x, top - 3, w, 6, '#4F6F5B');
    px(x, top - 3, w, 1, '#6E8E79');
    px(x + 2, top + 3, w - 4, h - 1, '#5E8A6C');
    px(x + w / 2, top + 3, 1, h - 1, '#4F6F5B');
    px(x, top - 1, 3, h + height, '#4F6F5B');
    px(x + w - 3, top - 1, 3, h + height, '#4F6F5B');
    px(x, y + h - height, w, height, '#3E5A48');
    px(x + 2, y + h - 1, 2, 1, PAL.k);
    px(x + w - 4, y + h - 1, 2, 1, PAL.k);
  },
  cabinet(px, { x, y, w, h, height }) {
    // Filing cabinets, side by side, three drawers each.
    const top = y + h - height - h;
    px(x, top, w, h, '#C9C7C0');
    px(x, top, w, 1, '#DEDCD5');
    px(x, y + h - height, w, height, '#A9A79F');
    for (let cx = x; cx < x + w; cx += 12) {
      px(cx, y + h - height, 1, height, '#8E8C85');
      for (let k = 0; k < 3; k++) px(cx + 4, y + h - height + 3 + k * 5, 4, 1, '#6B6B66');
    }
  },
  vending(px, { x, y, w, h, height }, time) {
    // Lit glass front, rows of cans, a coin slot.
    const top = y + h - height - h;
    px(x, top, w, h, '#8E3A24');
    px(x, y + h - height, w, height, '#B4432C');
    px(x, y + h - height, w, 1, '#C4532F');
    px(x + 2, y + h - height + 3, w - 7, height - 10, '#F3EFE4');
    const cans = [PAL.y, PAL.g, '#3E5F8A', PAL.r];
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) px(x + 3 + k * 3, y + h - height + 5 + r * 4, 2, 3, cans[(r + k) % 4]);
    px(x + w - 4, y + h - height + 6, 2, 3, Math.floor(time * 2 + x) % 3 ? PAL.y : '#FFF4D6');
    px(x + 2, y + h - 6, w - 7, 3, PAL.k);
  },
  cooler(px, { x, y, w }) {
    // A water cooler: a blue bottle on a white stand.
    px(x - 1, y - 9, w + 2, 10, '#E8E6E0');
    px(x - 1, y - 9, w + 2, 1, '#FFFFFF');
    px(x + 1, y - 6, 2, 1, BLUE);
    px(x, y - 16, w, 7, '#A9C6DD');
    px(x + 1, y - 15, 1, 5, '#D4E6F2');
    px(x + 1, y - 17, w - 2, 1, '#7FA6C4');
  },
  copier(px, { x, y, w, h, height }, time) {
    const top = y + h - height - h;
    px(x, top, w, h, '#D6D4CD');
    px(x + 2, top + 2, w - 4, 3, '#46464E'); // the glass
    px(x, y + h - height, w, height, '#BDBBB3');
    px(x, y + h - height, w, 1, '#A3A19A');
    px(x + 2, y + h - height + 4, w - 4, 2, '#9C9B94'); // paper tray
    px(x + w - 4, top + 6, 2, 1, Math.floor(time * 1.5) % 2 ? '#7FD39A' : '#3A6A4A');
  },
  reception(px, { x, y, w, h, height }) {
    // The front desk: stone top, wood front, a brass band, two screens.
    const top = y + h - height - h;
    px(x, top, w, h, '#EAE6DD');
    px(x, top, w, 1, '#F7F5F0');
    px(x + 14, top - 6, 10, 7, PAL.k);
    px(x + 15, top - 5, 8, 4, PAL.g);
    px(x + w - 24, top - 6, 10, 7, PAL.k);
    px(x + w - 23, top - 5, 8, 4, PAL.g);
    px(x + w / 2 - 2, top + 3, 4, 3, PAL.y); // the bell
    px(x, y + h - height, w, height, '#8C6B4A');
    px(x, y + h - height, w, 1, '#6F5338');
    px(x, y + h - height + 4, w, 2, '#B8913F');
    px(x + w / 2 - 5, y + h - height + 7, 10, 3, '#B8913F');
  },
  bench(px, { x, y, w, h, height }) {
    const top = y + h - height - h;
    px(x, top, w, h, '#C9A66B');
    for (let k = 1; k < h; k += 2) px(x, top + k, w, 1, '#B8935A');
    px(x, y + h - height, w, 2, '#8C6B3A');
    px(x + 2, y + h - height + 2, 2, height - 2, PAL.k);
    px(x + w - 4, y + h - height + 2, 2, height - 2, PAL.k);
  },
};

export const OFFICES: Floor[] = LEVELS.map((lv, i) => ({
  name: lv.name,
  title: lv.title,
  props: PLANS[lv.plan](),
  paint: () => paintOffice(lv, i),
  draw,
  dark: false,
  doors: { steel: STEEL, edge: STEEL_HI },
}));
