import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

// Vertex Shader: Simple pass-through
const vsSource = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

// Fragment Shader: Domain Warping for Fluid Effect
const fsSource = `
  #ifdef GL_ES
  precision mediump float;
  #endif

  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec2 u_mouse;

  // Simplex 2D noise
  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
             -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
      vec2 st = gl_FragCoord.xy / u_resolution.xy;
      // Correct aspect ratio
      st.x *= u_resolution.x / u_resolution.y;
      
      // Mouse interaction
      vec2 mouse = u_mouse / u_resolution.xy;
      mouse.x *= u_resolution.x / u_resolution.y;

      float t = u_time * 0.15;
      
      // Domain Warping
      vec2 q = vec2(0.);
      q.x = snoise(st + vec2(0.0, t));
      q.y = snoise(st + vec2(1.0, t));

      vec2 r = vec2(0.);
      // The mouse position slightly offsets the second noise layer
      r.x = snoise(st + 1.0 * q + vec2(1.7, 9.2) + 0.15 * t + mouse.x * 0.1);
      r.y = snoise(st + 1.0 * q + vec2(8.3, 2.8) + 0.126 * t + mouse.y * 0.1);

      float f = snoise(st + r);

      // Color Palette: Dark, minimalist, elegant
      vec3 color = vec3(0.04, 0.04, 0.04); // Base
      
      // Mix slightly lighter grey/blue based on noise
      color = mix(color, vec3(0.12, 0.12, 0.14), clamp(f * f * 3.0, 0.0, 1.0));
      
      // Subtle highlights
      color += vec3(0.1) * smoothstep(0.45, 0.55, f) * 0.5;

      gl_FragColor = vec4(color, 1.0);
  }
`;

const Hero: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLHeadingElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // WebGL Shader Effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl');
    if (!gl) return;

    // Compile Shader Function
    const compileShader = (source: string, type: number) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile failed:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = compileShader(vsSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(fsSource, gl.FRAGMENT_SHADER);

    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    // Set up geometry (full screen quad)
    const positionLocation = gl.getAttribLocation(program, 'position');
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Uniform locations
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uResolution = gl.getUniformLocation(program, 'u_resolution');
    const uMouse = gl.getUniformLocation(program, 'u_mouse');

    let mouseX = 0;
    let mouseY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      // In WebGL Y is up, in DOM Y is down
      mouseY = canvas.height - e.clientY; 
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Resize handler
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
    };
    window.addEventListener('resize', resize);
    resize();

    // Animation Loop
    let animationId: number;
    const startTime = Date.now();

    const render = () => {
      const time = (Date.now() - startTime) * 0.001;
      gl.uniform1f(uTime, time);
      gl.uniform2f(uMouse, mouseX, mouseY);
      
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animationId = requestAnimationFrame(render);
    };
    render();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationId);
    };
  }, []);

  // Text Animations (GSAP)
  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();

      // Split text animation simulation
      const chars = textRef.current?.querySelectorAll('.char');
      
      if (chars && chars.length > 0) {
          tl.from(chars, {
            y: 100,
            opacity: 0,
            skewY: 10,
            duration: 1,
            stagger: 0.05,
            ease: "power4.out",
          });
      }

      tl.from(subRef.current, {
        y: 20,
        opacity: 0,
        duration: 1,
        ease: "power2.out"
      }, "-=0.5");

    }, containerRef);

    return () => ctx.revert();
  }, []);

  const splitText = (text: string) => {
    return text.split('').map((char, index) => (
      <span key={index} className="char inline-block whitespace-pre">
        {char}
      </span>
    ));
  };

  return (
    <section ref={containerRef} className="relative h-screen flex flex-col justify-center items-start px-8 md:px-24 overflow-hidden">
      {/* Background Shader */}
      <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full z-0 block" />

      {/* Text Content - Positioned Above Canvas */}
      <div className="relative z-10 pointer-events-none mix-blend-screen">
        <div className="overflow-hidden">
          <h1 ref={textRef} className="text-6xl md:text-[9vw] font-[800] leading-[0.9] tracking-tighter uppercase mb-6 text-white">
            {splitText("Karldritz")} <br />
            {splitText("F. Hanson")}
          </h1>
        </div>
        <div className="overflow-hidden">
          <p ref={subRef} className="text-xl md:text-2xl opacity-80 max-w-lg font-light text-gray-200">
            Computer Science Undergraduate based in Jakarta, Indonesia.
          </p>
        </div>
      </div>
      
      <div className="absolute bottom-12 right-12 animate-bounce z-10 pointer-events-none">
        <span className="text-sm uppercase tracking-widest text-white/70">Scroll Down</span>
      </div>
    </section>
  );
};

export default Hero;