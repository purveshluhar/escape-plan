// Rule `downward` (load): contract/README.md, "Rule details". The load walks `supported_by` from
// its start member to a foundation (goal null) or to the goal member. A member is cut when an
// edge that crosses it has clear_width > cuts_above_width, unless it is a transfer_beam; a cut
// member carries no load. Fail: `no_support` at the first cut member, or `no_route`.
import type { Building, Edge, Id, Member, SolverResult, Token } from '../contract/types.ts';

const byId = (a: Id, b: Id): number => (a < b ? -1 : a > b ? 1 : 0);

// Each cut member and the edge that cuts it. Of two cutting edges, the lower edge id is kept.
// Exported for the `supply` rule (power), which uses the same cut.
export function cutOf(building: Building): Map<Id, Edge> {
  const kinds = new Map(building.members.map((m) => [m.id, m.kind]));
  const cut = new Map<Id, Edge>();
  const edges = [...building.edges].sort((a, b) => byId(a.id, b.id));
  for (const edge of edges) {
    if (edge.cuts_above_width === undefined || !(edge.clear_width > edge.cuts_above_width)) continue;
    for (const id of edge.crosses ?? []) {
      const kind = kinds.get(id);
      if (kind !== undefined && kind !== 'transfer_beam' && !cut.has(id)) cut.set(id, edge);
    }
  }
  return cut;
}

// Breadth-first search down `supported_by`, supports in member id order, so the path has the
// fewest members and ties go to the lower id. `passes` decides if a member may carry the load.
// Returns member ids from start to goal, or null.
function search(members: ReadonlyMap<Id, Member>, token: Token, passes: (id: Id) => boolean): Id[] | null {
  if (!members.has(token.start) || !passes(token.start)) return null;
  const isGoal = (id: Id): boolean => (token.goal === null ? members.get(id)?.kind === 'foundation' : id === token.goal);
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
    const supports = [...(members.get(id)?.supported_by ?? [])].sort(byId);
    for (const next of supports) {
      if (seen.has(next) || !members.has(next) || !passes(next)) continue;
      seen.add(next);
      parent.set(next, id);
      queue.push(next);
    }
  }
  return null;
}

const result = (token: Token, fields: Omit<SolverResult, 'token'>): SolverResult => ({ token: token.id, ...fields });

export function downward(building: Building, token: Token): SolverResult {
  const members = new Map(building.members.map((m) => [m.id, m]));
  const cut = cutOf(building);

  const path = search(members, token, (id) => !cut.has(id));
  if (path) return result(token, { status: 'pass', path, blocked_at: null, reason: null, needed: null, available: null });

  // Fail: search again with the cut off, then report the first cut member on that path.
  // `path` runs from the start up to and including that member, so a cut start still has a
  // place: [start], as viewer/fixtures.ts and app/scoreboard.test.ts expect.
  const open = search(members, token, () => true);
  const at = open?.findIndex((id) => cut.has(id)) ?? -1;
  if (open && at >= 0) {
    const edge = cut.get(open[at]!)!;
    return result(token, {
      status: 'fail', path: open.slice(0, at + 1), blocked_at: open[at]!, reason: 'no_support',
      needed: edge.cuts_above_width!, available: edge.clear_width,
    });
  }
  // No route even with the cut off: the load stays at its start ([] if the start is not a member).
  const stay = members.has(token.start) ? [token.start] : [];
  return result(token, { status: 'fail', path: stay, blocked_at: null, reason: 'no_route', needed: null, available: null });
}
