// Rule `spread` (smoke, T2): contract/README.md, "Rule details". Smoke moves one open edge per
// time step from its start, through every edge kind except drain_route and supply. An edge
// without `open` is open; `close_door` sets it false. Smoke has no width, height, step or car
// check, and it does not stop at an exit. Its goal and size are not used.
// People race the smoke in shortest-exit.ts, with smokeArrival() below.
import type { Building, BuildingNode, Id, SolverResult, Token } from '../contract/types.ts';
import { buildGraph, byId } from './search.ts';
import type { WalkKind } from './search.ts';

export const SPREAD_KINDS: readonly WalkKind[] = ['door', 'opening', 'shaft', 'stair', 'elevator', 'ramp', 'step'];

// The step at which smoke from this token reaches each node, by breadth-first search over the
// open edges. In the order reached: by step, and inside one step by node id. Null when the
// start is not a node.
export function smokeSteps(building: Building, token: Token): Map<Id, number> | null {
  const nodes = new Map<Id, BuildingNode>(building.nodes.map((n) => [n.id, n]));
  if (!nodes.has(token.start)) return null;
  const open = { ...building, edges: building.edges.filter((e) => e.open !== false) };
  const graph = buildGraph(open, nodes, SPREAD_KINDS);
  const steps = new Map<Id, number>([[token.start, 0]]);
  for (let front = [token.start], step = 1; front.length > 0; step++) {
    const reached = new Set<Id>();
    for (const id of front) {
      for (const hop of graph.get(id) ?? []) if (!steps.has(hop.to)) reached.add(hop.to);
    }
    front = [...reached].sort(byId);
    for (const id of front) steps.set(id, step);
  }
  return steps;
}

// The earliest step any smoke token reaches each node. Empty when the building has no smoke.
export function smokeArrival(building: Building): Map<Id, number> {
  const first = new Map<Id, number>();
  for (const token of building.tokens) {
    if (token.rule !== 'spread') continue;
    for (const [id, step] of smokeSteps(building, token) ?? []) {
      if (step < (first.get(id) ?? Infinity)) first.set(id, step);
    }
  }
  return first;
}

// Smoke's own record: pass, path = nodes in the order reached, time = steps to the last node.
export function spread(building: Building, token: Token): SolverResult {
  const steps = smokeSteps(building, token);
  if (!steps) {
    return { token: token.id, status: 'fail', path: [], blocked_at: null, reason: 'no_route', needed: null, available: null, time: null };
  }
  const path = [...steps.keys()];
  return { token: token.id, status: 'pass', path, blocked_at: null, reason: null, needed: null, available: null, time: steps.get(path.at(-1)!)! };
}
