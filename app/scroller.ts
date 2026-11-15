// The floor scroller: a vertical slider over the levels drawn as real floors. Picking a level moves
// the camera to it (the viewer's focusLevel); the camera moving the open floor moves the thumb (follow).
// The state, keys and wheel are here so Node tests can run them; scroller-view.ts draws it. Owner: P3.
import type { Id, Level } from '../contract/types.ts';
import { floorName } from '../viewer/layout.ts';

export interface Stop {
  id: Id;
  name: string; // "Level 10", as the zoom view labels the floor
  elevation: number;
}

// The drawn levels, lowest first.
export function scrollerStops(levels: readonly Level[], drawn: Iterable<Id>): Stop[] {
  const keep = new Set(drawn);
  return levels
    .filter((l) => keep.has(l.id) && Number.isFinite(l.elevation))
    .sort((a, b) => a.elevation - b.elevation)
    .map((l) => ({ id: l.id, name: floorName(l.id), elevation: l.elevation }));
}

export const PAGE_STEP = 10; // levels a Page key moves
export const WHEEL_PIXELS = 25; // wheel travel for one level: a mouse notch (100) is four

// The index a key moves to, or null for a key the scroller does not use. Up and right climb.
export function keyIndex(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  const clamp = (i: number): number => Math.min(count - 1, Math.max(0, i));
  switch (key) {
    case 'ArrowUp': case 'ArrowRight': return clamp(index + 1);
    case 'ArrowDown': case 'ArrowLeft': return clamp(index - 1);
    case 'PageUp': return clamp(index + PAGE_STEP);
    case 'PageDown': return clamp(index - PAGE_STEP);
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}

// A wheel delta in pixels. Firefox turns a mouse wheel in lines (deltaMode 1) and some devices in pages (2).
export const LINE_PIXELS = 33; // 3 lines a notch, about the 100 px a notch is in pixel mode
export const PAGE_PIXELS = 300;
export function wheelPixels(deltaY: number, deltaMode: number): number {
  return deltaMode === 1 ? deltaY * LINE_PIXELS : deltaMode === 2 ? deltaY * PAGE_PIXELS : deltaY;
}

// Wheel up (negative deltaY) climbs. The part of a level not yet turned carries over in `rest`.
export function wheelSteps(rest: number, deltaY: number): { steps: number; rest: number } {
  if (!Number.isFinite(rest + deltaY)) return { steps: 0, rest: 0 }; // a hostile or broken delta turns nothing
  const total = rest + deltaY;
  return { steps: 0 - Math.trunc(total / WHEEL_PIXELS), rest: (total % WHEEL_PIXELS) + 0 };
}

export interface Track {
  top: number; // pixels, same space as the pointer
  height: number;
}

// The level under a pointer at `y` on the track: the top of the track is the top level.
export function indexAtY(y: number, top: number, height: number, count: number): number {
  if (count <= 1 || height <= 0) return 0;
  const f = Math.min(1, Math.max(0, (y - top) / height));
  return Math.round((1 - f) * (count - 1));
}

// How far up the track the thumb sits: 0 at the lowest level, 1 at the top.
export const thumbFraction = (index: number, count: number): number => (count <= 1 ? 0 : index / (count - 1));

export interface Scroller {
  count(): number;
  index(): number;
  current(): Id | null;
  aria(): { now: number; min: number; max: number; text: string }; // for role="slider"
  // A key press: true when the scroller used it.
  key(key: string): boolean;
  wheel(deltaY: number): void;
  // The pointer is down at `y` (also each move of a drag). Pass the same track each time.
  press(y: number, track: Track): void;
  release(): void;
  // The viewer's open floor changed (the camera moved by other means). Ignored while a press is held,
  // because the camera trails the thumb.
  follow(level: Id | null): void;
}

export function createScroller(stops: readonly Stop[], onPick: (level: Id) => void): Scroller {
  let at = 0;
  let held = false;
  let rest = 0;
  const pick = (i: number): void => {
    const next = Math.min(stops.length - 1, Math.max(0, i));
    if (stops.length === 0 || next === at) return;
    at = next;
    onPick(stops[at]!.id);
  };
  return {
    count: () => stops.length,
    index: () => at,
    current: () => stops[at]?.id ?? null,
    aria: () => ({ now: at, min: 0, max: Math.max(0, stops.length - 1), text: stops[at]?.name ?? '' }),
    key(key) {
      const to = keyIndex(key, at, stops.length);
      if (to === null) return false;
      pick(to);
      return true;
    },
    wheel(deltaY) {
      const w = wheelSteps(rest, deltaY);
      rest = w.rest;
      if (w.steps !== 0) pick(at + w.steps);
    },
    press(y, track) {
      held = true;
      pick(indexAtY(y, track.top, track.height, stops.length));
    },
    release() {
      held = false;
    },
    follow(level) {
      if (held || level === null) return;
      const i = stops.findIndex((s) => s.id === level);
      if (i >= 0) at = i;
    },
  };
}
