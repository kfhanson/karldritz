// WebGL simplex-noise background for the home hero.
const vsSource = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fsSource = `
  #ifdef GL_ES
  precision mediump float;
  #endif

  uniform float u_time;
  uniform vec2 u_resolution;

  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec2 st = gl_FragCoord.xy / u_resolution.xy;
    st.x *= u_resolution.x / u_resolution.y;

    float t = u_time * 0.15;

    vec2 q = vec2(0.0);
    q.x = snoise(st + vec2(0.0, t));
    q.y = snoise(st + vec2(1.0, t));

    vec2 r = vec2(0.0);
    r.x = snoise(st + q + vec2(1.7, 9.2) + 0.15 * t);
    r.y = snoise(st + q + vec2(8.3, 2.8) + 0.126 * t);

    float f = snoise(st + r);

    vec3 color = vec3(0.04, 0.04, 0.04);
    color = mix(color, vec3(0.12, 0.12, 0.14), clamp(f * f * 3.0, 0.0, 1.0));
    color += vec3(0.1) * smoothstep(0.45, 0.55, f) * 0.5;

    gl_FragColor = vec4(color, 1.0);
  }
`;

// Returns a cleanup function, or null if WebGL is unavailable.
export function initShader(canvas: HTMLCanvasElement): (() => void) | null {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const gl = canvas.getContext('webgl');
  if (!gl) return null;

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  };

  const vs = compile(gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;

  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Shader link error:', gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  const positionLocation = gl.getAttribLocation(program, 'position');
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(program, 'u_time');
  const uResolution = gl.getUniformLocation(program, 'u_resolution');

  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uResolution, canvas.width, canvas.height);
  };
  window.addEventListener('resize', resize);
  resize();

  let animationId = 0;
  let visible = true;
  const startTime = performance.now();

  const drawFrame = () => {
    gl.uniform1f(uTime, (performance.now() - startTime) * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  const render = () => {
    drawFrame();
    animationId = requestAnimationFrame(render);
  };

  // Pause rendering while the hero is scrolled out of view.
  const observer = new IntersectionObserver(([entry]) => {
    const nowVisible = entry.isIntersecting;
    if (nowVisible && !visible && !prefersReducedMotion) {
      visible = true;
      render();
    } else if (!nowVisible && visible) {
      visible = false;
      cancelAnimationFrame(animationId);
    }
  });
  observer.observe(canvas);

  if (prefersReducedMotion) {
    drawFrame();
  } else {
    render();
  }

  return () => {
    cancelAnimationFrame(animationId);
    observer.disconnect();
    window.removeEventListener('resize', resize);
  };
}
