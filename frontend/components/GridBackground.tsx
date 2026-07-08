"use client";

import { useEffect, useRef } from "react";

const VERT = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAG = `
  precision mediump float;
  uniform float u_time;
  uniform vec2  u_resolution;
  uniform vec2  u_mouse;

  vec3 palette(float t) {
    return vec3(0.02, 0.12 + 0.08 * sin(t * 0.5), 0.02 + 0.04 * sin(t * 0.3));
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 mouse = u_mouse / u_resolution;

    // Grid lines
    float gridSize = 40.0;
    vec2 grid = fract(gl_FragCoord.xy / gridSize);
    float lineX = smoothstep(0.97, 1.0, grid.x) + smoothstep(0.97, 1.0, 1.0 - grid.x);
    float lineY = smoothstep(0.97, 1.0, grid.y) + smoothstep(0.97, 1.0, 1.0 - grid.y);
    float line = clamp(lineX + lineY, 0.0, 1.0);

    // Mouse glow
    float dist = distance(uv, mouse);
    float glow = smoothstep(0.5, 0.0, dist) * 0.5;

    // Pulse wave from mouse
    float wave = sin(dist * 30.0 - u_time * 2.0) * 0.5 + 0.5;
    wave *= smoothstep(0.5, 0.1, dist);

    // Base dark background
    vec3 bg = palette(u_time);

    // Grid color: bright green lines
    vec3 gridColor = vec3(0.05, 0.55, 0.15);
    vec3 glowColor = vec3(0.08, 0.85, 0.25);

    vec3 col = bg;
    col += gridColor * line * 0.4;
    col += glowColor * glow * line * 1.2;
    col += glowColor * wave * 0.08;

    // Scanlines
    float scan = sin(gl_FragCoord.y * 3.14159 * 0.5) * 0.03;
    col -= scan;

    // Vignette
    float vignette = 1.0 - smoothstep(0.4, 1.2, length(uv - 0.5) * 1.8);
    col *= vignette;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export default function GridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) return;

    // Compile shaders
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // Full-screen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    const posLoc = gl.getAttribLocation(prog, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uRes = gl.getUniformLocation(prog, "u_resolution");
    const uMouse = gl.getUniformLocation(prog, "u_mouse");

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: window.innerHeight - e.clientY };
    };
    window.addEventListener("mousemove", onMouse);

    const start = performance.now();
    const render = () => {
      const t = (performance.now() - start) / 1000;
      gl.uniform1f(uTime, t);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uMouse, mouseRef.current.x, mouseRef.current.y);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      rafRef.current = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 h-full w-full"
      style={{ zIndex: 0 }}
    />
  );
}
