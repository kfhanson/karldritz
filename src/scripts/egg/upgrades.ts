// What the lifts lead to after a boss: a shop, a power-up, a new weapon, or a
// repair bay. Weapons are all hand gestures; perks and shop items change the
// player's loadout for the rest of the run.

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
  finger: {
    id: 'finger', name: 'Finger gun', blurb: 'The classic. Point, and pew.',
    cool: 0.16, dmg: 1, speed: 300, pellets: 1, spread: 0, life: 1.2, pierce: 0, bounce: 0, size: 2, color: '#C4532F',
  },
  shotgun: {
    id: 'shotgun', name: 'Finger shotgun', blurb: 'Five pellets, short reach, lots of push.',
    cool: 0.5, dmg: 1, speed: 290, pellets: 5, spread: 0.55, life: 0.36, pierce: 0, bounce: 0, size: 2, color: '#C4532F',
  },
  machine: {
    id: 'machine', name: 'Machine finger', blurb: 'Very fast, a little wild.',
    cool: 0.065, dmg: 1, speed: 340, pellets: 1, spread: 0.14, life: 1, pierce: 0, bounce: 0, size: 1, color: '#D9A441',
  },
  laser: {
    id: 'laser', name: 'Snap laser', blurb: 'Slow and heavy. Goes straight through everything.',
    cool: 0.42, dmg: 3, speed: 460, pellets: 1, spread: 0, life: 1, pierce: 99, bounce: 0, size: 3, color: '#2E4D3A',
  },
  bank: {
    id: 'bank', name: 'Bank shot', blurb: 'Bounces off the walls twice.',
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
}

export const freshLoadout = (): Loadout => ({
  weapon: 'finger', maxHp: 5, dmg: 0, rate: 1, pierce: 0, extra: 0, dashCool: 1,
  magnet: false, chipMult: 1, vampire: 0, kills: 0,
});

/** What an upgrade can touch beyond the loadout. */
export interface Ctx {
  l: Loadout;
  heal(n: number): void;
}

export interface Perk {
  id: string;
  name: string;
  blurb: string;
  ok?(l: Loadout): boolean; // still worth offering?
  apply(c: Ctx): void;
}

export const PERKS: Perk[] = [
  { id: 'tough', name: 'Thick plating', blurb: '+1 max heart, and a heart back.', apply: (c) => ((c.l.maxHp += 1), c.heal(1)) },
  { id: 'power', name: 'Heavy knuckles', blurb: 'Every shot does +1 damage.', apply: (c) => (c.l.dmg += 1) },
  { id: 'twin', name: 'Extra finger', blurb: 'One more shot, fanned out.', ok: (l) => l.extra < 3, apply: (c) => (c.l.extra += 1) },
  { id: 'pierce', name: 'Sharp nails', blurb: 'Shots pass through one more bug.', apply: (c) => (c.l.pierce += 1) },
  { id: 'overclock', name: 'Overclock', blurb: 'Fire 20% faster.', apply: (c) => (c.l.rate *= 0.8) },
  { id: 'magnet', name: 'Magnet', blurb: 'Pickups fly to you; bugs drop 50% more chips.', ok: (l) => !l.magnet, apply: (c) => ((c.l.magnet = true), (c.l.chipMult *= 1.5)) },
  { id: 'vampire', name: 'Bug juice', blurb: 'Every 12 kills heals a heart.', ok: (l) => l.vampire === 0 || l.vampire > 6, apply: (c) => (c.l.vampire = c.l.vampire ? c.l.vampire - 3 : 12) },
  { id: 'dash', name: 'Spring heels', blurb: 'Dash recovers twice as fast.', ok: (l) => l.dashCool > 0.3, apply: (c) => (c.l.dashCool *= 0.5) },
];

export interface ShopItem {
  id: string;
  name: string;
  blurb: string;
  price: number;
  apply(c: Ctx): void;
}

/** The shelf for a visit; prices climb with each boss beaten. */
export function stock(tier: number): ShopItem[] {
  const all: ShopItem[] = [
    { id: 'repair', name: 'Patch kit', blurb: '+2 hearts.', price: 6 + tier * 2, apply: (c) => c.heal(2) },
    { id: 'heart', name: 'Spare heart', blurb: '+1 max heart.', price: 18 + tier * 6, apply: (c) => ((c.l.maxHp += 1), c.heal(1)) },
    { id: 'power', name: 'Knuckle dusters', blurb: '+1 damage per shot.', price: 22 + tier * 8, apply: (c) => (c.l.dmg += 1) },
    { id: 'overclock', name: 'Faster finger', blurb: 'Fire 15% faster.', price: 16 + tier * 6, apply: (c) => (c.l.rate *= 0.85) },
    { id: 'dash', name: 'Better sneakers', blurb: 'Dash cooldown −25%.', price: 10 + tier * 4, apply: (c) => (c.l.dashCool *= 0.75) },
    { id: 'pierce', name: 'Sharpener', blurb: 'Shots pass through one more bug.', price: 20 + tier * 7, apply: (c) => (c.l.pierce += 1) },
  ];
  return pick(all, 4);
}

export type OfferKind = 'shop' | 'perk' | 'weapon' | 'repair';

export interface Offer {
  kind: OfferKind;
  chips: number;
  perks?: Perk[];
  weapons?: Weapon[];
  shop?: ShopItem[];
}

export const LIFT_LABEL: Record<OfferKind, string> = {
  shop: 'Shop',
  perk: 'Power-up',
  weapon: 'Weapon',
  repair: 'Repair bay',
};

export function pick<T>(list: T[], n: number): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/** Three different lifts. Usually shop, power-up and weapon; sometimes a repair bay instead of one. */
export function liftKinds(): OfferKind[] {
  const kinds: OfferKind[] = ['shop', 'perk', 'weapon'];
  if (Math.random() < 0.35) kinds[Math.floor(Math.random() * 3)] = 'repair';
  return pick(kinds, 3);
}

/** Fill an offer with this visit's choices. */
export function makeOffer(kind: OfferKind, l: Loadout, chips: number, tier: number): Offer {
  if (kind === 'perk') return { kind, chips, perks: pick(PERKS.filter((p) => !p.ok || p.ok(l)), 3) };
  if (kind === 'weapon') return { kind, chips, weapons: pick(Object.values(WEAPONS).filter((w) => w.id !== l.weapon), 3) };
  if (kind === 'shop') return { kind, chips, shop: stock(tier) };
  return { kind, chips };
}
