// Rule `downhill` (water, T2). The water uses only `drain_route` edges, from `from` to `to`.
// Checks at each edge, in this order:
// - slope: (invert at from - invert at to) / plan distance between the two box centres must be
//   at least 1 %. Fail `uphill`: needed 0.01, available the slope, rounded to 1e-9. A vertical
//   drop (centres under 1 micrometre apart) passes when it falls; else available is 0.
// - beam: an edge that crosses a `beam` or a `transfer_beam` fails `crosses_beam` unless
//   `sleeved`. needed and available are null.
// A drain edge with an end that is not a node, or has no finite `invert`, is left out.
// Search and fail record as for the walking rules: breadth-first, fewest edges, neighbours in
// node id order; on a fail, the first block on the shortest path with the checks off.
// Own search, not search.ts: that core builds two-way graphs of walking kinds only.
import type { Building, BuildingNode, Edge, Id, MemberKind, Reason, SolverResult, Token } from '../contract/types.ts';

export const SLOPE_NEEDED = 0.01;
// Inverts are typed by hand in metres: 0.30 - 0.26 is 0.03999... in floating point, which
// would fail an exact 1 % fall. One nanometre per metre is far below any real slope.
const SLOPE_TOLERANCE = 1e-9;
const VERTICAL_RUN = 1e-6; // metres: centres closer than this count as one above the other
const BLOCKING: ReadonlySet<MemberKind> = new Set(['beam', 'transfer_beam']);

interface Block {
  at: Id; // edge id
  reason: Reason;
  needed: number | null;
  available: number | null;
}

interface Hop {
  to: Id;
  edges: Edge[]; // every drain from this node to `to`, in edge id order
}

const byId = (a: Id, b: Id): number => (a < b ? -1 : a > b ? 1 : 0);
const centre = (n: BuildingNode): [number, number] => [n.box.x + n.box.width / 2, n.box.y + n.box.depth / 2];

// Both nodes must have a finite invert (buildGraph keeps only such edges).
function slopeOf(from: BuildingNode, to: BuildingNode): number {
  const fall = from.invert! - to.invert!;
  const [fx, fy] = centre(from);
  const [tx, ty] = centre(to);
  const run = Math.hypot(tx - fx, ty - fy);
  if (run < VERTICAL_RUN) return fall > 0 ? Infinity : 0;
  return Math.round((fall / run) * 1e9) / 1e9;
}

function edgeBlock(edge: Edge, nodes: ReadonlyMap<Id, BuildingNode>, kinds: ReadonlyMap<Id, MemberKind>): Block | null {
  const slope = slopeOf(nodes.get(edge.from)!, nodes.get(edge.to)!);
  if (slope < SLOPE_NEEDED - SLOPE_TOLERANCE) return { at: edge.id, reason: 'uphill', needed: SLOPE_NEEDED, available: slope };
  const crossesBeam = (edge.crosses ?? []).some((id) => {
    const kind = kinds.get(id);
    return kind !== undefined && BLOCKING.has(kind);
  });
  if (crossesBeam && edge.sleeved !== true) return { at: edge.id, reason: 'crosses_beam', needed: null, available: null };
  return null;
}

// One-way graph: each node's hops in `to` id order.
function buildGraph(building: Building, nodes: ReadonlyMap<Id, BuildingNode>): Map<Id, Hop[]> {
  const out = new Map<Id, Map<Id, Edge[]>>();
  for (const edge of building.edges) {
    if (edge.kind !== 'drain_route') continue;
    if (!Number.isFinite(nodes.get(edge.from)?.invert) || !Number.isFinite(nodes.get(edge.to)?.invert)) continue;
    const hops = out.get(edge.from) ?? new Map<Id, Edge[]>();
    out.set(edge.from, hops);
    const list = hops.get(edge.to);
    if (list) list.push(edge);
    else hops.set(edge.to, [edge]);
  }
  const graph = new Map<Id, Hop[]>();
  for (const [from, hops] of out) {
    const list = [...hops].map(([to, edges]) => ({ to, edges: edges.sort((a, b) => byId(a.id, b.id)) }));
    graph.set(from, list.sort((a, b) => byId(a.to, b.to)));
  }
  return graph;
}

// null when some edge of the hop passes; else the block of the lowest-id edge.
function hopBlock(hop: Hop, check: (edge: Edge) => Block | null): Block | null {
  let first: Block | null = null;
  for (const edge of hop.edges) {
    const block = check(edge);
    if (block === null) return null;
    first ??= block;
  }
  return first;
}

// Breadth-first search; the first goal taken from the queue wins. Returns node ids, or null.
function search(graph: Map<Id, Hop[]>, token: Token, nodes: ReadonlyMap<Id, BuildingNode>, passes: (hop: Hop) => boolean): Id[] | null {
  if (!nodes.has(token.start)) return null;
  const isGoal = (id: Id): boolean => (token.goal === null ? nodes.get(id)?.is_exit === true : id === token.goal);
  const parent = new Map<Id, Id>();
  const seen = new Set<Id>([token.start]);
  const queue: Id[] = [token.start];
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head]!;
    if (isGoal(id)) {
      const path = [id];
      for (let at = parent.get(id); at !== undefined; at = parent.get(at)) path.push(at);
      return path.reverse();
    }
    for (const hop of graph.get(id) ?? []) {
      if (seen.has(hop.to) || !passes(hop)) continue;
      seen.add(hop.to);
      parent.set(hop.to, id);
      queue.push(hop.to);
    }
  }
  return null;
}

const record = (token: Token, path: Id[], block: Block | null, reason: Reason | null): SolverResult => ({
  token: token.id,
  status: reason === null ? 'pass' : 'fail',
  path,
  blocked_at: block?.at ?? null,
  reason,
  needed: block?.needed ?? null,
  available: block?.available ?? null,
});

export function downhill(building: Building, token: Token): SolverResult {
  const nodes = new Map(building.nodes.map((n) => [n.id, n]));
  const kinds = new Map(building.members.map((m) => [m.id, m.kind]));
  const graph = buildGraph(building, nodes);
  const blockOn = (hop: Hop): Block | null => hopBlock(hop, (edge) => edgeBlock(edge, nodes, kinds));

  const path = search(graph, token, nodes, (hop) => blockOn(hop) === null);
  if (path) return record(token, path, null, null);

  // Fail: search again with the checks off and report the first block on that path.
  // No path at all: no_route, and the water stays at its start ([] if the start is not a node).
  const stay = nodes.has(token.start) ? [token.start] : [];
  const open = search(graph, token, nodes, () => true) ?? stay;
  for (let i = 0; i + 1 < open.length; i++) {
    const hop = graph.get(open[i]!)!.find((h) => h.to === open[i + 1])!;
    const block = blockOn(hop);
    if (block) return record(token, open.slice(0, i + 1), block, block.reason);
  }
  return record(token, stay, null, 'no_route');
}
