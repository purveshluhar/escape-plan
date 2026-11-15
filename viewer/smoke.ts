// The smoke tint: for each node of the slice the smoke has reached inside the building, one haze layer on the
// node's plan box, darker near the source and lighter further on. A node shows from the time its
// smoke step comes. Pure, so Node tests can check it. The tower floors the backdrop stands in for
// (`covered`) get none: smoke reaches every level (step 83), and only the slice is on screen.
import type { Building, Id } from '../contract/types.ts';
import { nodeBoxes, uncovered, type Vec3 } from './layout.ts';

export interface SmokeTint {
  id: Id;
  step: number;
  floor: number; // elevation of the floor it sits on, metres
  center: Vec3;
  size: Vec3;
  opacity: number;
}

const HAZE_HEIGHT = 1.4; // metres of drawn haze above a floor
const FLOOR_LIFT = 0.1;
const DENSEST = 0.28;
const THINNEST = 0.1;
const FADE_STEPS = 6; // steps over which the haze thins from densest to thinnest

// Outside the building smoke drifts off, so the street exit and the truck past it get no tint (a
// tint there read as a shadow spilling off the model).
const OUTSIDE: ReadonlySet<string> = new Set(['street', 'truck']);

export function smokeTints(b: Building, covered: ReadonlySet<Id>, steps: ReadonlyMap<Id, number>): SmokeTint[] {
  const level = new Map(b.nodes.map((n) => [n.id, n.level]));
  const elevation = new Map(b.levels.map((l) => [l.id, l.elevation]));
  const outside = new Set(b.nodes.filter((n) => n.is_exit || OUTSIDE.has(n.type)).map((n) => n.id));
  return uncovered(nodeBoxes(b), covered)
    .filter((box) => steps.has(box.id) && !outside.has(box.id))
    .map((box): SmokeTint => {
      const step = steps.get(box.id)!;
      const floor = elevation.get(level.get(box.id) ?? '') ?? 0;
      return {
        id: box.id, step, floor,
        center: [box.center[0], floor + FLOOR_LIFT + HAZE_HEIGHT / 2, box.center[2]],
        size: [box.size[0], HAZE_HEIGHT, box.size[2]],
        opacity: DENSEST - (DENSEST - THINNEST) * Math.min(1, step / FADE_STEPS),
      };
    })
    .sort((a, z) => a.step - z.step || (a.id < z.id ? -1 : a.id > z.id ? 1 : 0));
}

// Whether a tint shows `seconds` after the run starts: from delay + step * secondsPerStep on, the delay being when the people start. All at once
// when the person asks for less motion.
export function tintVisible(step: number, secondsPerStep: number, seconds: number, reducedMotion: boolean, delaySeconds = 0): boolean {
  return reducedMotion || seconds - delaySeconds >= step * secondsPerStep;
}

// Whether a tint's floor is on screen. While the facade is open (`open`) the floors from `ceiling` up are
// cut away (viewer dropCeiling), and smoke on them is not drawn with them.
export function tintOnShownFloor(floor: number, open: boolean, ceiling: number): boolean {
  return !open || floor + FLOOR_LIFT < ceiling;
}
