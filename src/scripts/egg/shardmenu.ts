// The start menu: three real shards of the broken page. As the page falls
// they peel out of the burst still showing it, flip once, and turn to clear
// glass with their label lettered on, hanging over the arcade. Through them
// you see the game behind, bent by the glass. They lean toward the cursor,
// burst when chosen, and on the way out fly home so the page reassembles.
//
// Every shard is built from wedge fragments that tile it exactly, so the same
// geometry can fly apart; at rest it's drawn in one piece.
import { burst, tone } from './audio';
import { fit, perspective, prewarmKit, takeKit } from './shards3d';

type Pt = { x: number; y: number };

export interface MenuItem {
  id: string;
  label: string;
  hint?: string;
}

/** Where the shards came from: their outlines on screen and the page they showed. */
export interface ShardSource {
  polys: Pt[][];
  snap: HTMLCanvasElement;
}

/** What's behind the glass: the game canvas and where it sits. */
export interface Backdrop {
  canvas: HTMLCanvasElement;
  rect: () => DOMRect;
}

export interface ShardMenu {
  readonly visible: boolean;
  /** Fly in: out of the page (first time) or up from below. */
  show(): void;
  /** Burst the chosen shard and send the rest away. */
  pick(id: string): Promise<void>;
  /** Send them all away without a choice (e.g. for the help card). */
  hide(): Promise<void>;
  /** Fly back to where they were in the page, turning back into it. */
  home(): Promise<void>;
  /** Mirror keyboard focus from the real buttons underneath. */
  focus(id: string | null): void;
  destroy(): void;
}

const THICKNESS = 5;
const FOV = (35 * Math.PI) / 180;
const GRAVITY = 1400;
const FLOATS = 12; // per vertex

const VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec2 aUvPage;
attribute vec2 aUvLabel;
attribute float aKind;
attribute float aEdge;
uniform mat4 uProj;
uniform mat4 uModel;
varying vec2 vUvPage;
varying vec2 vUvLabel;
varying vec3 vNormal;
varying vec3 vPos;
varying float vKind;
varying float vEdge;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vPos = world.xyz;
  vNormal = (uModel * vec4(aNormal, 0.0)).xyz;
  vUvPage = aUvPage;
  vUvLabel = aUvLabel;
  vKind = aKind;
  vEdge = aEdge;
  gl_Position = uProj * world;
}`;

// Clear glass: refract what's behind (offset by the tilt and pulled inward at
// the bevelled rim, a little apart per channel), tint it faintly green, darken
// the thick rim, add a Fresnel sheen and highlights, then the lettering.
// uMix crossfades from the page the shard was cut from (0) to glass (1).
const FRAG = `
precision mediump float;
uniform sampler2D uPage;
uniform sampler2D uLabel;
uniform sampler2D uBack;
uniform vec4 uFrame; // the game's rect on screen, as uv: x0, y0, x1, y1
uniform vec2 uRes;
uniform vec2 uCenter;
uniform vec3 uLight;
uniform vec3 uEye;
uniform float uMix;
uniform float uGlow;
uniform float uAlpha;
uniform float uShadow;
varying vec2 vUvPage;
varying vec2 vUvLabel;
varying vec3 vNormal;
varying vec3 vPos;
varying float vKind;
varying float vEdge;
// Behind the glass: the live game inside its frame, the paper everywhere else.
vec4 backAt(vec2 p) {
  vec2 f = (p - uFrame.xy) / (uFrame.zw - uFrame.xy);
  vec4 paper = vec4(0.965, 0.961, 0.945, 1.0);
  if (f.x < 0.0 || f.y < 0.0 || f.x > 1.0 || f.y > 1.0) return paper;
  return texture2D(uBack, f);
}
void main() {
  if (uShadow > 0.5) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.07 * uAlpha * uMix);
    return;
  }
  vec3 n = normalize(vNormal);
  vec3 v = normalize(uEye - vPos);
  if (dot(n, v) < 0.0) n = -n;
  vec3 l = normalize(uLight);
  vec3 h = normalize(l + v);
  float ndv = max(dot(n, v), 0.0);
  float nh = max(dot(n, h), 0.0);
  float spec = pow(nh, 90.0) * 1.1 + pow(nh, 12.0) * 0.1;
  float fresnel = pow(1.0 - ndv, 3.0);

  vec2 suv = vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y);
  float rim = 1.0 - smoothstep(0.0, 0.16, vEdge);
  vec2 bend = n.xy * vec2(0.05, -0.05) - (suv - uCenter) * rim * 0.09;
  vec3 seen = vec3(
    backAt(suv + bend * 1.08).r,
    backAt(suv + bend).g,
    backAt(suv + bend * 0.92).b
  );

  vec3 glass;
  if (vKind > 1.5) {
    // The cut edge: thick, green, catching the light.
    glass = seen * vec3(0.58, 0.72, 0.68) + spec * 0.8 + 0.06;
  } else {
    glass = seen * vec3(0.94, 0.975, 0.962);
    glass *= 1.0 - rim * 0.28;
    glass += (1.0 - smoothstep(0.0, 0.03, vEdge)) * 0.35; // the bright lip of the edge
    glass += fresnel * 0.35 + spec;
    vec4 ink = texture2D(uLabel, vUvLabel);
    glass = glass * (1.0 - ink.a) + ink.rgb;
    glass += uGlow;
  }
  vec3 page = texture2D(uPage, vUvPage).rgb;
  if (vKind > 1.5) page = page * 0.7;
  vec3 color = mix(page, glass, uMix);
  gl_FragColor = vec4(color, 1.0) * uAlpha;
}`;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (p: number) => p * p * (3 - 2 * p);
const easeInOut = (p: number) => 0.5 - Math.cos(Math.PI * p) / 2;
const wrap = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

// ── Column-major 4×4 ──
type M4 = Float32Array;
const ident = (): M4 => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function mul(a: M4, b: M4): M4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}
const translate = (x: number, y: number, z: number): M4 => {
  const m = ident();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
};
const scaleM = (s: number): M4 => {
  const m = ident();
  m[0] = m[5] = m[10] = s;
  return m;
};
function rot(axis: 'x' | 'y' | 'z', a: number): M4 {
  const m = ident();
  const c = Math.cos(a);
  const s = Math.sin(a);
  if (axis === 'x') [m[5], m[6], m[9], m[10]] = [c, s, -s, c];
  else if (axis === 'y') [m[0], m[2], m[8], m[10]] = [c, -s, s, c];
  else [m[0], m[1], m[4], m[5]] = [c, s, -s, c];
  return m;
}
function axisAngle(x: number, y: number, z: number, a: number): M4 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const t = 1 - c;
  return new Float32Array([
    t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0,
    0, 0, 0, 1,
  ]);
}

function areaOf(p: Pt[]) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

function centroid(p: Pt[]): Pt {
  const a = areaOf(p) || 1;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i];
    const r = p[(i + 1) % p.length];
    const k = q.x * r.y - r.x * q.y;
    cx += (q.x + r.x) * k;
    cy += (q.y + r.y) * k;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

const turn = (p: Pt, a: number): Pt => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });

/** The rotation that lays a shard's long axis flat, and its size that way. */
function lieFlat(world: Pt[]) {
  let best = { a: 0, w: 1, h: 1, ratio: 0 };
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI;
    const r = world.map((p) => turn(p, a));
    const xs = r.map((p) => p.x);
    const ys = r.map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    if (w / h > best.ratio) best = { a, w, h, ratio: w / h };
  }
  return best;
}

/** A broken-glass outline around a w×h label, for when there's no page to cut from. */
function outline(w: number, h: number): Pt[] {
  const hw = w / 2;
  const hh = h / 2;
  return [
    { x: -hw - rand(8, 20), y: rand(-hh * 0.3, hh * 0.3) },
    { x: -hw + rand(0, 14), y: -hh - rand(2, 8) },
    { x: rand(-w * 0.18, w * 0.05), y: -hh - rand(-2, 6) },
    { x: hw - rand(0, 16), y: -hh + rand(-4, 4) },
    { x: hw + rand(6, 18), y: rand(-hh * 0.35, hh * 0.25) },
    { x: hw - rand(2, 14), y: hh + rand(2, 8) },
    { x: rand(-w * 0.05, w * 0.2), y: hh + rand(-2, 5) },
    { x: -hw + rand(4, 18), y: hh - rand(-2, 4) },
  ];
}

interface Range {
  first: number;
  count: number;
}

interface Frag extends Range {
  cx: number;
  cy: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ax: number;
  ay: number;
  az: number;
  angle: number;
  spin: number;
}

type Pose = { x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number; mix: number };

interface Shard {
  item: MenuItem;
  local: Pt[]; // outline in world units around the centroid, y up
  whole: Range;
  frags: Frag[];
  label: WebGLTexture;
  rest: Pose; // where it was in the page
  flat: number; // rotation that lays it level as a button
  size: number; // scale that makes it button-sized
  hw: number; // half extents as a button, CSS px
  hh: number;
  cur: Pose;
  from: Pose; // for scripted flights
  t: number; // flight progress
  dur: number;
  delay: number;
  state: 'hidden' | 'rest' | 'peel' | 'idle' | 'out' | 'burst' | 'home';
  alpha: number;
  hover: number;
  seed: number;
}

export const prewarmMenu = () => prewarmKit('menu', VERT, FRAG);

export function createShardMenu(
  host: HTMLElement,
  items: MenuItem[],
  anchor: () => DOMRect,
  backdrop: Backdrop,
  onPick: (id: string) => void,
  source?: ShardSource,
): ShardMenu | null {
  const kit = takeKit('menu', VERT, FRAG);
  if (!kit) return null;
  const { canvas, gl, program } = kit;
  canvas.className = 'ea-shards';
  canvas.setAttribute('aria-hidden', 'true');
  gl.useProgram(program);
  host.appendChild(canvas);

  const u = (n: string) => gl.getUniformLocation(program, n);
  const uModel = u('uModel');
  const uGlow = u('uGlow');
  const uAlpha = u('uAlpha');
  const uShadow = u('uShadow');
  const uMix = u('uMix');
  const uCenter = u('uCenter');
  gl.uniform3f(u('uLight'), -0.45, 0.65, 1);
  gl.uniform1i(u('uPage'), 0);
  gl.uniform1i(u('uLabel'), 1);
  gl.uniform1i(u('uBack'), 2);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const makeTex = (unit: number) => {
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };

  // ── Viewport, camera ──
  let W = 0;
  let H = 0;
  let projM = ident();
  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // full-screen and antialiased: keep it light
    W = innerWidth;
    H = innerHeight;
    fit(canvas, Math.round(W * dpr), Math.round(H * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    const D = H / 2 / Math.tan(FOV / 2);
    const proj = perspective(FOV, W / H, 10, D * 4);
    proj[14] += proj[10] * -D; // camera at z = D looking down -z
    proj[15] += proj[11] * -D;
    gl.uniformMatrix4fv(u('uProj'), false, proj);
    gl.uniform3f(u('uEye'), 0, 0, D);
    gl.uniform2f(u('uRes'), canvas.width, canvas.height);
    projM = proj;
  };
  size();

  // ── Textures: the page (unit 0), each label (unit 1), the backdrop (unit 2) ──
  // Only the patch of page under these shards: a crop, not the whole snapshot.
  makeTex(0);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  const crop = { x: 0, y: 0, w: 1, h: 1 }; // in CSS px
  if (source) {
    const all = source.polys.flat();
    crop.x = Math.max(0, Math.floor(Math.min(...all.map((p) => p.x))));
    crop.y = Math.max(0, Math.floor(Math.min(...all.map((p) => p.y))));
    crop.w = Math.min(innerWidth, Math.ceil(Math.max(...all.map((p) => p.x)))) - crop.x || 1;
    crop.h = Math.min(innerHeight, Math.ceil(Math.max(...all.map((p) => p.y)))) - crop.y || 1;
    const k = source.snap.width / innerWidth;
    const pc = document.createElement('canvas');
    pc.width = Math.max(1, Math.round(crop.w * k));
    pc.height = Math.max(1, Math.round(crop.h * k));
    pc.getContext('2d')!.drawImage(source.snap, crop.x * k, crop.y * k, pc.width, pc.height, 0, 0, pc.width, pc.height);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pc);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([246, 245, 241, 255]));
  }
  const backTex = makeTex(2);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); // pixel art stays crisp
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const uFrame = u('uFrame');
  // The game at its native resolution: a few hundred KB a refresh, not a
  // full-screen copy. The game moves at pixel steps, so 30 Hz is plenty.
  const back = document.createElement('canvas');
  back.width = 320;
  back.height = 184;
  const backCtx = back.getContext('2d', { willReadFrequently: false })!;
  backCtx.imageSmoothingEnabled = false;
  let backAt = -1;
  const paintBackdrop = (now: number) => {
    const r = backdrop.rect();
    gl.uniform4f(uFrame, r.left / W, r.top / H, r.right / W, r.bottom / H);
    if (now - backAt < 32) return;
    backAt = now;
    backCtx.drawImage(backdrop.canvas, 0, 0, back.width, back.height);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, backTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, back);
  };

  // ── Geometry ──
  const frame0 = anchor();
  const btnW = Math.max(150, Math.min(290, frame0.width * 0.48));
  const btnH = Math.round(btnW * 0.24);
  const touch = window.matchMedia('(pointer: coarse)').matches; // no keyboard hints there

  const data: number[] = [];
  const push = (p: Pt, z: number, nx: number, ny: number, nz: number, pu: number, pv: number, lu: number, lv: number, kind: number, edge: number) =>
    data.push(p.x, p.y, z, nx, ny, nz, pu, pv, lu, lv, kind, edge);

  const shards: Shard[] = items.map((item, i) => {
    // Outline: a real cut from the page, or a made-up one.
    const screen = source?.polys[i];
    let local: Pt[];
    let rest: Pose;
    if (screen) {
      const c = centroid(screen);
      local = screen.map((p) => ({ x: p.x - c.x, y: -(p.y - c.y) }));
      rest = { x: c.x - W / 2, y: H / 2 - c.y, z: 0, rx: 0, ry: 0, rz: 0, s: 1, mix: 0 };
    } else {
      local = outline(btnW, btnH).map((p) => ({ x: p.x, y: -p.y }));
      rest = { x: 0, y: -H, z: 0, rx: 0, ry: 0, rz: 0, s: 1, mix: 1 };
    }
    if (areaOf(local) < 0) local.reverse();
    const lay = lieFlat(local);
    const flat = lay.a; // world rotation that levels it (turn() is the same rotation)
    const size = Math.min(btnW / lay.w, (btnH * 1.35) / lay.h);
    const level = local.map((p) => turn(p, lay.a)); // as it hangs, before scaling
    const xs = level.map((p) => p.x);
    const ys = level.map((p) => p.y);
    const bx0 = Math.min(...xs);
    const by1 = Math.max(...ys);
    const lw = Math.max(...xs) - bx0;
    const lh = by1 - Math.min(...ys);
    const labelUv = (p: Pt) => {
      const q = turn(p, lay.a);
      return [(q.x - bx0) / lw, (by1 - q.y) / lh];
    };
    const pageUv = (p: Pt) => [(rest.x + p.x + W / 2 - crop.x) / crop.w, (H / 2 - (rest.y + p.y) - crop.y) / crop.h];

    // Slab pieces. Fans from the centroid: aEdge is 1 there and 0 on the rim.
    const o = { x: 0, y: 0 };
    const slab = (tris: [Pt, Pt][], rimOnly: boolean): Range => {
      const first = data.length / FLOATS;
      const face = (z: number, nz: number, kind: number) => {
        for (const [a, b] of tris) {
          for (const [p, e] of [[o, 1], [a, 0], [b, 0]] as const) {
            const [pu, pv] = pageUv(p);
            const [lu, lv] = labelUv(p);
            push(p, z, 0, 0, nz, pu, pv, lu, lv, kind, e);
          }
        }
      };
      // Drawn without a depth buffer, so in painter's order: back, edges, face.
      face(-THICKNESS, -1, 1);
      for (const [a, b] of tris) {
        const sides: [Pt, Pt][] = rimOnly ? [[a, b]] : [[a, b], [o, a], [b, o]];
        for (const [p, q] of sides) {
          const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
          const nx = (q.y - p.y) / l;
          const ny = -(q.x - p.x) / l;
          const [pu, pv] = pageUv(p);
          const [qu, qv] = pageUv(q);
          const quad: [Pt, number, number, number][] = [
            [p, 0, pu, pv], [q, 0, qu, qv], [q, -THICKNESS, qu, qv],
            [p, 0, pu, pv], [q, -THICKNESS, qu, qv], [p, -THICKNESS, pu, pv],
          ];
          for (const [pt, z, uu, vv] of quad) push(pt, z, nx, ny, 0, uu, vv, 0, 0, 2, 0);
        }
      }
      face(0, 1, 0);
      return { first, count: data.length / FLOATS - first };
    };

    const rim: [Pt, Pt][] = local.map((a, k) => [a, local[(k + 1) % local.length]]);
    const whole = slab(rim, true);
    const frags: Frag[] = [];
    for (const [a, b] of rim) {
      const t = rand(0.35, 0.65);
      const m = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      for (const [p, q] of [[a, m], [m, b]] as const) {
        const r = slab([[p, q]], false);
        frags.push({ ...r, cx: (p.x + q.x) / 3, cy: (p.y + q.y) / 3, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 1, angle: 0, spin: 0 });
      }
    }

    // The lettering, drawn at the size it will hang at.
    const k = size * Math.min(window.devicePixelRatio || 1, 2);
    const tc = document.createElement('canvas');
    tc.width = Math.max(2, Math.ceil(lw * k));
    tc.height = Math.max(2, Math.ceil(lh * k));
    const g = tc.getContext('2d')!;
    g.scale(k, k);
    // Where the label sits: the run across the middle of the level outline.
    const midY = by1 - lh / 2;
    const run: number[] = [];
    level.forEach((p, n) => {
      const q = level[(n + 1) % level.length];
      if ((p.y - midY) * (q.y - midY) <= 0 && p.y !== q.y) run.push(p.x + ((midY - p.y) * (q.x - p.x)) / (q.y - p.y));
    });
    const left = (run.length ? Math.min(...run) : bx0) - bx0;
    const right = (run.length ? Math.max(...run) : bx0 + lw) - bx0;
    const hint = touch ? undefined : item.hint;
    const hintFont = `500 ${9 / size}px "JetBrains Mono", monospace`;
    g.font = hintFont;
    const hintW = hint ? g.measureText(hint.toUpperCase()).width + 8 / size : 0;
    const room = (right - left) * 0.84 - hintW;
    let fs = Math.min(btnH * 0.4, lh * size * 0.5) / size;
    const font = () => `400 ${fs}px Fraunces, Georgia, serif`;
    g.font = font();
    while (fs * size > 9 && g.measureText(item.label).width > room) {
      fs *= 0.95;
      g.font = font();
    }
    const labelW = g.measureText(item.label).width;
    const x0 = (left + right) / 2 - (labelW + hintW) / 2;
    const cy = lh / 2 + fs * 0.05;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    // A faint light halo keeps the letters clear over dark things behind.
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (const [dx, dy] of [[-0.6, 0], [0.6, 0], [0, -0.6], [0, 0.6]]) g.fillText(item.label, x0 + dx / size, cy + dy / size);
    g.fillStyle = 'rgba(17,17,17,0.92)';
    g.fillText(item.label, x0, cy);
    if (hint) {
      g.font = hintFont;
      g.fillStyle = 'rgba(17,17,17,0.55)';
      g.fillText(hint.toUpperCase(), x0 + labelW + 8 / size, cy);
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const label = makeTex(1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tc);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    const shard: Shard = {
      item, local, whole, frags, label, rest, flat, size,
      hw: (lw * size) / 2,
      hh: (lh * size) / 2,
      cur: { ...rest },
      from: { ...rest },
      t: 0,
      dur: 1,
      delay: 0,
      state: source ? 'rest' : 'hidden',
      alpha: 1,
      hover: 0,
      seed: rand(0, 10),
    };
    return shard;
  });

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  const attr = (name: string, n: number, offset: number) => {
    const loc = gl.getAttribLocation(program, name);
    if (loc < 0) return;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, n, gl.FLOAT, false, FLOATS * 4, offset * 4);
  };
  attr('aPos', 3, 0);
  attr('aNormal', 3, 3);
  attr('aUvPage', 2, 6);
  attr('aUvLabel', 2, 8);
  attr('aKind', 1, 10);
  attr('aEdge', 1, 11);

  // ── Layout: stacked over the middle of the game frame ──
  const SWAY = [-0.04, 0.035, -0.02];
  const DX = [-12, 16, -6];
  // Real shards come in different heights, so stack them by their own size.
  let frameRect = anchor(); // measured once per frame, not once per shard
  const slot = (i: number): Pose => {
    const s = shards[i];
    const r = frameRect;
    const gap = Math.min(16, r.height * 0.05);
    const total = shards.reduce((t, x) => t + x.hh * 2, 0) + gap * (shards.length - 1);
    let top = r.top + r.height / 2 - total / 2;
    for (let k = 0; k < i; k++) top += shards[k].hh * 2 + gap;
    const sx = r.left + r.width / 2 + DX[i % 3];
    const sy = top + s.hh;
    return { x: sx - W / 2, y: H / 2 - sy, z: 0, rx: 0, ry: 0, rz: s.flat + SWAY[i % 3], s: s.size, mix: 1 };
  };
  const below = (s: Shard, i: number): Pose => ({ ...slot(i), y: -H / 2 - 140, z: -60, rx: rand(-1.4, 1.4), ry: rand(-1.4, 1.4), rz: s.flat + rand(-1, 1) });

  // ── Picking: project each shard's outline and test the pointer ──
  let pointer: Pt | null = null;
  let focused: string | null = null;
  let busy = false;
  const model = (p: Pose): M4 =>
    mul(translate(p.x, p.y, p.z), mul(rot('z', p.rz), mul(rot('y', p.ry), mul(rot('x', p.rx), scaleM(p.s)))));
  const project = (m: M4, x: number, y: number): Pt => {
    const wx = m[0] * x + m[4] * y + m[12];
    const wy = m[1] * x + m[5] * y + m[13];
    const wz = m[2] * x + m[6] * y + m[14];
    const cx = projM[0] * wx + projM[8] * wz + projM[12];
    const cy = projM[5] * wy + projM[9] * wz + projM[13];
    const cw = projM[11] * wz + projM[15];
    return { x: ((cx / cw + 1) / 2) * W, y: ((1 - cy / cw) / 2) * H };
  };
  const inside = (pt: Pt, poly: Pt[]) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  };
  const shardAt = (pt: Pt): Shard | null => {
    for (const s of shards) {
      if (s.state !== 'idle') continue;
      const m = model(s.cur);
      if (inside(pt, s.local.map((p) => project(m, p.x, p.y)))) return s;
    }
    return null;
  };

  const onMove = (e: PointerEvent) => {
    pointer = { x: e.clientX, y: e.clientY };
    host.classList.toggle('is-over-shard', !busy && !!shardAt(pointer));
  };
  const onClick = (e: MouseEvent) => {
    if (busy) return;
    const hit = shardAt({ x: e.clientX, y: e.clientY });
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();
    onPick(hit.item.id);
  };
  host.addEventListener('pointermove', onMove);
  host.addEventListener('click', onClick, true);
  window.addEventListener('resize', size);

  // ── Motion ──
  const lerpPose = (a: Pose, b: Pose, e: number): Pose => {
    const o = {} as Pose;
    for (const k of Object.keys(a) as (keyof Pose)[]) o[k] = a[k] + (b[k] - a[k]) * e;
    return o;
  };
  const fly = (s: Shard, state: Shard['state'], dur: number, delay = 0) => {
    s.from = { ...s.cur };
    s.state = state;
    s.t = 0;
    s.dur = dur;
    s.delay = delay;
  };

  let raf = 0;
  let last = performance.now();
  let clock = 0;
  const draw = (m: M4, r: Range, shadow: boolean) => {
    gl.uniformMatrix4fv(uModel, false, m);
    gl.uniform1f(uShadow, shadow ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, r.first, r.count);
  };

  const render = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    clock += dt;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    frameRect = anchor();
    paintBackdrop(now);
    let live = false;

    shards.forEach((s, i) => {
      if (s.state === 'hidden') return;
      live = true;
      if (s.delay > 0) {
        s.delay -= dt;
      } else if (s.state === 'peel') {
        // Out of the page and into the menu, taking its time: it lifts toward
        // the viewer, turns over slowly while it becomes glass, hangs at the
        // top of its arc, then glides down into place and settles.
        s.t = Math.min(1, s.t + dt / s.dur);
        const e = easeInOutCubic(s.t);
        const arc = Math.sin(Math.PI * s.t);
        s.cur = lerpPose(s.from, slot(i), e);
        s.cur.z += arc ** 1.4 * 320;
        s.cur.ry += Math.PI * 2 * easeInOut(s.t) * (i % 2 ? -1 : 1);
        s.cur.rx += arc * 0.45 * (i % 2 ? 1 : -1);
        s.cur.mix = s.from.mix + (1 - s.from.mix) * smooth(clamp((s.t - 0.28) / 0.34, 0, 1));
        if (s.t >= 1) {
          s.state = 'idle';
          // The flight ends a whole turn round; call that zero, or the idle
          // easing would unwind it as a spin after landing.
          s.cur.rx = wrap(s.cur.rx);
          s.cur.ry = wrap(s.cur.ry);
          s.cur.rz = s.flat + wrap(s.cur.rz - s.flat);
          s.cur.z = -14; // a little dip as it lands; idle eases it back
          tone(1568 + i * 196, 1568 + i * 196, 0.5, 0.03, 'sine');
          tone(3136 + i * 392, 2800, 0.12, 0.015, 'triangle', 0.02);
        }
      } else if (s.state === 'home') {
        // Back into the page, with one full flip.
        s.t = Math.min(1, s.t + dt / s.dur);
        const e = easeInOut(s.t);
        s.cur = lerpPose(s.from, s.rest, e);
        s.cur.z += Math.sin(Math.PI * s.t) * 150;
        s.cur.mix = s.from.mix * (1 - smooth(clamp((s.t - 0.2) / 0.6, 0, 1)));
        for (const f of s.frags) {
          const k = 1 - Math.min(1, dt * 6);
          f.x *= k;
          f.y *= k;
          f.z *= k;
          f.angle *= k;
        }
        if (s.t >= 1) s.state = 'rest';
      } else if (s.state === 'idle') {
        // Hang with a slow bob; lean toward the pointer when it's on them.
        const home = slot(i);
        const hot = !busy && ((pointer && shardAt(pointer) === s) || focused === s.item.id);
        s.hover += ((hot ? 1 : 0) - s.hover) * (1 - Math.exp(-10 * dt));
        let lx = 0;
        let ly = 0;
        if (pointer && s.hover > 0.01) {
          lx = clamp((pointer.x - (home.x + W / 2)) / s.hw, -1, 1);
          ly = clamp((pointer.y - (H / 2 - home.y)) / s.hh, -1, 1);
        }
        const tgt: Pose = {
          ...home,
          y: home.y + Math.sin(clock * 1.3 + s.seed) * 3,
          z: s.hover * 28,
          rx: Math.sin(clock * 0.9 + s.seed) * 0.06 + ly * 0.32 * s.hover,
          ry: Math.cos(clock * 0.7 + s.seed) * 0.08 + lx * 0.4 * s.hover,
          rz: home.rz + Math.sin(clock * 0.6 + s.seed) * 0.015,
          s: home.s * (1 + s.hover * 0.04),
        };
        s.cur = lerpPose(s.cur, tgt, 1 - Math.exp(-9 * dt));
      } else if (s.state === 'out') {
        s.t = Math.min(1, s.t + dt / s.dur);
        s.cur = lerpPose(s.from, below(s, i), easeInOut(s.t));
        s.alpha = 1 - s.t;
        if (s.t >= 1) s.state = 'hidden';
      } else if (s.state === 'burst') {
        for (const f of s.frags) {
          f.vy -= GRAVITY * dt;
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          f.z += f.vz * dt;
          f.angle += f.spin * dt;
        }
        s.alpha = Math.max(0, s.alpha - dt * 1.5);
        if (s.alpha <= 0) s.state = 'hidden';
      }

      const m = model(s.cur);
      const c = project(m, 0, 0);
      gl.uniform2f(uCenter, c.x / W, c.y / H);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, s.label);
      gl.uniform1f(uAlpha, s.alpha);
      gl.uniform1f(uMix, s.cur.mix);
      gl.uniform1f(uGlow, s.hover * 0.04);
      const apart = s.frags.some((f) => Math.abs(f.angle) > 0.01 || Math.abs(f.x) > 0.5);
      if (s.state === 'burst' || apart) {
        for (const f of s.frags) {
          draw(mul(m, mul(translate(f.cx + f.x, f.cy + f.y, f.z), mul(axisAngle(f.ax, f.ay, f.az, f.angle), translate(-f.cx, -f.cy, 0)))), f, false);
        }
      } else {
        if (s.cur.mix > 0.01) draw(mul(translate(12, -16, -70 + s.cur.z * 0.4), m), s.whole, true);
        draw(m, s.whole, false);
      }
    });

    raf = live ? requestAnimationFrame(render) : 0;
  };
  const run = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(render);
  };

  const api: ShardMenu = {
    get visible() {
      return shards.some((s) => s.state === 'peel' || s.state === 'idle');
    },

    show() {
      busy = false;
      shards.forEach((s, i) => {
        s.alpha = 1;
        s.hover = 0;
        for (const f of s.frags) Object.assign(f, { x: 0, y: 0, z: 0, angle: 0 });
        if (s.state === 'rest') {
          fly(s, 'peel', 2.8, 0.35 + i * 0.4); // peel out of the page as it falls
        } else {
          s.cur = { ...below(s, i), mix: 1 };
          fly(s, 'peel', 1.4, 0.05 + i * 0.18);
        }
      });
      // Draw the first frame now: at the instant of the break the rest of the
      // page is already in place, and these pieces must be too.
      cancelAnimationFrame(raf);
      last = performance.now();
      render(last);
    },

    pick(id: string) {
      busy = true;
      host.classList.remove('is-over-shard');
      shards.forEach((s) => {
        if (s.item.id !== id) return fly(s, 'out', 0.45);
        s.state = 'burst';
        for (const f of s.frags) {
          const d = Math.hypot(f.cx, f.cy) || 1;
          const sp = rand(140, 300);
          let ax = rand(-1, 1);
          let ay = rand(-1, 1);
          let az = rand(-0.5, 0.5);
          const l = Math.hypot(ax, ay, az) || 1;
          [ax, ay, az] = [ax / l, ay / l, az / l];
          Object.assign(f, { vx: (f.cx / d) * sp, vy: (f.cy / d) * sp + rand(60, 200), vz: rand(120, 320), ax, ay, az, spin: rand(5, 12) * (Math.random() < 0.5 ? -1 : 1) });
        }
      });
      burst(0.4, 2600, 0.5);
      for (let k = 0; k < 4; k++) tone(rand(2400, 4200), rand(1800, 3000), 0.1, 0.035, 'sine', 0.03 + k * 0.06);
      run();
      return new Promise((r) => setTimeout(r, 420));
    },

    hide() {
      busy = true;
      shards.forEach((s) => s.state !== 'hidden' && fly(s, 'out', 0.4));
      run();
      return new Promise((r) => setTimeout(r, 380));
    },

    home() {
      busy = true;
      host.classList.remove('is-over-shard');
      if (!source) return api.hide();
      shards.forEach((s, i) => {
        s.alpha = 1;
        if (s.state === 'hidden' || s.state === 'out') {
          // Out of view: come back up from below, reassembling on the way.
          for (const f of s.frags) Object.assign(f, { x: 0, y: 0, z: 0, angle: 0 });
          s.cur = { ...below(s, i), mix: 1 };
        } else if (s.state === 'burst') {
          s.cur = { ...s.cur, z: 80 };
        }
        fly(s, 'home', 0.95, i * 0.05);
      });
      run();
      return new Promise((r) => setTimeout(r, 1150));
    },

    focus(id: string | null) {
      focused = id;
      run();
    },

    destroy() {
      cancelAnimationFrame(raf);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('click', onClick, true);
      window.removeEventListener('resize', size);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    },
  };
  return api;
}
