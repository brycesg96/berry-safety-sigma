import { useEffect, useRef } from 'react';
import './liquid-glass.css';

// Visual adaptation of the user-supplied Nimbus UI “Tidepool” water card
// by guglielmogiannattasio.it. Its payment form and card data are not included.
const vertex = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const fragment = `precision mediump float;
uniform vec2 uRes;uniform vec2 uPointer;uniform float uTime;
uniform vec3 uA;uniform vec3 uB;uniform vec3 uWater;
float caustic(vec2 p,float t){float c=0.;for(int i=0;i<3;i++){
 p+=vec2(sin(p.y*1.1+t),cos(p.x*1.3-t*.7))*.6;
 c+=1./(1.+16.*abs(sin(p.x)*sin(p.y)));}return c/3.;}
void main(){
 vec2 p=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);vec2 uv=p/uRes;
 float surface=uRes.y*.7+sin(uv.x*7.+uTime*.65)*3.+sin(uv.x*15.-uTime*.4)*1.5;
 surface+=(uPointer.x-.5)*(uv.x-.5)*7.;
 float depth=p.y-surface;float under=smoothstep(-1.,1.,depth);
 vec3 col=mix(uA,uB,clamp(uv.y*.7+uv.x*.3,0.,1.));
 vec2 light=(uv-uPointer)*vec2(1.,.7);col+=.06*exp(-dot(light,light)*5.);
 vec3 water=mix(uWater,uWater*.92,clamp(depth/uRes.y,0.,1.));
 water+=vec3(.8,1.,.85)*smoothstep(.55,1.,caustic(uv*5.,uTime*.15))*.06;
 col=mix(col,water,under*.4);
 col+=vec3(1.)*exp(-pow(depth+1.,2.)/3.)*.13;
 gl_FragColor=vec4(col,1.);
}`;

type Tone = 'clear' | 'sage' | 'forest';
const palettes: Record<Tone, [number[], number[], number[]]> = {
  clear: [[.99, 1, .99], [.92, .97, .94], [.82, .93, .85]],
  sage: [[.96, .99, .93], [.85, .93, .83], [.66, .82, .69]],
  forest: [[.11, .25, .2], [.05, .16, .13], [.19, .4, .29]],
};

function water(canvas: HTMLCanvasElement, tone: Tone) {
  let gl: WebGLRenderingContext | null;
  try { gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' }); }
  catch { return null; }
  if (!gl) return null;
  const context = gl;
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null;
  const dispose = () => {
    if (buffer) context.deleteBuffer(buffer);
    if (program) context.deleteProgram(program);
    shaders.forEach(shader => context.deleteShader(shader));
  };
  for (const [type, source] of [[context.VERTEX_SHADER, vertex], [context.FRAGMENT_SHADER, fragment]] as const) {
    const shader = context.createShader(type);
    if (!shader) { dispose(); return null; }
    shaders.push(shader); context.shaderSource(shader, source); context.compileShader(shader);
    if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) { dispose(); return null; }
  }
  program = context.createProgram(); buffer = context.createBuffer();
  if (!program || !buffer) { dispose(); return null; }
  shaders.forEach(shader => context.attachShader(program!, shader));
  context.linkProgram(program);
  if (!context.getProgramParameter(program, context.LINK_STATUS)) { dispose(); return null; }
  context.useProgram(program); context.bindBuffer(context.ARRAY_BUFFER, buffer);
  context.bufferData(context.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), context.STATIC_DRAW);
  const attribute = context.getAttribLocation(program, 'a');
  context.enableVertexAttribArray(attribute); context.vertexAttribPointer(attribute, 2, context.FLOAT, false, 0, 0);
  const uniforms = Object.fromEntries(['uRes', 'uPointer', 'uTime', 'uA', 'uB', 'uWater'].map(name => [name, context.getUniformLocation(program!, name)]));
  palettes[tone].forEach((color, index) => context.uniform3fv(uniforms[['uA', 'uB', 'uWater'][index]], color));
  return {
    draw(time: number, x: number, y: number) {
      if (context.isContextLost()) return;
      context.viewport(0, 0, canvas.width, canvas.height);
      context.uniform2f(uniforms.uRes, canvas.width, canvas.height);
      context.uniform2f(uniforms.uPointer, x, y); context.uniform1f(uniforms.uTime, time);
      context.drawArrays(context.TRIANGLES, 0, 3);
    }, dispose,
  };
}

/** Decorative layer: controls stay in their original layout and retain all pointer/keyboard events. */
export function LiquidGlassSurface({ tone = 'clear', waterEffect = false }: { tone?: Tone; waterEffect?: boolean }) {
  const surface = useRef<HTMLSpanElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const layer = surface.current, parent = layer?.parentElement;
    if (!layer || !parent) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = matchMedia('(hover: hover) and (pointer: fine)');
    let renderer: ReturnType<typeof water> = null;
    let visible = false, frame = 0, last = 0, time = 0, x = .25, y = .2;
    const stop = () => { cancelAnimationFrame(frame); frame = 0; last = 0; };
    const draw = (now: number) => {
      frame = 0;
      if (!visible || document.hidden || reduce.matches || !pointer.matches) return;
      if (!last || now - last >= 32) {
        time += last ? Math.min((now - last) / 1000, .05) : 0;
        last = now; renderer?.draw(time, x, y);
      }
      if (renderer) frame = requestAnimationFrame(draw);
    };
    const start = () => {
      if (waterEffect && canvas.current && visible && !reduce.matches && pointer.matches && !document.hidden) {
        renderer ||= water(canvas.current, tone);
        layer.dataset.water = renderer ? 'on' : 'off';
        if (renderer && !frame) frame = requestAnimationFrame(draw);
      }
    };
    const reset = () => {
      x = .25; y = .2;
      layer.style.removeProperty('--glass-x'); layer.style.removeProperty('--glass-y');
    };
    const preference = () => {
      stop(); reset();
      if (reduce.matches || !pointer.matches) { renderer?.dispose(); renderer = null; layer.dataset.water = 'off'; }
      else start();
    };
    const move = (event: PointerEvent) => {
      if (reduce.matches || !pointer.matches || event.pointerType === 'touch') return;
      const box = parent.getBoundingClientRect();
      x = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
      y = Math.max(0, Math.min(1, (event.clientY - box.top) / box.height));
      layer.style.setProperty('--glass-x', `${x * 100}%`); layer.style.setProperty('--glass-y', `${y * 100}%`);
    };
    const visibility = () => { if (document.hidden) stop(); else start(); };
    const observer = waterEffect ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) start(); else stop(); }) : null;
    observer?.observe(parent);
    const resize = waterEffect ? new ResizeObserver(() => {
      if (!canvas.current) return;
      // One decorative shader on the support card; cap resolution for modest GPUs.
      const box = layer.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 1.25);
      canvas.current.width = Math.max(1, Math.round(box.width * dpr)); canvas.current.height = Math.max(1, Math.round(box.height * dpr));
      if (!reduce.matches) renderer?.draw(time, x, y);
    }) : null;
    resize?.observe(layer);
    const lost = (event: Event) => { event.preventDefault(); stop(); renderer?.dispose(); renderer = null; layer.dataset.water = 'off'; };
    const restored = () => start();
    canvas.current?.addEventListener('webglcontextlost', lost); canvas.current?.addEventListener('webglcontextrestored', restored);
    const waterCanvas = canvas.current;
    parent.addEventListener('pointermove', move, { passive: true }); parent.addEventListener('pointerleave', reset);
    reduce.addEventListener('change', preference); pointer.addEventListener('change', preference);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      stop(); observer?.disconnect(); resize?.disconnect(); renderer?.dispose();
      parent.removeEventListener('pointermove', move); parent.removeEventListener('pointerleave', reset);
      reduce.removeEventListener('change', preference); pointer.removeEventListener('change', preference);
      document.removeEventListener('visibilitychange', visibility);
      waterCanvas?.removeEventListener('webglcontextlost', lost); waterCanvas?.removeEventListener('webglcontextrestored', restored);
    };
  }, [tone, waterEffect]);
  return <span ref={surface} className={`liquid-glass-surface liquid-glass-${tone}`} aria-hidden="true" data-water="off">
    {waterEffect && <canvas ref={canvas} className="liquid-glass-water"/>}
    <span className="liquid-glass-wave"/><span className="liquid-glass-reflection"/>
  </span>;
}
