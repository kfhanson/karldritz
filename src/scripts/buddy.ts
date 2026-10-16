// The Bug Hunt player, off duty, standing in the empty slot at the end of the
// project grid. Idle, it turns to watch the cursor, and every so often it drops
// a hint about the logo. Click it and it hops and wakes up; from then on it
// walks to wherever the section is clicked (links still work as links) and
// never leaves the section.
//
// Drawn the game's way, the same sprites with hands floating by the body, on a
// small canvas scaled up with crisp pixels. The canvas itself glides with a
// transform, so it moves smoothly instead of a whole art pixel at a time. Only
// runs while on screen.
import { buildPerson, PEOPLE, PERSON_SHOULDER, PERSON_VIEW, type Person } from './egg/people';

const S = 3; // screen px per art pixel
const SPEED = 210; // screen px a second
const GRAVITY = 960;
const HOP = 216; // take-off speed: about an 8-art-pixel hop
const BODY = { w: 20, h: 30, fx: 10, fy: 27 }; // body canvas, with the feet at (fx, fy)
const SHADOW_W = 12;
const MARGIN = { x: 10 * S, top: 24 * S, bottom: 3 * S }; // keep the whole sprite inside the section
const SHADOW = 'rgba(17,17,17,0.16)';
const SAY = { first: 9, every: 45, hold: 6 }; // seconds on screen before the hint, between hints, shown for

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// Snap to the device pixel grid, so the scaled-up art pixels stay sharp.
const snap = (v: number) => Math.round(v * devicePixelRatio) / devicePixelRatio;

export function initBuddy(): (() => void) | undefined {
  const zone = document.querySelector<HTMLElement>('[data-buddy-zone]');
  const home = zone?.querySelector<HTMLElement>('[data-buddy-home]');
  const root = zone?.querySelector<HTMLElement>('[data-buddy]');
  const body = root?.querySelector<HTMLCanvasElement>('[data-buddy-body]');
  const shade = root?.querySelector<HTMLCanvasElement>('[data-buddy-shadow]');
  if (!zone || !home || !root || !body || !shade) return;
  const g = body.getContext('2d')!;
  const gs = shade.getContext('2d')!;
  const hint = zone.querySelector<HTMLElement>('[data-buddy-hint]');
  const say = root.querySelector<HTMLElement>('[data-buddy-say]');
  const person: Person = buildPerson();

  // Feet position and target in screen px within the section; height off the
  // ground and its speed.
  const me = { x: 0, y: 0, tx: 0, ty: 0, z: 0, vz: 0, awake: false, walk: 0, blink: 3 };
  let look: { x: number; y: number } | null = null; // the cursor, in section px
  let face = { x: 0, y: 1 }; // where it's looking: at the camera until the cursor shows up
  let time = 0, last = 0, raf = 0, visible = false;
  let watched = 0; // seconds the character itself has been on screen
  let W = 0, H = 0;
  let painted = '', shadowW = 0;
  let nextSay = SAY.first, sayUntil = 0;

  body.width = BODY.w;
  body.height = BODY.h;
  Object.assign(body.style, { width: `${BODY.w * S}px`, height: `${BODY.h * S}px`, left: `${-BODY.fx * S}px`, top: `${-BODY.fy * S}px` });
  shade.width = SHADOW_W;
  shade.height = 3;
  Object.assign(shade.style, { width: `${SHADOW_W * S}px`, height: `${3 * S}px`, left: `${(-SHADOW_W / 2) * S}px`, top: `${-1 * S}px` });
  if (say) say.style.bottom = `${25 * S}px`; // just over the head
  root.hidden = false;

  const homeSpot = () => {
    const z = zone.getBoundingClientRect();
    const r = home.getBoundingClientRect();
    return { x: r.left + r.width / 2 - z.left, y: r.top + Math.min(r.height, 260) * 0.62 - z.top };
  };
  const inBounds = (x: number, y: number) => ({
    x: clamp(x, MARGIN.x, W - MARGIN.x),
    y: clamp(y, MARGIN.top, H - MARGIN.bottom),
  });

  const fit = () => {
    W = zone.clientWidth;
    H = zone.clientHeight;
    const at = me.awake ? inBounds(me.x, me.y) : homeSpot();
    const to = me.awake ? inBounds(me.tx, me.ty) : at;
    Object.assign(me, { x: at.x, y: at.y, tx: to.x, ty: to.y });
  };

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = zone.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onMe = (p: { x: number; y: number }) =>
    Math.abs(p.x - me.x) <= 9 * S && p.y >= me.y - me.z - 23 * S && p.y <= me.y + 3 * S;

  const speak = (on: boolean) => {
    if (!say) return;
    if (on) say.setAttribute('data-on', '');
    else say.removeAttribute('data-on');
  };

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
        const lx = look.x - me.x, ly = look.y - (me.y - PERSON_SHOULDER * S);
        if (Math.hypot(lx, ly) > 2 * S) face = { x: lx, y: ly };
      }
    }
    if (me.vz !== 0 || me.z > 0) {
      me.vz -= GRAVITY * dt;
      me.z = Math.max(0, me.z + me.vz * dt);
      if (me.z === 0) me.vz = 0;
    }

    // The hint: after the character has been in view a while, then again every
    // so often. Not mid-hop.
    const top = zone.getBoundingClientRect().top + me.y;
    if (top > 0 && top - 25 * S < innerHeight) watched += dt;
    if (watched >= nextSay) {
      sayUntil = watched + SAY.hold;
      nextSay = watched + SAY.every;
    }
    speak(watched < sayUntil && me.z === 0);
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

  // The body, in art pixels around the feet. Repainted only when the pose changes.
  const paintBody = (moving: boolean) => {
    const oct = (Math.round(Math.atan2(face.y, face.x) / (Math.PI / 4)) + 8) % 8;
    const air = me.z > 0;
    const stride = Math.floor(me.walk * 12) % 4;
    const blink = me.blink < 0;
    const bob = air ? 0 : moving ? (stride % 2 ? -1 : 0) : !reduced() && Math.floor(time * 1.6) % 2 ? -1 : 0;
    const key = `${oct}${air}${moving && stride}${blink}${bob}`;
    if (key === painted) return;
    painted = key;

    const [view, mirror] = PERSON_VIEW[oct];
    const f = person[view];
    const s = moving && !air ? f.walk[stride] : blink ? f.blink : f.idle;
    const x = BODY.fx, y = BODY.fy;
    g.clearRect(0, 0, BODY.w, BODY.h);
    // Hands: up in the air on a hop, otherwise at the sides, swinging on a walk.
    // In profile only the near hand shows, ahead of the body.
    const cy = y - PERSON_SHOULDER + bob;
    const swing = moving && !air ? [0, 1, 0, -1][stride] : 0;
    const dir = mirror ? -1 : 1;
    const hands = air
      ? [[x - 5, cy - 6], [x + 5, cy - 6]]
      : view === 'e'
        ? [[x + dir * (3 + swing), cy + 2]]
        : [[x - 5, cy + 2 + swing], [x + 5, cy + 2 - swing]];
    const img = mirror ? s.left : s.right;
    const behind = view === 'n' && !air; // seen from behind, the body hides the hands
    if (!behind) g.drawImage(img, x - (s.w >> 1), y - s.h + 1 + bob);
    for (const [hx, hy] of hands) fist(hx, hy);
    if (behind) g.drawImage(img, x - (s.w >> 1), y - s.h + 1 + bob);
  };

  // Shadow on the ground, smaller while in the air.
  const paintShadow = () => {
    const w = Math.round(10 * Math.max(0.5, 1 - me.z / (24 * S)));
    if (w === shadowW) return;
    shadowW = w;
    const x = SHADOW_W / 2;
    gs.clearRect(0, 0, SHADOW_W, 3);
    gs.fillStyle = SHADOW;
    gs.fillRect(x - (w >> 1) + 1, 0, w - 2, 1);
    gs.fillRect(x - (w >> 1), 1, w, 1);
    gs.fillRect(x - (w >> 1) + 1, 2, w - 2, 1);
  };

  const draw = (moving: boolean) => {
    paintBody(moving);
    paintShadow();
    root.style.transform = `translate3d(${snap(me.x)}px, ${snap(me.y)}px, 0)`;
    body.style.transform = me.z > 0 ? `translate3d(0, ${-snap(me.z)}px, 0)` : '';
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
