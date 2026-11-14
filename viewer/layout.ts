// Pure layout math: building nodes to 3D boxes. No three.js here, so it is easy to test.
import type { Building } from '../contract/types.ts';

export const STOREY_HEIGHT = 3.5; // metres drawn per level box
export interface BoxSpec {
  id: string;
  center: [number, number, number]; // three.js axes: x = plan x, y = up, z = plan y
  size: [number, number, number];
}

export function nodeBoxes(b: Building): BoxSpec[] {
  const elevation = new Map(b.levels.map((l) => [l.id, l.elevation]));
  return b.nodes.map((n) => {
    const { x, y, width, depth } = n.box;
    const floor = elevation.get(n.level) ?? 0;
    return {
      id: n.id,
      center: [x + width / 2, floor + STOREY_HEIGHT / 2, y + depth / 2],
      size: [width, STOREY_HEIGHT, depth],
    };
  });
}
