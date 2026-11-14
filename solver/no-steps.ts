// Rule `no_steps` (wheelchair): contract/README.md, "Rule details". A step or stair edge, or any
// edge with step_height > 0, blocks with reason `step`. Width and height apply as for every
// walking rule. Step and stair edges stay in the graph, so the fail record can name the step.
import { heightCheck, widthCheck } from './search.ts';
import type { EdgeCheck, WalkRule } from './search.ts';

// A stair's `available` is the elevation difference of the levels of its two nodes.
// A node or level that is not in the building counts as elevation 0; checkBuildingRefs rejects that data.
export const stepCheck: EdgeCheck = (edge, _token, site) => {
  if (edge.kind === 'stair') {
    const elevation = (nodeId: string): number => {
      const level = site.nodes.get(nodeId)?.level;
      return (level === undefined ? undefined : site.levels.get(level)?.elevation) ?? 0;
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
