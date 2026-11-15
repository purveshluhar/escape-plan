// Search core for every walking rule (contract/README.md, "Rule details"). A rule file gives the
// edge kinds it may use and its edge checks in order; this file builds the token's graph, runs
// the breadth-first search, checks the elevator car, and builds the SolverResult.
import type { Building, BuildingNode, Edge, EdgeKind, Id, Level, Reason, SolverResult, Token } from '../contract/types.ts';

// drain_route and supply carry no walking token.
export type WalkKind = Exclude<EdgeKind, 'drain_route' | 'supply'>;

// Where a token is stopped, and the numbers for its fail record.
export interface Block {
  at: Id; // edge id, or the id of an elevator node
  reason: Reason;
  needed: number;
  available: number;
}

// The building's nodes and levels by id, built once per walk, for checks to look up.
export interface Site {
  nodes: ReadonlyMap<Id, BuildingNode>;
  levels: ReadonlyMap<Id, Level>;
}

// One check at one edge: null when the token gets through.
export type EdgeCheck = (edge: Edge, token: Token, site: Site) => Block | null;

export interface WalkRule {
  kinds: readonly WalkKind[]; // the rule's row in the edge-kind table
  checks: readonly EdgeCheck[]; // in the contract's order: step, width, height, corner
}

export const widthCheck: EdgeCheck = (edge, token) =>
  edge.clear_width >= token.size.width
    ? null
    : { at: edge.id, reason: 'too_narrow', needed: token.size.width, available: edge.clear_width };

export const heightCheck: EdgeCheck = (edge, token) =>
  edge.clear_height >= token.size.height
    ? null
    : { at: edge.id, reason: 'too_low', needed: token.size.height, available: edge.clear_height };

// A token entering an elevator node must fit the car box in plan, either way round.
// When it fits neither way, the record names the first side that fails unturned:
// width against box.width, then length against box.depth.
export function carCheck(node: BuildingNode, token: Token): Block | null {
  if (node.type !== 'elevator') return null;
  const { width, length } = token.size;
  const box = node.box;
  if ((width <= box.width && length <= box.depth) || (width <= box.depth && length <= box.width)) return null;
  return width > box.width
    ? { at: node.id, reason: 'too_narrow', needed: width, available: box.width }
    : { at: node.id, reason: 'too_narrow', needed: length, available: box.depth };
}

// Two-way neighbours of each node, in node id order. Each hop keeps every edge between the
// same two nodes, in edge id order: one edge that passes is enough to make the hop.
export interface Hop {
  to: Id;
  edges: Edge[];
}

export const byId = (a: Id, b: Id): number => (a < b ? -1 : a > b ? 1 : 0);

// An edge whose end is not a node is left out. Exported for `spread` (smoke), which has no checks.
export function buildGraph(building: Building, nodes: ReadonlyMap<Id, BuildingNode>, kinds: readonly WalkKind[]): Map<Id, Hop[]> {
  const hops = new Map<Id, Map<Id, Edge[]>>();
  const add = (from: Id, to: Id, edge: Edge): void => {
    const out = hops.get(from) ?? new Map<Id, Edge[]>();
    hops.set(from, out);
    const list = out.get(to);
    if (list) list.push(edge);
    else out.set(to, [edge]);
  };
  for (const edge of building.edges) {
    if (!(kinds as readonly EdgeKind[]).includes(edge.kind)) continue;
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) continue;
    add(edge.from, edge.to, edge);
    add(edge.to, edge.from, edge);
  }
  const graph = new Map<Id, Hop[]>();
  for (const [from, out] of hops) {
    const list = [...out].map(([to, edges]) => ({ to, edges: edges.sort((a, b) => byId(a.id, b.id)) }));
    graph.set(from, list.sort((a, b) => byId(a.to, b.to)));
  }
  return graph;
}

// The first block on one hop, or null when some edge of the hop passes and the node it enters
// passes the car check. With no passing edge, the block is the first failing check of the
// lowest-id edge.
function hopBlock(hop: Hop, site: Site, token: Token, rule: WalkRule): Block | null {
  let first: Block | null = null;
  let passed = false;
  for (const edge of hop.edges) {
    const block = rule.checks.reduce<Block | null>((found, check) => found ?? check(edge, token, site), null);
    if (block === null) {
      passed = true;
      break;
    }
    first ??= block;
  }
  if (!passed) return first;
  const node = site.nodes.get(hop.to);
  return node ? carCheck(node, token) : null;
}

// Breadth-first search with a first-in, first-out queue and neighbours in node id order. The
// first goal taken from the queue wins. So the path has the fewest edges, and of two such paths
// the one with the lower node id where they first differ wins. Returns node ids, or null.
function search(
  graph: Map<Id, Hop[]>,
  token: Token,
  nodes: ReadonlyMap<Id, BuildingNode>,
  passes: (hop: Hop) => boolean,
): Id[] | null {
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

function fail(token: Token, path: Id[], block: Block | null): SolverResult {
  return {
    token: token.id,
    status: 'fail',
    path,
    blocked_at: block?.at ?? null,
    reason: block?.reason ?? 'no_route',
    needed: block?.needed ?? null,
    available: block?.available ?? null,
  };
}

// Solve one walking token: pass with its shortest path, or the fail record from the contract.
export function walk(building: Building, token: Token, rule: WalkRule): SolverResult {
  const nodes = new Map(building.nodes.map((n) => [n.id, n]));
  const site: Site = { nodes, levels: new Map(building.levels.map((l) => [l.id, l])) };
  const graph = buildGraph(building, nodes, rule.kinds);
  const blockOn = (hop: Hop): Block | null => hopBlock(hop, site, token, rule);

  const path = search(graph, token, nodes, (hop) => blockOn(hop) === null);
  if (path) return { token: token.id, status: 'pass', path, blocked_at: null, reason: null, needed: null, available: null };

  // Fail: search again with the checks off, then report the first block on that path.
  // No path at all: no_route, and the token stays at its start ([] if the start is not a node).
  const stay = nodes.has(token.start) ? [token.start] : [];
  const open = search(graph, token, nodes, () => true) ?? stay;
  for (let i = 0; i + 1 < open.length; i++) {
    const hop = graph.get(open[i]!)!.find((h) => h.to === open[i + 1])!;
    const block = blockOn(hop);
    if (block) return fail(token, open.slice(0, i + 1), block);
  }
  // Reached only with no route: a checks-off path with no block would have passed above.
  return fail(token, stay, null);
}
