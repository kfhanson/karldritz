// What there is to spend chips on between rounds, and when: the shop on a
// computer every fifth round, a vending machine of upgrades and a crate of
// guns in between. Everything bought changes the loadout for the rest of the
// run.

export interface Weapon {
  id: string;
  name: string;
  blurb: string;
  cool: number; // seconds between shots
  dmg: number;
  speed: number;
  pellets: number;
  spread: number; // radians across all pellets (or random jitter for one)
  life: number; // seconds a shot flies
  pierce: number; // extra bugs a shot passes through
  bounce: number; // walls it can bounce off
  size: number; // px
  color: string;
}

export const WEAPONS: Record<string, Weapon> = {
  pistol: {
    id: 'pistol', name: 'Pistol', blurb: 'Reliable. Point and shoot.',
    cool: 0.16, dmg: 1, speed: 300, pellets: 1, spread: 0, life: 1.2, pierce: 0, bounce: 0, size: 2, color: '#C4532F',
  },
  shotgun: {
    id: 'shotgun', name: 'Pump shotgun', blurb: 'Five pellets, short reach, a big kick.',
    cool: 0.5, dmg: 1, speed: 290, pellets: 5, spread: 0.55, life: 0.36, pierce: 0, bounce: 0, size: 2, color: '#C4532F',
  },
  smg: {
    id: 'smg', name: 'SMG', blurb: 'Very fast, a little wild.',
    cool: 0.065, dmg: 1, speed: 340, pellets: 1, spread: 0.14, life: 1, pierce: 0, bounce: 0, size: 1, color: '#D9A441',
  },
  rail: {
    id: 'rail', name: 'Rail rifle', blurb: 'Slow and heavy. Goes straight through everything.',
    cool: 0.42, dmg: 3, speed: 460, pellets: 1, spread: 0, life: 1, pierce: 99, bounce: 0, size: 3, color: '#2E4D3A',
  },
  revolver: {
    id: 'revolver', name: 'Ricochet revolver', blurb: 'Rounds bounce off the walls twice.',
    cool: 0.2, dmg: 1, speed: 280, pellets: 1, spread: 0, life: 2.4, pierce: 0, bounce: 2, size: 2, color: '#5E8A6C',
  },
};

export interface Loadout {
  weapon: string;
  maxHp: number;
  dmg: number; // added to every shot
  rate: number; // multiplies the weapon's cooldown
  pierce: number;
  extra: number; // extra pellets, fanned out
  dashCool: number; // multiplies the dash cooldown
  magnet: boolean;
  chipMult: number;
  vampire: number; // kills per heart healed, 0 = off
  kills: number;
  bought: number; // wares bought this run: each makes the next dearer
}

export const freshLoadout = (): Loadout => ({
  weapon: 'pistol', maxHp: 5, dmg: 0, rate: 1, pierce: 0, extra: 0, dashCool: 1,
  magnet: false, chipMult: 1, vampire: 0, kills: 0, bought: 0,
});

/** What an upgrade can touch beyond the loadout. */
export interface Ctx {
  l: Loadout;
  heal(n: number): void;
}

/** The picture on a ware's label (drawn in sprites.ts). */
export type WareIcon = 'aid' | 'drink' | 'bullet' | 'bolt' | 'shoe' | 'pierce' | 'barrel' | 'magnet' | 'coffee' | 'vest' | 'heal';

export interface Ware {
  id: string;
  name: string;
  blurb: string;
  icon: WareIcon;
  price: number; // before inflation: see priceOf
  ok?(l: Loadout): boolean; // still worth selling?
  apply(c: Ctx): void;
}

// The shop: the everyday kit. Prices climb with each visit.
function shopWares(tier: number): Ware[] {
  return [
    { id: 'repair', name: 'First-aid kit', blurb: '+2 hearts.', icon: 'aid', price: 6 + tier * 2, apply: (c) => c.heal(2) },
    { id: 'heart', name: 'Energy drink', blurb: '+1 max heart.', icon: 'drink', price: 18 + tier * 6, apply: (c) => ((c.l.maxHp += 1), c.heal(1)) },
    { id: 'power', name: 'Heavy rounds', blurb: '+1 damage per shot.', icon: 'bullet', price: 22 + tier * 8, apply: (c) => (c.l.dmg += 1) },
    { id: 'rate', name: 'Hair trigger', blurb: 'Fire 15% faster.', icon: 'bolt', price: 16 + tier * 6, apply: (c) => (c.l.rate *= 0.85) },
    { id: 'dash', name: 'Better sneakers', blurb: 'Dash cooldown −25%.', icon: 'shoe', price: 10 + tier * 4, apply: (c) => (c.l.dashCool *= 0.75) },
    { id: 'pierce', name: 'Piercing rounds', blurb: 'Shots pass through one more bug.', icon: 'pierce', price: 20 + tier * 7, apply: (c) => (c.l.pierce += 1) },
  ];
}

// The vending machine: the odd, stronger stuff, a little dearer.
function vendingWares(tier: number): Ware[] {
  const at = (base: number) => base + tier * 6;
  return [
    { id: 'tough', name: 'Kevlar vest', blurb: '+1 max heart, and a heart back.', icon: 'vest', price: at(16), apply: (c) => ((c.l.maxHp += 1), c.heal(1)) },
    { id: 'hollow', name: 'Hollow points', blurb: 'Every shot does +1 damage.', icon: 'bullet', price: at(22), apply: (c) => (c.l.dmg += 1) },
    { id: 'twin', name: 'Extra barrel', blurb: 'One more shot, fanned out.', icon: 'barrel', price: at(26), ok: (l) => l.extra < 3, apply: (c) => (c.l.extra += 1) },
    { id: 'ap', name: 'AP rounds', blurb: 'Shots pass through one more bug.', icon: 'pierce', price: at(18), apply: (c) => (c.l.pierce += 1) },
    { id: 'espresso', name: 'Espresso shot', blurb: 'Fire 20% faster.', icon: 'coffee', price: at(18), apply: (c) => (c.l.rate *= 0.8) },
    { id: 'magnet', name: 'Magnet', blurb: 'Pickups fly to you; bugs drop 50% more chips.', icon: 'magnet', price: at(12), ok: (l) => !l.magnet, apply: (c) => ((c.l.magnet = true), (c.l.chipMult *= 1.5)) },
    { id: 'vampire', name: 'Coffee break', blurb: 'Every 12 kills heals a heart.', icon: 'heal', price: at(16), ok: (l) => l.vampire === 0 || l.vampire > 6, apply: (c) => (c.l.vampire = c.l.vampire ? c.l.vampire - 3 : 12) },
    { id: 'shoes', name: 'Running shoes', blurb: 'Dash recovers twice as fast.', icon: 'shoe', price: at(10), ok: (l) => l.dashCool > 0.3, apply: (c) => (c.l.dashCool *= 0.5) },
  ];
}

/** What a ware costs now: 12% more for every ware already bought this run. */
export const priceOf = (w: Ware, l: Loadout) => Math.round(w.price * 1.12 ** l.bought);

/** What's on after a round, if anything: the shop, the vending machine, or a crate of guns. */
export type Stop = 'shop' | 'vending' | 'crate';
export const STOPS: Partial<Record<number, Stop>> = {
  3: 'vending', 5: 'shop', 7: 'crate', 8: 'vending', 10: 'shop', 12: 'crate', 13: 'vending', 15: 'shop', 17: 'crate', 18: 'vending',
};

/** How many times this kind of stop has come round before this round: prices climb with it. */
export function visits(stop: Stop, round: number) {
  let n = 0;
  for (const [r, s] of Object.entries(STOPS)) if (s === stop && Number(r) < round) n++;
  return n;
}

export interface Offer {
  kind: Stop;
  chips: number;
  wares?: Ware[];
  weapons?: Weapon[];
  sold: Set<number>; // kept for the visit: stepping away and back doesn't restock it
}

export function pick<T>(list: T[], n: number): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/** Fill a stop with this visit's choices: four in the shop, six in the machine, three guns in the crate. */
export function makeOffer(kind: Stop, l: Loadout, chips: number, tier: number): Offer {
  const sold = new Set<number>();
  if (kind === 'crate') return { kind, chips, sold, weapons: pick(Object.values(WEAPONS).filter((w) => w.id !== l.weapon), 3) };
  if (kind === 'vending') return { kind, chips, sold, wares: pick(vendingWares(tier).filter((w) => !w.ok || w.ok(l)), 6) };
  return { kind, chips, sold, wares: pick(shopWares(tier), 4) };
}
