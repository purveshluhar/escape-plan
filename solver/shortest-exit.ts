// Rule `shortest_exit` (people): contract/README.md, "Rule details". People take the exit with
// the fewest edges. Width and height apply; steps and stairs do not block. No shaft and no
// elevator edges: people do not ride the car. A door into an elevator-type node still gets the
// core's car check, as for every walking rule.
// T2 race: people reach the node at index i of their path at step i. If any smoke token reaches
// that node at the same step or earlier (a tie goes to smoke), people fail `smoke_first` there.
// People keep their path: they do not route round the smoke.
import type { Building, SolverResult, Token } from '../contract/types.ts';
import { heightCheck, walk, widthCheck } from './search.ts';
import type { WalkRule } from './search.ts';
import { smokeArrival } from './spread.ts';

export const SHORTEST_EXIT: WalkRule = {
  kinds: ['door', 'opening', 'ramp', 'step', 'stair'],
  checks: [widthCheck, heightCheck],
};

// `time` = edges walked on a pass; null on a fail. The race runs on the walked path, a fail
// path too, so smoke that catches people before a block is the first thing that stops them.
// smoke_first: path up to the node before, needed = the people's step there, available = smoke's.
export function shortestExit(building: Building, token: Token): SolverResult {
  const result = walk(building, token, SHORTEST_EXIT);
  const smoke = smokeArrival(building);
  const caught = result.path.findIndex((id, step) => (smoke.get(id) ?? Infinity) <= step);
  if (caught >= 0) {
    const at = result.path[caught]!;
    return {
      token: token.id, status: 'fail', path: result.path.slice(0, caught), blocked_at: at,
      reason: 'smoke_first', needed: caught, available: smoke.get(at)!, time: null,
    };
  }
  return { ...result, time: result.status === 'pass' ? result.path.length - 1 : null };
}
