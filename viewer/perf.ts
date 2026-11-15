// The ?perf overlay (design/motion.md 3): frame time, script time and GPU work, to measure the
// presenting laptop before and after each motion round. Off unless the address has ?perf. Owner: P2.
import type * as THREE from 'three';

export function perfEnabled(search: string): boolean {
  return new URLSearchParams(search).has('perf');
}

export function percentile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
}

export interface PerfSample {
  frames: readonly number[]; // ms between frames
  script: readonly number[]; // ms spent in the frame callback
  calls: number; // draw calls in the last frame
  triangles: number;
}

export function perfLine({ frames, script, calls, triangles }: PerfSample): string {
  const mean = frames.length ? frames.reduce((a, b) => a + b, 0) / frames.length : 0;
  const fps = mean > 0 ? Math.round(1000 / mean) : 0;
  return `frame p50 ${percentile(frames, 0.5).toFixed(1)} ms, p95 ${percentile(frames, 0.95).toFixed(1)} ms (${fps} fps)`
    + ` | script p50 ${percentile(script, 0.5).toFixed(1)} ms | ${calls} draw calls, ${Math.round(triangles / 1000)}k triangles`;
}

const KEEP = 120; // frames of history, about 2 s at 60 fps
const EVERY_MS = 250; // text updates

export interface PerfOverlay {
  begin(now: number): void; // at the start of a frame callback
  end(): void; // after the last render call of the frame
}

// Counts every render call of a frame (the viewer renders several scenes per frame), so the renderer's
// info stops resetting itself; begin() resets it once per frame instead.
export function createPerfOverlay(container: HTMLElement, renderer: THREE.WebGLRenderer): PerfOverlay {
  renderer.info.autoReset = false;
  const el = document.createElement('div');
  el.className = 'ep-perf';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:absolute;left:8px;bottom:8px;z-index:100003;pointer-events:none;'
    + 'font:600 12px/1.3 ui-monospace,monospace;color:#0f172a;background:rgba(255,255,255,.85);padding:4px 8px;border-radius:6px';
  container.appendChild(el);
  const frames: number[] = [];
  const script: number[] = [];
  let last = 0;
  let started = 0;
  let shown = 0;
  return {
    begin(now) {
      if (last) frames.push(now - last);
      last = now;
      started = performance.now();
      renderer.info.reset();
    },
    end() {
      const t = performance.now();
      script.push(t - started);
      if (frames.length > KEEP) frames.splice(0, frames.length - KEEP);
      if (script.length > KEEP) script.splice(0, script.length - KEEP);
      if (t - shown < EVERY_MS) return;
      shown = t;
      el.textContent = perfLine({ frames, script, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
    },
  };
}
