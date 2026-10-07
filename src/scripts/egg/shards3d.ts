// The falling glass in 3D. Each shard is a thin slab: the page on its face, a
// glassy edge, and a dimmer back, lit so it glints as it tumbles. Drawn with
// raw WebGL in a perspective that maps the z = 0 plane exactly onto the
// viewport, so at rest the shards are pixel-for-pixel the page.

type Pt = { x: number; y: number };

export interface ShardScene {
  /** Draw every shard in place: the unbroken (but cracked) page. */
  rest(): void;
  /** Break: shards burst out from the impact and fall away. */
  fall(): Promise<void>;
  /** Rewind: shards fly back from wherever they fell, outer ones first. */
  rise(): Promise<void>;
  destroy(): void;
}

interface Shard {
  first: number; // vertex offset and count in the shared buffer
  count: number;
  cx: number; // rest position of the centroid, world units (CSS px, y up)
  cy: number;
  d: number; // distance from impact
  x: number; // offset from rest
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ax: number; // tumble axis (unit) and angle
  ay: number;
  az: number;
  angle: number;
  spin: number;
  delay: number;
}

const THICKNESS = 2.5;
const GRAVITY = 2600;
const FOV = (35 * Math.PI) / 180;

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

// Shading is relative to a face lying flat, so a shard at rest is exactly
// the snapshot; tilt it and it darkens or brightens, and catches highlights.
const FRAG = `
precision mediump float;
uniform sampler2D uTex;
uniform vec3 uLight;
uniform vec3 uEye;
uniform float uRestDiffuse;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPos;
varying float vKind;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(uEye - vPos);
  if (dot(n, v) < 0.0) n = -n; // two-sided: light whichever side faces us
  vec3 l = normalize(uLight);
  float diffuse = max(dot(n, l), 0.0);
  vec3 h = normalize(l + v);
  float spec = pow(max(dot(n, h), 0.0), 48.0);
  // Faces glint only beyond what a flat pane would show, so at rest there's none.
  float still = pow(max(h.z, 0.0), 48.0);
  vec3 color;
  if (vKind < 0.5) {
    color = texture2D(uTex, vUv).rgb * clamp(1.0 + (diffuse - uRestDiffuse) * 0.35, 0.72, 1.12);
    spec = max(spec - still, 0.0) * 0.7;
  } else if (vKind < 1.5) {
    // The back: the same print seen through the glass, a touch dimmer.
    color = texture2D(uTex, vUv).rgb * clamp(0.9 + (diffuse - uRestDiffuse) * 0.3, 0.68, 1.0);
    spec = max(spec - still, 0.0) * 0.7;
  } else {
    color = vec3(0.80, 0.86, 0.84) * (0.55 + 0.45 * diffuse);
  }
  gl_FragColor = vec4(color + spec * 0.6, 1.0);
}`;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// Sutherland–Hodgman against the viewport, so no shard samples off the page.
export function clipToView(poly: Pt[], w: number, h: number): Pt[] {
  const edges: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [
    [(p) => p.x >= 0, (a, b) => ({ x: 0, y: a.y + ((b.y - a.y) * (0 - a.x)) / (b.x - a.x) })],
    [(p) => p.x <= w, (a, b) => ({ x: w, y: a.y + ((b.y - a.y) * (w - a.x)) / (b.x - a.x) })],
    [(p) => p.y >= 0, (a, b) => ({ x: a.x + ((b.x - a.x) * (0 - a.y)) / (b.y - a.y), y: 0 })],
    [(p) => p.y <= h, (a, b) => ({ x: a.x + ((b.x - a.x) * (h - a.y)) / (b.y - a.y), y: h })],
  ];
  let out = poly;
  for (const [inside, cross] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i];
      const b = input[(i + 1) % input.length];
      if (inside(b)) {
        if (!inside(a)) out.push(cross(a, b));
        out.push(b);
      } else if (inside(a)) out.push(cross(a, b));
    }
    if (out.length < 3) return [];
  }
  return out;
}

export function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
  return s;
}

/** Column-major 4×4 helpers. */
export function perspective(fov: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

function model(out: Float32Array, s: Shard, k = 1) {
  // Rotation about the shard's axis (Rodrigues), then translation.
  const a = s.angle * k;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  const t = 1 - c;
  const { ax: x, ay: y, az: z } = s;
  out[0] = t * x * x + c;
  out[1] = t * x * y + sn * z;
  out[2] = t * x * z - sn * y;
  out[3] = 0;
  out[4] = t * x * y - sn * z;
  out[5] = t * y * y + c;
  out[6] = t * y * z + sn * x;
  out[7] = 0;
  out[8] = t * x * z + sn * y;
  out[9] = t * y * z - sn * x;
  out[10] = t * z * z + c;
  out[11] = 0;
  out[12] = s.cx + s.x * k;
  out[13] = s.cy + s.y * k;
  out[14] = s.z * k;
  out[15] = 1;
}

// ── Contexts made ahead of time ──
// Creating a WebGL context and compiling its shaders takes a couple of hundred
// milliseconds. Done at the moment of the break, that's a visible freeze, so
// they're made while the cracks are still spreading and picked up when needed.
export interface GLKit {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  program: WebGLProgram;
}

function makeKit(vert: string, frag: string): GLKit | null {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true });
  if (!gl) return null;
  try {
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vert));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link');
    return { canvas, gl, program };
  } catch (err) {
    console.warn('[egg] WebGL unavailable', err);
    return null;
  }
}

const kits = new Map<string, GLKit | null>();

/** Full-screen size at the resolution the 3D canvases use (capped at 1.5×). */
export const screenSize = () => {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  return { w: Math.round(innerWidth * dpr), h: Math.round(innerHeight * dpr) };
};

/** Resize only when it changes: reallocating a full-screen buffer is costly. */
export function fit(canvas: HTMLCanvasElement, w: number, h: number) {
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
}

export function prewarmKit(key: string, vert: string, frag: string) {
  if (kits.has(key)) return;
  const kit = makeKit(vert, frag);
  if (kit) {
    // Allocate the drawing buffer now too, and draw once so it's really made.
    const { w, h } = screenSize();
    fit(kit.canvas, w, h);
    kit.gl.viewport(0, 0, w, h);
    kit.gl.clear(kit.gl.COLOR_BUFFER_BIT);
  }
  kits.set(key, kit);
}

/** A ready context for one use: the prewarmed one if there is one. */
export function takeKit(key: string, vert: string, frag: string): GLKit | null {
  const kit = kits.has(key) ? kits.get(key)! : makeKit(vert, frag);
  kits.delete(key);
  return kit;
}

export const prewarm3D = () => prewarmKit('fall', VERT, FRAG);

export function create3D(host: HTMLElement, snap: HTMLCanvasElement, cells: Pt[][], o: Pt, R: number): ShardScene | null {
  const W = innerWidth;
  const H = innerHeight;
  // 1.5× is indistinguishable once the shards move, and a full-screen,
  // antialiased, depth-tested canvas at 2× is a lot of pixels to push.
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const kit = takeKit('fall', VERT, FRAG);
  if (!kit) return null;
  const { canvas, gl, program } = kit;
  fit(canvas, Math.round(W * dpr), Math.round(H * dpr));
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  gl.useProgram(program);

  // ── Geometry: one buffer for every shard ──
  // World space is CSS px with the origin mid-screen and y up.
  const toWorld = (p: Pt) => ({ x: p.x - W / 2, y: H / 2 - p.y });
  const data: number[] = [];
  const shards: Shard[] = [];
  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, kind: number) =>
    data.push(x, y, z, nx, ny, nz, u, v, kind);

  for (const cell of cells) {
    const poly = clipToView(cell, W, H);
    if (poly.length < 3) continue;
    const sx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
    const sy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
    const c = toWorld({ x: sx, y: sy });
    const local = poly.map((p) => {
      const w = toWorld(p);
      return { x: w.x - c.x, y: w.y - c.y, u: p.x / W, v: p.y / H };
    });
    const first = data.length / 9;
    const n = local.length;
    // Face and back, as fans from the centroid.
    for (const [z, nz, kind] of [[0, 1, 0], [-THICKNESS, -1, 1]] as const) {
      for (let i = 0; i < n; i++) {
        const a = local[i];
        const b = local[(i + 1) % n];
        push(0, 0, z, 0, 0, nz, sx / W, sy / H, kind);
        push(a.x, a.y, z, 0, 0, nz, a.u, a.v, kind);
        push(b.x, b.y, z, 0, 0, nz, b.u, b.v, kind);
      }
    }
    // The edge all the way round.
    for (let i = 0; i < n; i++) {
      const a = local[i];
      const b = local[(i + 1) % n];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const len = Math.hypot(ex, ey) || 1;
      const nx = ey / len;
      const ny = -ex / len;
      push(a.x, a.y, 0, nx, ny, 0, 0, 0, 2);
      push(b.x, b.y, 0, nx, ny, 0, 0, 0, 2);
      push(b.x, b.y, -THICKNESS, nx, ny, 0, 0, 0, 2);
      push(a.x, a.y, 0, nx, ny, 0, 0, 0, 2);
      push(b.x, b.y, -THICKNESS, nx, ny, 0, 0, 0, 2);
      push(a.x, a.y, -THICKNESS, nx, ny, 0, 0, 0, 2);
    }

    // Motion: out from the impact, a pop up, a burst toward the viewer, and
    // a tumble about a mostly in-plane axis so shards flip and show edges.
    const d = Math.hypot(sx - o.x, sy - o.y) || 1;
    const size = Math.sqrt(Math.abs(poly.reduce((s, p, i) => {
      const q = poly[(i + 1) % poly.length];
      return s + p.x * q.y - q.x * p.y;
    }, 0)) / 2) || 1;
    const speed = rand(60, 220) * (1 - (d / R) * 0.5) + (d < 140 ? 260 : 0);
    let ax = rand(-1, 1);
    let ay = rand(-1, 1);
    let az = rand(-0.35, 0.35);
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al;
    ay /= al;
    az /= al;
    shards.push({
      first,
      count: data.length / 9 - first,
      cx: c.x,
      cy: c.y,
      d,
      x: 0,
      y: 0,
      z: 0,
      vx: ((sx - o.x) / d) * speed + rand(-30, 30),
      vy: -((sy - o.y) / d) * speed + rand(40, 200),
      vz: rand(40, 240) * (1 - (d / R) * 0.6) + (d < 140 ? 160 : 0),
      ax,
      ay,
      az,
      angle: 0,
      spin: rand(2, 6) * (1 + 40 / size) * (Math.random() < 0.5 ? -1 : 1),
      delay: d * 0.45 + rand(0, 70),
    });
  }

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  const attr = (name: string, size: number, offset: number) => {
    const loc = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 36, offset * 4);
  };
  attr('aPos', 3, 0);
  attr('aNormal', 3, 3);
  attr('aUv', 2, 6);
  attr('aKind', 1, 8);

  // ── Texture: the cracked snapshot ──
  let source: HTMLCanvasElement = snap;
  const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  if (snap.width > max || snap.height > max) {
    const k = max / Math.max(snap.width, snap.height);
    source = document.createElement('canvas');
    source.width = Math.floor(snap.width * k);
    source.height = Math.floor(snap.height * k);
    source.getContext('2d')!.drawImage(snap, 0, 0, source.width, source.height);
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // ── Camera: z = 0 lands exactly on the viewport ──
  const D = H / 2 / Math.tan(FOV / 2);
  const proj = perspective(FOV, W / H, 10, D * 4);
  proj[14] += proj[10] * -D; // fold in the view: camera at z = D looking down -z
  proj[15] += proj[11] * -D;
  const light = [-0.45, 0.6, 1];
  const ll = Math.hypot(light[0], light[1], light[2]);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uProj'), false, proj);
  gl.uniform3fv(gl.getUniformLocation(program, 'uLight'), light);
  gl.uniform3f(gl.getUniformLocation(program, 'uEye'), 0, 0, D);
  gl.uniform1f(gl.getUniformLocation(program, 'uRestDiffuse'), light[2] / ll);
  gl.uniform1i(gl.getUniformLocation(program, 'uTex'), 0);
  const uModel = gl.getUniformLocation(program, 'uModel');
  const m = new Float32Array(16);

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearColor(0, 0, 0, 0);
  host.insertBefore(canvas, host.firstChild); // under the 2D layer, which still draws the flash

  let raf = 0;
  const draw = (k = 1) => {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    for (const s of shards) {
      model(m, s, k);
      gl.uniformMatrix4fv(uModel, false, m);
      gl.drawArrays(gl.TRIANGLES, s.first, s.count);
    }
  };

  return {
    rest: () => draw(0),

    fall: () =>
      new Promise<void>((resolve) => {
        const start = performance.now();
        let last = start;
        const frame = (now: number) => {
          const dt = Math.max(0, Math.min(0.033, (now - last) / 1000));
          last = now;
          const t = Math.max(0, now - start);
          let alive = 0;
          for (const s of shards) {
            if (t > s.delay) {
              s.vy -= GRAVITY * dt;
              s.x += s.vx * dt;
              s.y += s.vy * dt;
              s.z += s.vz * dt;
              s.angle += s.spin * dt;
            }
            if (s.cy + s.y > -H / 2 - 160) alive++;
          }
          draw();
          if (alive && t < 4000) raf = requestAnimationFrame(frame);
          else {
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            canvas.style.visibility = 'hidden'; // an empty full-screen layer still costs compositing
            resolve();
          }
        };
        raf = requestAnimationFrame(frame);
      }),

    rise: () =>
      new Promise<void>((resolve) => {
        const from = shards.map((s) => ({ x: s.x, y: s.y, z: s.z, angle: s.angle % (Math.PI * 2) }));
        const DUR = 700;
        canvas.style.visibility = '';
        const start = performance.now();
        const frame = (now: number) => {
          const t = Math.max(0, now - start);
          let done = true;
          shards.forEach((s, k) => {
            const lag = (1 - s.d / R) * 280;
            const p = Math.min(1, Math.max(0, (t - lag) / DUR));
            if (p < 1) done = false;
            const e = 1 - (1 - p) ** 3;
            const f = from[k];
            s.x = f.x * (1 - e);
            s.y = f.y * (1 - e);
            s.z = f.z * (1 - e);
            s.angle = f.angle * (1 - e);
          });
          draw();
          if (!done) raf = requestAnimationFrame(frame);
          else resolve();
        };
        raf = requestAnimationFrame(frame);
      }),

    destroy: () => {
      cancelAnimationFrame(raf);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    },
  };
}
