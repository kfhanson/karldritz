// The floors of the building, top down. Each brings its own room, its
// furniture and how that furniture is drawn; the game, the doors and the bugs
// are the same on all of them. A new floor is a new file and a line below.
import { SHADOW, type Prop, type PropKind } from '../world';
import { b1 } from './b1';
import { office } from './office';

/** Paints one pixel-aligned rectangle. */
export type Px = (x: number, y: number, w: number, h: number, col: string) => void;
export type PropDraw = (px: Px, p: Prop, time: number) => void;

export interface Floor {
  props: Prop[];
  /** Paints the room once: walls, floor and doorways. */
  paint: () => HTMLCanvasElement;
  draw: Partial<Record<PropKind, PropDraw>>;
  /** Dark underfoot, so banners over it want light text. */
  dark: boolean;
  /** The lift doors' steel, its lit edge, and ribbing for freight doors. */
  doors: { steel: string; edge: string; ribs?: string };
}

export const FLOORS: Floor[] = [office, b1];

// Any floor's furniture can be on screen during the fall between floors.
const DRAW = Object.assign({}, ...FLOORS.map((f) => f.draw)) as Record<PropKind, PropDraw>;

/** A piece of furniture, standing on its contact shadow. */
export function drawProp(c: CanvasRenderingContext2D, p: Prop, time: number) {
  const px: Px = (x, y, w, h, col) => {
    c.fillStyle = col;
    c.fillRect(Math.round(x), Math.round(y), w, h);
  };
  px(p.x - 1, p.y + p.h - 1, p.w + 2, 3, SHADOW);
  DRAW[p.kind](px, p, time);
}
