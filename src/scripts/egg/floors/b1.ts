// B1, the server room under the office, where the Root Bug's quake drops
// the fight: concrete, pipes, freight lifts and racks of servers.
import { PAL } from '../sprites';
import { DOORS, FLOOR_TOP, FRONT, prop, SIDE, VIEW_H, VIEW_W, WALL_TOP, type Prop } from '../world';
import type { Floor, PropDraw } from '.';

// B1: concrete and steel, darker than the office upstairs.
const B1_WALL = '#7A7D77';
const B1_WALL_D = '#6E716B';
const B1_FLOOR = '#585C57';
const B1_FLOOR_B = '#545853';
const B1_JOINT = '#474B46';

// B1, the server room the Root Bug smashes through to. The columns stand
// under the office pillars; the middle is left open for the fight.
const SERVER_PROPS: Prop[] = [
  prop('column', 84, 92, 12, 7, 46, true),
  prop('column', 224, 92, 12, 7, 46, true),
  prop('server', 30, 66, 30, 8, 30, true),
  prop('server', 260, 66, 30, 8, 30, true),
  prop('server', 30, 140, 30, 8, 30, true),
  prop('server', 260, 140, 30, 8, 30, true),
  prop('crate', 126, 150, 12, 8, 10),
  prop('crate', 184, 58, 12, 8, 10),
  prop('crate', 20, 106, 10, 7, 9),
];

// B1: bare concrete block, pipes along the top, freight lifts in hazard
// frames, a stencilled B1, and a dark concrete floor with raised-floor
// tiles in front of the server racks. Lit by a few pools from above.
function paintServerRoom(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = VIEW_W;
  c.height = VIEW_H;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  const hazard = (x: number, y: number, w: number, h: number) => {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) px(x + xx, y + yy, 1, 1, ((xx + yy) >> 2) % 2 ? PAL.k : PAL.y);
  };
  // Pools of light: rows of a soft ellipse, a few steps of brightness.
  const pool = (cx: number, cy: number, rx: number, ry: number, col: string) => {
    for (let y = -ry; y <= ry; y++) {
      const half = Math.round(rx * Math.sqrt(1 - (y / ry) ** 2));
      px(cx - half, cy + y, half * 2, 1, col);
    }
  };
  const inner = VIEW_W - SIDE * 2;

  px(0, 0, VIEW_W, VIEW_H, PAL.k);

  // Back wall: concrete block in stretcher bond.
  px(SIDE, WALL_TOP, inner, FLOOR_TOP - WALL_TOP, B1_WALL);
  for (let y = WALL_TOP + 1, row = 0; y < FLOOR_TOP; y += 6, row++) {
    px(SIDE, y, inner, 1, B1_WALL_D);
    for (let x = SIDE + (row % 2 ? 7 : 0); x < VIEW_W - SIDE; x += 14) px(x, y, 1, 6, B1_WALL_D);
  }
  px(SIDE, WALL_TOP, inner, 1, '#3A3A36');
  // Pipes along the wall head, on brackets: a grey main and a red sprinkler line.
  px(SIDE, WALL_TOP + 1, inner, 3, '#5D605B');
  px(SIDE, WALL_TOP + 1, inner, 1, '#9A9D96');
  px(SIDE, WALL_TOP + 5, inner, 2, '#8E4A30');
  px(SIDE, WALL_TOP + 5, inner, 1, '#B5603E');
  for (let x = SIDE + 12; x < VIEW_W - SIDE; x += 30) px(x, WALL_TOP + 1, 2, 7, '#3A3D39');
  // B1, stencilled in brass, either side of the lifts.
  const B1 = ['110010', '101110', '110010', '101010', '110111'];
  for (const x0 of [30, 262]) {
    B1.forEach((row, y) => [...row].forEach((ch, x) => ch === '1' && px(x0 + x * 2, WALL_TOP + 13 + y * 2, 2, 2, '#B8913F')));
  }
  // Wall vents and a fuse box.
  for (const [x0, y0] of [[62, 15], [236, 15]]) {
    px(x0, y0, 18, 12, '#3E413D');
    for (let y = y0 + 2; y < y0 + 11; y += 2) px(x0 + 1, y, 16, 1, '#2A2C29');
    px(x0, y0, 18, 1, '#A3A69E');
  }
  px(290, 16, 10, 13, '#8C8F88');
  px(290, 16, 10, 1, '#B4B7AF');
  px(293, 19, 4, 4, PAL.y);
  px(294, 20, 2, 2, PAL.k);
  // Freight lifts in hazard-striped frames.
  for (const d of DOORS) {
    if (d.side !== 'back') continue;
    hazard(d.x - 11, FLOOR_TOP - 27, 22, 27);
    px(d.x - 9, FLOOR_TOP - 24, 18, 24, PAL.k);
  }
  // Caged lamps.
  for (const x of [44, 136, 184, 276]) {
    px(x, WALL_TOP + 9, 5, 3, '#FFF4D6');
    px(x + 2, WALL_TOP + 9, 1, 3, '#3A3D39');
  }
  px(SIDE, FLOOR_TOP - 3, inner, 3, '#4A4D49'); // kick plate

  // Floor: poured concrete in big slabs, speckled.
  px(SIDE, FLOOR_TOP, inner, FRONT - FLOOR_TOP, B1_FLOOR);
  for (let y = FLOOR_TOP; y < FRONT; y += 34) {
    for (let x = SIDE; x < VIEW_W - SIDE; x += 50) {
      if (Math.random() < 0.4) px(x + 1, y + 1, 49, 33, B1_FLOOR_B);
    }
  }
  for (let i = 0; i < 700; i++) {
    px(SIDE + Math.floor(Math.random() * inner), FLOOR_TOP + Math.floor(Math.random() * (FRONT - FLOOR_TOP)), 1, 1, i % 2 ? '#646862' : '#4C504B');
  }
  for (let y = FLOOR_TOP; y < FRONT; y += 34) px(SIDE, y, inner, 1, B1_JOINT);
  for (let x = SIDE; x < VIEW_W - SIDE; x += 50) px(x, FLOOR_TOP, 1, FRONT - FLOOR_TOP, B1_JOINT);
  // Light falling from the lamps.
  pool(160, 112, 78, 34, 'rgba(255,244,214,0.035)');
  pool(160, 112, 52, 22, 'rgba(255,244,214,0.04)');
  pool(160, 112, 28, 12, 'rgba(255,244,214,0.04)');
  // Raised-floor tiles, perforated, in front of the racks.
  for (const [x0, y0] of [[30, 76], [260, 76], [30, 150], [260, 150]]) {
    for (let x = x0; x < x0 + 30; x += 10) {
      px(x, y0, 10, 10, '#8A8E88');
      px(x, y0, 10, 1, '#9EA29B');
      px(x, y0, 1, 10, '#777B75');
      for (let yy = y0 + 2; yy < y0 + 9; yy += 2) for (let xx = x + 2; xx < x + 9; xx += 2) px(xx, yy, 1, 1, '#6A6E68');
    }
  }
  // A walkway line along the back, landing chevrons at the lifts, a drain.
  px(SIDE, FLOOR_TOP + 13, inner, 1, '#9C7D3C');
  for (const d of DOORS) if (d.side === 'back') hazard(d.x - 10, FLOOR_TOP + 1, 20, 4);
  px(152, 168, 16, 6, '#3C3F3B');
  for (let x = 153; x < 167; x += 2) px(x, 169, 1, 4, '#2A2C29');
  // Shade at the foot of the wall and down the sides.
  px(SIDE, FLOOR_TOP, inner, 3, 'rgba(0,0,0,0.18)');
  px(SIDE, FLOOR_TOP, 12, FRONT - FLOOR_TOP, 'rgba(0,0,0,0.1)');
  px(VIEW_W - SIDE - 12, FLOOR_TOP, 12, FRONT - FLOOR_TOP, 'rgba(0,0,0,0.1)');

  // Side walls with their doors, and the front wall, as upstairs.
  px(0, WALL_TOP, SIDE, FRONT - WALL_TOP, PAL.k);
  px(VIEW_W - SIDE, WALL_TOP, SIDE, FRONT - WALL_TOP, PAL.k);
  px(SIDE - 1, WALL_TOP, 1, FRONT - WALL_TOP, '#3A3A36');
  px(VIEW_W - SIDE, WALL_TOP, 1, FRONT - WALL_TOP, '#3A3A36');
  for (const d of DOORS) {
    if (d.side === 'back') continue;
    const x = d.side === 'left' ? 0 : VIEW_W - SIDE;
    px(x, d.y - 12, SIDE, 14, '#2A2A27');
    hazard(x, d.y - 14, SIDE, 2);
    hazard(x, d.y + 2, SIDE, 2);
  }
  px(0, FRONT, VIEW_W, VIEW_H - FRONT, PAL.k);
  px(SIDE, FRONT, inner, 1, '#3A3A36');
  return c;
}

// The furniture, drawn live so bodies can pass behind it.
const draw: Record<'column' | 'server' | 'crate', PropDraw> = {
  column(px, { x, y, w, h, height }) {
    // Bare concrete, a hazard band where forklifts would hit it.
    px(x, y + h - height, w, height, '#8A8D86');
    px(x, y + h - height, w, 2, '#A3A69E');
    px(x + w - 3, y + h - height, 3, height, '#767973');
    for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < w; xx++) px(x + xx, y + h - 11 + yy, 1, 1, ((xx + yy) >> 1) % 2 ? PAL.k : PAL.y);
    px(x, y + h - 2, w, 2, '#5D605B');
  },
  server(px, { x, y, w, h, height }, time) {
    // A cabinet: its top seen from above, a grilled door with blinking lights.
    const top = y + h - height - h;
    px(x, top, w, h, '#3A3D3A');
    px(x, top, w, 1, '#4E524E');
    px(x, y + h - height, w, height, '#232624');
    px(x, y + h - height, w, 1, '#4A4E4A');
    for (let xx = x + 2; xx < x + w - 6; xx += 2) px(xx, y + h - height + 3, 1, height - 6, '#2E312F');
    px(x + w / 2 - 1, y + h - height + 3, 1, height - 6, '#151716'); // the doors' seam
    for (let i = 0; i < 6; i++) {
      const on = Math.sin(time * (2.3 + i * 1.3) + i * 2 + x) > 0;
      px(x + w - 4, y + h - height + 4 + i * 4, 2, 1, on ? (i % 4 === 0 ? PAL.y : '#7FD39A') : '#1A1C1B');
    }
  },
  crate(px, { x, y, w, h, height }) {
    const top = y + h - height - h;
    px(x, top, w, h, '#C9A66B');
    px(x, top, w, 1, '#DDBE86');
    px(x, y + h - height, w, height, '#A9844C');
    px(x, y + h - height, w, 1, '#8C6B3A');
    px(x, y + h - height + Math.floor(height / 2), w, 1, '#8C6B3A');
    px(x + 1, top + 1, w - 2, 1, '#B8935A');
    px(x + 2, y + h - height + 2, 1, height - 3, '#8C6B3A');
    px(x + w - 3, y + h - height + 2, 1, height - 3, '#8C6B3A');
  },
};

export const b1: Floor = {
  name: 'B1',
  title: 'B1 · Server room',
  props: SERVER_PROPS,
  paint: paintServerRoom,
  draw,
  dark: true,
  doors: { steel: '#8C8F88', edge: '#A3A69E', ribs: '#747770' },
};
