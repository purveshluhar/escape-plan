// Rule `shortest_exit` without smoke (people): contract/README.md, "Rule details". People take
// the exit with the fewest edges. Width and height apply; steps and stairs do not block. No shaft
// and no elevator: people do not ride the car. The smoke race (`smoke_first`) is a tier 2 rule.
import type { Building, SolverResult, Token } from '../contract/types.ts';
import { heightCheck, walk, widthCheck } from './search.ts';
import type { WalkRule } from './search.ts';

export const SHORTEST_EXIT: WalkRule = {
  kinds: ['door', 'opening', 'ramp', 'step', 'stair'],
  checks: [widthCheck, heightCheck],
};

// `time` = edges walked on a pass; null on a fail.
export function shortestExit(building: Building, token: Token): SolverResult {
  const result = walk(building, token, SHORTEST_EXIT);
  return { ...result, time: result.status === 'pass' ? result.path.length - 1 : null };
}
