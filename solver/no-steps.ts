// Rule `no_steps` (wheelchair): contract/README.md, "Rule details". A step or stair edge, or any
// edge with step_height > 0, blocks with reason `step`. Width and height apply as for every
// walking rule. Step and stair edges stay in the graph, so the fail record can name the step.
import { heightCheck, widthCheck } from './search.ts';
import type { EdgeCheck, WalkRule } from './search.ts';

// A stair's `available` is the elevation difference of the levels of its two nodes.
export const stepCheck: EdgeCheck = (edge, _token, building) => {
  if (edge.kind === 'stair') {
    const elevation = (nodeId: string): number => {
      const level = building.nodes.find((n) => n.id === nodeId)?.level;
      return building.levels.find((l) => l.id === level)?.elevation ?? 0;
    };
    return { at: edge.id, reason: 'step', needed: 0, available: Math.abs(elevation(edge.to) - elevation(edge.from)) };
  }
  if (edge.kind === 'step' || edge.step_height > 0) {
    return { at: edge.id, reason: 'step', needed: 0, available: edge.step_height };
  }
  return null;
};

export const NO_STEPS: WalkRule = {
  kinds: ['door', 'opening', 'ramp', 'elevator', 'step', 'stair'],
  checks: [stepCheck, widthCheck, heightCheck],
};
