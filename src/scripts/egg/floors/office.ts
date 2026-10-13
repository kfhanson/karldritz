// Floor 12, the office: glass and steel over pale tiles, desks, plants and
// a server rack. Where every run starts.
import { PAL } from '../sprites';
import { DOORS, FLOOR_TOP, FRONT, prop, SIDE, VIEW_H, VIEW_W, WALL_TOP, type Prop } from '../world';
import type { Floor, PropDraw } from '.';

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

function paintOffice(): HTMLCanvasElement {
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

// The furniture, drawn live so bodies can pass behind it.
const draw: Record<'pillar' | 'rack' | 'desk' | 'plant', PropDraw> = {
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
      const on = Math.sin(time * (3 + i * 1.7) + i) > 0.2;
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
};

export const office: Floor = {
  props: OFFICE_PROPS,
  paint: paintOffice,
  draw,
  dark: false,
  doors: { steel: STEEL, edge: STEEL_HI },
};
