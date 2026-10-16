// The floors of the building, top down: the office tower from 10F to the
// ground floor, a round on each, then B1. Each brings its own room, its
// furniture and how that furniture is drawn; the game, the doors and the bugs
// are the same on all of them.
import { PAL } from '../sprites';
import { SHADOW, type Prop, type PropKind } from '../world';
import { b1 } from './b1';
import { OFFICES } from './office';

/** Paints one pixel-aligned rectangle. */
export type Px = (x: number, y: number, w: number, h: number, col: string) => void;
export type PropDraw = (px: Px, p: Prop, time: number) => void;

export interface Floor {
  name: string; // short, for the HUD: 10F, G, B1
  title: string; // for the banner
  props: Prop[];
  /** Paints the room once: walls, floor and doorways. */
  paint: () => HTMLCanvasElement;
  draw: Partial<Record<PropKind, PropDraw>>;
  /** Dark underfoot, so banners over it want light text. */
  dark: boolean;
  /** The lift doors' steel, its lit edge, and ribbing for freight doors. */
  doors: { steel: string; edge: string; ribs?: string };
}

export const FLOORS: Floor[] = [...OFFICES, b1];
/** The basement, where the Root Bug's quake drops the fight. */
export const B1 = FLOORS.length - 1;

// The weapon crate: dropped in on whatever floor, so it belongs to none.
// Olive drab, stencilled, brass clasps; once opened, its lid leans on it.
const gunbox: PropDraw = (px, { x, y, w, h, height, open }) => {
  const top = y + h - height - h;
  const front = y + h - height;
  if (open) {
    px(x, top, w, h, '#2E3324');
    px(x + 2, top + 2, w - 4, h - 3, '#C9A66B'); // straw
    px(x + w - 3, top - 10, 4, h + 10, '#56603F'); // the lid, up on end
    px(x + w - 3, top - 10, 1, h + 10, '#6E7A52');
  } else {
    px(x, top, w, h, '#6E7A52');
    px(x, top, w, 1, '#87946A');
    px(x + 3, top + 3, w - 6, 1, '#56603F');
  }
  px(x, front, w, height, '#56603F');
  px(x, front, w, 1, '#3E452E');
  px(x + w / 2 - 4, front + 3, 8, 3, PAL.w); // the stencil
  px(x + w / 2 - 3, front + 4, 6, 1, '#56603F');
  px(x + 2, front + 2, 2, 3, PAL.y);
  px(x + w - 4, front + 2, 2, 3, PAL.y);
};

// Any floor's furniture can be on screen during the fall between floors.
const DRAW = Object.assign({ gunbox }, ...FLOORS.map((f) => f.draw)) as Record<PropKind, PropDraw>;

/** A piece of furniture, standing on its contact shadow. */
export function drawProp(c: CanvasRenderingContext2D, p: Prop, time: number) {
  const px: Px = (x, y, w, h, col) => {
    c.fillStyle = col;
    c.fillRect(Math.round(x), Math.round(y), w, h);
  };
  px(p.x - 1, p.y + p.h - 1, p.w + 2, 3, SHADOW);
  DRAW[p.kind](px, p, time);
}
