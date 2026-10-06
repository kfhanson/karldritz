// The start menu: shards of the broken page that never fell. Each is a slab
// of frosted glass with its label etched in, hanging in 3D over the arcade.
// They lean toward the cursor, catch the light, and burst when chosen.
//
// Every shard is built from wedge fragments that tile it exactly, so at rest
// it's one piece and on a click the same geometry flies apart.
import { burst, tone } from './audio';
import { compile, perspective } from './shards3d';

type Pt = { x: number; y: number };

export interface MenuItem {
  id: string;
  label: string;
  hint?: string;
}

export interface ShardMenu {
  readonly visible: boolean;
  /** Fly the shards in, from a point on screen (the impact) or from below. */
  show(from?: Pt): void;
  /** Burst the chosen shard and send the rest away. */
  pick(id: string): Promise<void>;
  /** Send them all away without a choice (e.g. for the help card). */
  hide(): Promise<void>;
  /** Mirror keyboard focus from the real buttons underneath. */
  focus(id: string | null): void;
  destroy(): void;
}

const THICKNESS = 4;
const FOV = (35 * Math.PI) / 180;
const GRAVITY = 1400;

const VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec2 aUv;
attribute float aKind;
uniform mat4 uProj;
uniform mat4 uModel;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPos;
varying float vKind;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vPos = world.xyz;
  vNormal = (uModel * vec4(aNormal, 0.0)).xyz;
  vUv = aUv;
  vKind = aKind;
  gl_Position = uProj * world;
}`;

// Premultiplied colour throughout. A shadow pass reuses the same geometry.
const FRAG = `
precision mediump float;
uniform sampler2D uTex;
uniform vec3 uLight;
uniform vec3 uEye;
uniform float uGlow;
uniform float uAlpha;
uniform float uShadow;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPos;
varying float vKind;
void main() {
  if (uShadow > 0.5) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.14 * uAlpha);
    return;
  }
  vec3 n = normalize(vNormal);
  vec3 v = normalize(uEye - vPos);
  if (dot(n, v) < 0.0) n = -n;
  vec3 l = normalize(uLight);
  float diffuse = max(dot(n, l), 0.0);
  float spec = pow(max(dot(n, normalize(l + v)), 0.0), 36.0);
  vec4 c;
  if (vKind < 0.5) {
    c = texture2D(uTex, vUv);
    c.rgb += uGlow * c.a;
  } else if (vKind < 1.5) {
    c = texture2D(uTex, vUv) * 0.82;
  } else {
    c = vec4(vec3(0.70, 0.79, 0.76) * (0.6 + 0.4 * diffuse), 1.0);
  }
  c.rgb += spec * 0.55 * c.a;
  gl_FragColor = c * uAlpha;
}`;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

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
const scale = (s: number): M4 => {
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

/** A broken-glass outline around a w×h label: ragged edges, pointed ends. */
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

interface Frag {
  first: number;
  count: number;
  cx: number; // centroid, shard-local
  cy: number;
  // Burst motion, relative to the shard.
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

interface Shard {
  item: MenuItem;
  poly: Pt[];
  whole: { first: number; count: number }; // the unbroken slab

  w: number;
  h: number;
  tex: WebGLTexture;
  frags: Frag[];
  // Pose now, and where it's heading. World units: CSS px, origin mid-screen, y up.
  cur: { x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number };
  tgt: { x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number };
  delay: number;
  state: 'hidden' | 'in' | 'idle' | 'out' | 'burst';
  alpha: number;
  hover: number; // 0..1, eased
  seed: number;
}

export function createShardMenu(
  host: HTMLElement,
  items: MenuItem[],
  anchor: () => DOMRect,
  onPick: (id: string) => void,
): ShardMenu | null {
  const canvas = document.createElement('canvas');
  canvas.className = 'ea-shards';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true });
  if (!gl) return null;

  let program: WebGLProgram;
  try {
    program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  } catch (err) {
    console.warn('[egg] shard menu unavailable', err);
    return null;
  }
  gl.useProgram(program);
  host.appendChild(canvas);

  const u = (n: string) => gl.getUniformLocation(program, n);
  const uModel = u('uModel');
  const uGlow = u('uGlow');
  const uAlpha = u('uAlpha');
  const uShadow = u('uShadow');
  gl.uniform3f(u('uLight'), -0.45, 0.65, 1);
  gl.uniform1i(u('uTex'), 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

  // ── Sizes follow the game frame ──
  let W = 0;
  let H = 0;
  let D = 0;
  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    D = H / 2 / Math.tan(FOV / 2);
    const proj = perspective(FOV, W / H, 10, D * 4);
    proj[14] += proj[10] * -D; // camera at z = D looking down -z
    proj[15] += proj[11] * -D;
    gl.uniformMatrix4fv(u('uProj'), false, proj);
    gl.uniform3f(u('uEye'), 0, 0, D);
    projM = proj;
  };
  let projM = ident();
  size();

  const frame0 = anchor();
  const shardW = Math.max(150, Math.min(300, frame0.width * 0.5));
  const touch = window.matchMedia('(pointer: coarse)').matches; // no keyboard hints there
  const shardH = Math.round(shardW * 0.23);

  // ── Geometry: every fragment of every shard in one buffer ──
  const data: number[] = [];
  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number, uu: number, vv: number, k: number) =>
    data.push(x, y, z, nx, ny, nz, uu, vv, k);

  const shards: Shard[] = items.map((item, i) => {
    const w = shardW - i * 14;
    const h = shardH;
    const poly = outline(w, h);
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const bx = Math.min(...xs) - 2;
    const by = Math.min(...ys) - 2;
    const bw = Math.max(...xs) + 2 - bx;
    const bh = Math.max(...ys) + 2 - by;
    const uv = (p: Pt) => [(p.x - bx) / bw, (p.y - by) / bh];

    // Wedges from the centre, each edge split once more at a random point.
    const frags: Frag[] = [];
    const tri = (a: Pt, b: Pt) => {
      const first = data.length / 9;
      // Shard space is y-down like the screen; flip to world (y-up) here.
      const P = (p: Pt) => [p.x, -p.y];
      const o = { x: 0, y: 0 };
      // Drawn without a depth buffer, so in painter's order: back, edges, face.
      const face = (z: number, nz: number, kind: number) => {
        for (const p of [o, a, b]) {
          const [x, y] = P(p);
          const [uu, vv] = uv(p);
          push(x, y, z, 0, 0, nz, uu, vv, kind);
        }
      };
      face(-THICKNESS, -1, 1);
      // Its outer edge, plus the two inner ones (only seen when it flies apart).
      for (const [p, q] of [[a, b], [o, a], [b, o]] as const) {
        const [x1, y1] = P(p);
        const [x2, y2] = P(q);
        const l = Math.hypot(x2 - x1, y2 - y1) || 1;
        const nx = (y2 - y1) / l;
        const ny = -(x2 - x1) / l;
        push(x1, y1, 0, nx, ny, 0, 0, 0, 2);
        push(x2, y2, 0, nx, ny, 0, 0, 0, 2);
        push(x2, y2, -THICKNESS, nx, ny, 0, 0, 0, 2);
        push(x1, y1, 0, nx, ny, 0, 0, 0, 2);
        push(x2, y2, -THICKNESS, nx, ny, 0, 0, 0, 2);
        push(x1, y1, -THICKNESS, nx, ny, 0, 0, 0, 2);
      }
      face(0, 1, 0);
      const cx = (a.x + b.x) / 3;
      const cy = -(a.y + b.y) / 3;
      frags.push({ first, count: data.length / 9 - first, cx, cy, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 1, angle: 0, spin: 0 });
    };
    poly.forEach((a, k) => {
      const b = poly[(k + 1) % poly.length];
      const t = rand(0.35, 0.65);
      const m = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      tri(a, m);
      tri(m, b);
    });

    // The same slab in one piece, without the fragments' inner edges (which
    // would show as seams once it tilts).
    const wholeFirst = data.length / 9;
    {
      const P = (p: Pt) => [p.x, -p.y];
      const n = poly.length;
      const face = (z: number, nz: number, kind: number) => {
        for (let k = 0; k < n; k++) {
          for (const p of [{ x: 0, y: 0 }, poly[k], poly[(k + 1) % n]]) {
            const [x, y] = P(p);
            const [uu, vv] = uv(p);
            push(x, y, z, 0, 0, nz, uu, vv, kind);
          }
        }
      };
      face(-THICKNESS, -1, 1);
      for (let k = 0; k < n; k++) {
        const [x1, y1] = P(poly[k]);
        const [x2, y2] = P(poly[(k + 1) % n]);
        const l = Math.hypot(x2 - x1, y2 - y1) || 1;
        const nx = (y2 - y1) / l;
        const ny = -(x2 - x1) / l;
        push(x1, y1, 0, nx, ny, 0, 0, 0, 2);
        push(x2, y2, 0, nx, ny, 0, 0, 0, 2);
        push(x2, y2, -THICKNESS, nx, ny, 0, 0, 0, 2);
        push(x1, y1, 0, nx, ny, 0, 0, 0, 2);
        push(x2, y2, -THICKNESS, nx, ny, 0, 0, 0, 2);
        push(x1, y1, -THICKNESS, nx, ny, 0, 0, 0, 2);
      }
      face(0, 1, 0);
    }
    const whole = { first: wholeFirst, count: data.length / 9 - wholeFirst };

    // The etched label: frosted glass, a bright inner edge, the words.
    const tc = document.createElement('canvas');
    const k = 2;
    tc.width = Math.ceil(bw * k);
    tc.height = Math.ceil(bh * k);
    const g = tc.getContext('2d')!;
    g.scale(k, k);
    g.translate(-bx, -by);
    g.beginPath();
    poly.forEach((p, n) => (n ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    const grad = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.55, 'rgba(244,246,243,0.82)');
    grad.addColorStop(1, 'rgba(226,233,230,0.86)');
    g.fillStyle = grad;
    g.fill();
    g.save();
    g.clip();
    for (let n = 0; n < 140; n++) {
      g.fillStyle = `rgba(255,255,255,${rand(0.1, 0.35).toFixed(2)})`;
      g.fillRect(rand(bx, bx + bw), rand(by, by + bh), 1, 1); // frost
    }
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 3;
    g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(17,17,17,0.28)';
    g.lineWidth = 1;
    g.stroke();
    const hint = touch ? undefined : item.hint;
    const hintW = hint ? 34 : 0;
    // As large as fits between the shard's ends.
    let fs = Math.round(h * 0.42);
    const font = () => `400 ${fs}px Fraunces, Georgia, serif`;
    g.font = font();
    while (fs > 10 && g.measureText(item.label).width > w - hintW - 26) {
      fs--;
      g.font = font();
    }
    g.fillStyle = '#111111';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillText(item.label, -hintW / 2, 1);
    if (hint) {
      g.font = `500 9px "JetBrains Mono", monospace`;
      g.fillStyle = 'rgba(17,17,17,0.5)';
      g.textAlign = 'left';
      g.fillText(hint.toUpperCase(), w / 2 - hintW + 2, 1);
    }

    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tc);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const pose = { x: 0, y: -H, z: 0, rx: 0, ry: 0, rz: 0, s: 1 };
    return { item, poly, whole, w, h, tex, frags, cur: { ...pose }, tgt: { ...pose }, delay: 0, state: 'hidden', alpha: 1, hover: 0, seed: rand(0, 10) };
  });

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  const attr = (name: string, n: number, offset: number) => {
    const loc = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 36, offset * 4);
  };
  attr('aPos', 3, 0);
  attr('aNormal', 3, 3);
  attr('aUv', 2, 6);
  attr('aKind', 1, 8);

  // ── Layout: stacked over the middle of the game frame ──
  const SWAY = [
    { dx: -12, rz: -0.045 },
    { dx: 16, rz: 0.035 },
    { dx: -6, rz: -0.02 },
  ];
  const slot = (i: number) => {
    const r = anchor();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const gap = shardH + Math.min(16, r.height * 0.06);
    const sx = cx + SWAY[i % 3].dx;
    const sy = cy + (i - (shards.length - 1) / 2) * gap;
    return { x: sx - W / 2, y: H / 2 - sy, rz: SWAY[i % 3].rz };
  };

  // ── Picking: project each shard's outline and test the pointer ──
  let pointer: Pt | null = null;
  let focused: string | null = null;
  let busy = false;
  const model = (s: Shard): M4 => {
    const c = s.cur;
    return mul(translate(c.x, c.y, c.z), mul(rot('z', c.rz), mul(rot('y', c.ry), mul(rot('x', c.rx), scale(c.s)))));
  };
  const project = (m: M4, p: Pt): Pt => {
    const x = p.x;
    const y = -p.y;
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
      if (s.state !== 'idle' && s.state !== 'in') continue;
      const m = model(s);
      if (inside(pt, s.poly.map((p) => project(m, p)))) return s;
    }
    return null;
  };

  const onMove = (e: PointerEvent) => {
    pointer = { x: e.clientX, y: e.clientY };
    const hit = !busy && api.visible ? shardAt(pointer) : null;
    host.classList.toggle('is-over-shard', !!hit);
  };
  const onClick = (e: MouseEvent) => {
    if (busy || !api.visible) return;
    const hit = shardAt({ x: e.clientX, y: e.clientY });
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();
    onPick(hit.item.id);
  };
  host.addEventListener('pointermove', onMove);
  host.addEventListener('click', onClick, true);
  window.addEventListener('resize', size);

  // ── Loop ──
  let raf = 0;
  let last = performance.now();
  let t = 0;
  const ease = (k: number, dt: number) => 1 - Math.exp(-k * dt);
  const draw = (m: M4, r: { first: number; count: number }, shadow: boolean) => {
    gl.uniformMatrix4fv(uModel, false, m);
    gl.uniform1f(uShadow, shadow ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, r.first, r.count);
  };

  const frame = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    t += dt;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    let live = false;

    shards.forEach((s, i) => {
      if (s.state === 'hidden') return;
      live = true;
      if (s.delay > 0) {
        s.delay -= dt;
        return;
      }
      const home = slot(i);
      const hot = !busy && s.state === 'idle' && ((pointer && shardAt(pointer) === s) || focused === s.item.id);
      s.hover += ((hot ? 1 : 0) - s.hover) * ease(10, dt);

      if (s.state === 'in' || s.state === 'idle') {
        // Hang in place with a slow bob; lean toward the pointer when it's near.
        let lx = 0;
        let ly = 0;
        if (pointer && s.hover > 0.01) {
          const sx = home.x + W / 2;
          const sy = H / 2 - home.y;
          lx = Math.max(-1, Math.min(1, (pointer.x - sx) / (s.w / 2)));
          ly = Math.max(-1, Math.min(1, (pointer.y - sy) / (s.h / 2)));
        }
        s.tgt = {
          x: home.x,
          y: home.y + Math.sin(t * 1.3 + s.seed) * 3,
          z: s.hover * 26,
          rx: Math.sin(t * 0.9 + s.seed) * 0.05 + ly * 0.3 * s.hover,
          ry: Math.cos(t * 0.7 + s.seed) * 0.06 + lx * 0.38 * s.hover,
          rz: home.rz + Math.sin(t * 0.6 + s.seed) * 0.015,
          s: 1 + s.hover * 0.04,
        };
        const k = s.state === 'in' ? 5 : 9;
        const c = s.cur;
        for (const key of ['x', 'y', 'z', 'rx', 'ry', 'rz', 's'] as const) c[key] += (s.tgt[key] - c[key]) * ease(k, dt);
        if (s.state === 'in' && Math.abs(c.x - home.x) + Math.abs(c.y - home.y) + Math.abs(c.rz - home.rz) * 100 < 2) s.state = 'idle';
      } else if (s.state === 'out') {
        const c = s.cur;
        for (const key of ['x', 'y', 'z', 'rx', 'ry', 'rz', 's'] as const) c[key] += (s.tgt[key] - c[key]) * ease(4, dt);
        s.alpha = Math.max(0, s.alpha - dt * 2.2);
        if (s.alpha <= 0) s.state = 'hidden';
      } else if (s.state === 'burst') {
        for (const f of s.frags) {
          f.vy -= GRAVITY * dt;
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          f.z += f.vz * dt;
          f.angle += f.spin * dt;
        }
        s.alpha = Math.max(0, s.alpha - dt * 1.6);
        if (s.alpha <= 0) s.state = 'hidden';
      }

      const m = model(s);
      gl.bindTexture(gl.TEXTURE_2D, s.tex);
      gl.uniform1f(uAlpha, s.alpha);
      gl.uniform1f(uGlow, s.hover * 0.05);
      if (s.state === 'burst') {
        for (const f of s.frags) {
          const fm = mul(
            m,
            mul(translate(f.cx + f.x, f.cy + f.y, f.z), mul(axisAngle(f.ax, f.ay, f.az, f.angle), translate(-f.cx, -f.cy, 0))),
          );
          draw(fm, f, false);
        }
      } else {
        // A soft shadow cast on the room behind, then the glass.
        draw(mul(translate(10, -14, -60 + s.cur.z * 0.5), m), s.whole, true);
        draw(m, s.whole, false);
      }
    });

    if (live) raf = requestAnimationFrame(frame);
    else raf = 0;
  };
  const run = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const flyOut = (s: Shard, k: number) => {
    s.state = 'out';
    s.tgt = { x: s.cur.x + rand(-80, 80), y: -H / 2 - 160 - k * 40, z: -120, rx: rand(-1.5, 1.5), ry: rand(-1.5, 1.5), rz: rand(-1, 1), s: 0.9 };
  };

  const api: ShardMenu = {
    get visible() {
      return shards.some((s) => s.state === 'in' || s.state === 'idle');
    },

    show(from?: Pt) {
      busy = false;
      shards.forEach((s, i) => {
        const home = slot(i);
        const start = from
          ? { x: from.x - W / 2 + rand(-40, 40), y: H / 2 - from.y + rand(-30, 30), z: 260 }
          : { x: home.x + rand(-60, 60), y: -H / 2 - 120, z: -80 };
        s.cur = { ...start, rx: rand(-2, 2), ry: rand(-2, 2), rz: rand(-1.5, 1.5), s: from ? 0.4 : 1 };
        s.alpha = 1;
        s.hover = 0;
        s.state = 'in';
        s.delay = (from ? 0.35 : 0.05) + i * 0.12;
        for (const f of s.frags) Object.assign(f, { x: 0, y: 0, z: 0, angle: 0 });
      });
      run();
    },

    pick(id: string) {
      busy = true;
      host.classList.remove('is-over-shard');
      shards.forEach((s, k) => {
        if (s.item.id !== id) return flyOut(s, k);
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
      shards.forEach((s, k) => s.state !== 'hidden' && flyOut(s, k));
      run();
      return new Promise((r) => setTimeout(r, 380));
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
