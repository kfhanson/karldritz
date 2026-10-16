// The Bug Hunt player, off duty, standing in the empty slot at the end of the
// project grid. Idle, it turns to watch the cursor. Click it and it hops and
// wakes up; from then on it walks to wherever the section is clicked (links
// still work as links) and never leaves the section.
//
// Drawn the game's way: the same sprites on a low-res canvas scaled up with
// crisp pixels, hands floating by the body. Only runs while on screen.
import { buildPerson, PEOPLE, PERSON_SHOULDER, PERSON_VIEW, type Person } from './egg/people';

const SPEED = 70; // px a second, in sprite pixels
const GRAVITY = 320;
const HOP = 72; // take-off speed: about an 8px hop
const MARGIN = { x: 8, top: 24, bottom: 3 }; // keep the whole sprite inside the section
const SHADOW = 'rgba(17,17,17,0.16)';

const pixel = () => (matchMedia('(min-width: 768px)').matches ? 5 : 4);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function initBuddy(): (() => void) | undefined {
  const zone = document.querySelector<HTMLElement>('[data-buddy-zone]');
  const home = zone?.querySelector<HTMLElement>('[data-buddy-home]');
  const canvas = zone?.querySelector<HTMLCanvasElement>('canvas[data-buddy]');
  if (!zone || !home || !canvas) return;
  const g = canvas.getContext('2d')!;
  const hint = zone.querySelector<HTMLElement>('[data-buddy-hint]');
  const person: Person = buildPerson();

  let S = pixel();
  let W = 0, H = 0;
  // Feet position, target, height off the ground and its speed.
  const me = { x: 0, y: 0, tx: 0, ty: 0, z: 0, vz: 0, awake: false, walk: 0, blink: 3 };
  let look: { x: number; y: number } | null = null; // the cursor, in sprite pixels
  let face = { x: 0, y: 1 }; // where it's looking: at the camera until the cursor shows up
  let time = 0, last = 0, raf = 0, visible = false;

  const homeSpot = () => {
    const z = zone.getBoundingClientRect();
    const r = home.getBoundingClientRect();
    return {
      x: (r.left + r.width / 2 - z.left) / S,
      y: (r.top + Math.min(r.height, 260) * 0.62 - z.top) / S,
    };
  };
  const inBounds = (x: number, y: number) => ({
    x: clamp(x, MARGIN.x, W - MARGIN.x),
    y: clamp(y, MARGIN.top, H - MARGIN.bottom),
  });

  const fit = () => {
    S = pixel();
    W = Math.ceil(zone.clientWidth / S);
    H = Math.ceil(zone.clientHeight / S);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = `${W * S}px`;
    canvas.style.height = `${H * S}px`;
    g.imageSmoothingEnabled = false;
    const at = me.awake ? inBounds(me.x, me.y) : homeSpot();
    const to = me.awake ? inBounds(me.tx, me.ty) : at;
    Object.assign(me, { x: at.x, y: at.y, tx: to.x, ty: to.y });
  };

  // Pointer position in sprite pixels.
  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = zone.getBoundingClientRect();
    return { x: (e.clientX - r.left) / S, y: (e.clientY - r.top) / S };
  };
  const onMe = (p: { x: number; y: number }) =>
    Math.abs(p.x - me.x) <= 9 && p.y >= me.y - me.z - 23 && p.y <= me.y + 3;

  const onMove = (e: PointerEvent) => {
    look = toLocal(e);
    zone.style.cursor = onMe(look) ? 'pointer' : '';
  };
  const onLeave = () => (zone.style.cursor = '');
  // Captured, so a click on the character over a card hops instead of following the link.
  const onClick = (e: MouseEvent) => {
    const p = toLocal(e);
    if (onMe(p)) {
      e.preventDefault();
      e.stopPropagation();
      if (me.z === 0) me.vz = reduced() ? HOP * 0.6 : HOP;
      if (!me.awake) {
        me.awake = true;
        hint?.setAttribute('data-gone', '');
      }
      return;
    }
    if (!me.awake) return;
    if ((e.target as Element).closest('a, button, input, select, textarea, label, summary')) return;
    const to = inBounds(p.x, p.y);
    me.tx = to.x;
    me.ty = to.y;
  };
  // No text selection from clicking on the character.
  const onDown = (e: MouseEvent) => onMe(toLocal(e)) && e.preventDefault();

  const step = (dt: number) => {
    time += dt;
    me.blink -= dt;
    if (me.blink < -0.12) me.blink = 2.5 + Math.random() * 3;

    const dx = me.tx - me.x, dy = me.ty - me.y;
    const d = Math.hypot(dx, dy);
    const moving = d > 0.5;
    if (moving) {
      const k = Math.min(1, (SPEED * dt) / d);
      me.x += dx * k;
      me.y += dy * k;
      me.walk += dt;
      face = { x: dx / d, y: dy / d };
    } else {
      me.walk = 0;
      if (look) {
        const lx = look.x - me.x, ly = look.y - (me.y - PERSON_SHOULDER);
        if (Math.hypot(lx, ly) > 2) face = { x: lx, y: ly };
      }
    }
    if (me.vz !== 0 || me.z > 0) {
      me.vz -= GRAVITY * dt;
      me.z = Math.max(0, me.z + me.vz * dt);
      if (me.z === 0) me.vz = 0;
    }
    return moving;
  };

  // A hand: two by two of skin in a rounded outline, as in the game.
  const fist = (x: number, y: number) => {
    x = Math.round(x - 1);
    y = Math.round(y - 1);
    g.fillStyle = PEOPLE.k;
    g.fillRect(x - 1, y, 4, 2);
    g.fillRect(x, y - 1, 2, 4);
    g.fillStyle = PEOPLE.s;
    g.fillRect(x, y, 2, 2);
    g.fillStyle = PEOPLE.S;
    g.fillRect(x, y + 1, 2, 1);
  };

  const draw = (moving: boolean) => {
    g.clearRect(0, 0, W, H);
    const oct = (Math.round(Math.atan2(face.y, face.x) / (Math.PI / 4)) + 8) % 8;
    const [view, mirror] = PERSON_VIEW[oct];
    const f = person[view];
    const stride = Math.floor(me.walk * 8) % 4;
    const air = me.z > 0;
    const s = moving && !air ? f.walk[stride] : me.blink < 0 ? f.blink : f.idle;
    const bob = air ? 0 : moving ? (stride % 2 ? -1 : 0) : !reduced() && Math.floor(time * 1.6) % 2 ? -1 : 0;
    const x = Math.round(me.x), y = Math.round(me.y);
    const top = y - s.h + 1 + bob - Math.round(me.z);

    // Shadow on the ground, smaller while in the air.
    const w = Math.round(10 * Math.max(0.5, 1 - me.z / 24));
    g.fillStyle = SHADOW;
    g.fillRect(x - (w >> 1) + 1, y - 1, w - 2, 1);
    g.fillRect(x - (w >> 1), y, w, 1);
    g.fillRect(x - (w >> 1) + 1, y + 1, w - 2, 1);

    // Hands: up in the air on a hop, otherwise at the sides, swinging on a walk.
    // In profile only the near hand shows, ahead of the body.
    const cy = y - PERSON_SHOULDER + bob - Math.round(me.z);
    const swing = moving && !air ? [0, 1, 0, -1][stride] : 0;
    const dir = mirror ? -1 : 1;
    const hands = air
      ? [[x - 5, cy - 6], [x + 5, cy - 6]]
      : view === 'e'
        ? [[x + dir * (3 + swing), cy + 2]]
        : [[x - 5, cy + 2 + swing], [x + 5, cy + 2 - swing]];
    const behind = view === 'n' && !air; // seen from behind, the body hides the hands
    if (!behind) g.drawImage(mirror ? s.left : s.right, x - (s.w >> 1), top);
    for (const [hx, hy] of hands) fist(hx, hy);
    if (behind) g.drawImage(mirror ? s.left : s.right, x - (s.w >> 1), top);
  };

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    draw(step(dt));
    raf = visible ? requestAnimationFrame(frame) : 0;
  };
  const play = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const seen = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) play();
  });
  const resized = new ResizeObserver(() => {
    fit();
    draw(false);
  });

  fit();
  seen.observe(zone);
  resized.observe(zone);
  addEventListener('pointermove', onMove, { passive: true });
  zone.addEventListener('pointerleave', onLeave);
  zone.addEventListener('click', onClick, true);
  zone.addEventListener('mousedown', onDown);

  return () => {
    cancelAnimationFrame(raf);
    seen.disconnect();
    resized.disconnect();
    removeEventListener('pointermove', onMove);
    zone.removeEventListener('pointerleave', onLeave);
    zone.removeEventListener('click', onClick, true);
    zone.removeEventListener('mousedown', onDown);
  };
}
