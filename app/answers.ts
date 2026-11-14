// Stand-in answers from data/expected.json, used only for tokens whose rule the solver does not
// implement yet (solver IMPLEMENTED_RULES). As P1 adds rules, the real solver takes over token by
// token and this file stops being used. Pure, so Node tests can check it. Owner: P3.
import type { Building, Edit, ExpectedFile, ExpectedResult, Id, SolverResult, Token } from '../contract/types.ts';

export type Source = 'solver' | 'expected';

export interface Answer extends SolverResult {
  source: Source; // where this answer came from, so the UI can say so
}

const editKey = (e: Edit): string => `${e.op}|${e.target ?? ''}|${e.value ?? ''}`;

// The ids that matter to one token: every place it was ever blocked in expected.json, plus every
// edge that cuts through one of those places (widening the plant shaft cuts beam B2, so the shaft
// matters to the load). Edits on anything else do not change this token's answer.
export function relevantTargets(building: Building, expected: ExpectedFile, token: Id): Set<Id> {
  const ids = new Set<Id>();
  for (const c of expected.cases) {
    for (const r of c.expect) if (r.token === token && r.blocked_at) ids.add(r.blocked_at);
  }
  for (const edge of building.edges) {
    if (edge.crosses?.some((m) => ids.has(m))) ids.add(edge.id);
  }
  return ids;
}

const relevantKeys = (edits: readonly Edit[], targets: Set<Id>): string =>
  edits.filter((e) => e.op !== 'reset' && e.target !== null && targets.has(e.target)).map(editKey).sort().join(',');

// The expected answer for one token under the current edits: the case whose relevant edits equal
// ours, preferring the case with the most edits. Null when no case covers this combination.
export function expectedFor(
  building: Building, expected: ExpectedFile, token: Id, edits: readonly Edit[],
): ExpectedResult | null {
  const targets = relevantTargets(building, expected, token);
  const want = relevantKeys(edits, targets);
  let best: { size: number; r: ExpectedResult } | null = null;
  for (const c of expected.cases) {
    const r = c.expect.find((x) => x.token === token);
    if (!r || relevantKeys(c.edits, targets) !== want) continue;
    if (!best || c.edits.length > best.size) best = { size: c.edits.length, r };
  }
  return best?.r ?? null;
}

// Node route from start to goal (any exit when goal is null), by breadth-first search over edges.
// Ignores the rules: it only gives the viewer a line to draw for a stand-in answer.
export function nodeRoute(building: Building, from: Id, to: Id | null): Id[] {
  const isGoal = (id: Id): boolean => (to === null ? building.nodes.some((n) => n.id === id && n.is_exit) : id === to);
  const prev = new Map<Id, Id | null>([[from, null]]);
  const queue: Id[] = [from];
  while (queue.length > 0) {
    const at = queue.shift()!;
    if (isGoal(at)) {
      const path: Id[] = [];
      for (let n: Id | null = at; n !== null; n = prev.get(n) ?? null) path.unshift(n);
      return path;
    }
    for (const e of building.edges) {
      const next = e.from === at ? e.to : e.to === at ? e.from : null;
      if (next !== null && !prev.has(next)) {
        prev.set(next, at);
        queue.push(next);
      }
    }
  }
  return [from];
}

// Member route for the load: down supported_by until a foundation.
function memberRoute(building: Building, from: Id): Id[] {
  const path: Id[] = [];
  let at = building.members.find((m) => m.id === from);
  while (at && !path.includes(at.id)) {
    path.push(at.id);
    const below = at.supported_by[0];
    at = below === undefined ? undefined : building.members.find((m) => m.id === below);
  }
  return path;
}

function routeFor(building: Building, token: Token, r: ExpectedResult): Id[] {
  if (r.path && r.path.length > 0) return r.path;
  if (token.rule === 'downward') return r.status === 'pass' ? memberRoute(building, token.start) : [token.start];
  if (r.status === 'pass') return nodeRoute(building, token.start, token.goal);
  // On a fail, walk up to the near side of the blocking edge.
  const edge = building.edges.find((e) => e.id === r.blocked_at);
  if (!edge) return [token.start];
  const toFrom = nodeRoute(building, token.start, edge.from);
  const toTo = nodeRoute(building, token.start, edge.to);
  const reachesFrom = toFrom[toFrom.length - 1] === edge.from;
  const reachesTo = toTo[toTo.length - 1] === edge.to;
  if (reachesFrom && reachesTo) return toFrom.length <= toTo.length ? toFrom : toTo;
  return reachesFrom ? toFrom : reachesTo ? toTo : [token.start];
}

// Needs and has, from the edited building, for the reasons the data can measure.
export function measure(building: Building, token: Token, r: ExpectedResult): { needed: number | null; available: number | null } {
  const edge = building.edges.find((e) => e.id === r.blocked_at);
  if (!edge) return { needed: null, available: null };
  switch (r.reason) {
    case 'too_narrow':
      return { needed: token.size.width, available: edge.clear_width };
    case 'too_low':
      return { needed: token.size.height, available: edge.clear_height };
    case 'step':
      return { needed: 0, available: edge.step_height };
    case 'cannot_turn':
      return { needed: null, available: Math.min(edge.corner_a ?? edge.clear_width, edge.corner_b ?? edge.clear_width) };
    default:
      return { needed: null, available: null };
  }
}

// One answer per token: the solver's when it implements the token's rule, else expected.json's,
// else the solver's placeholder. `edited` is the building with the edits applied.
export function answers(
  building: Building, edited: Building, edits: readonly Edit[], solved: SolverResult[],
  expected: ExpectedFile, implemented: readonly string[],
): Answer[] {
  return solved.map((s) => {
    const token = edited.tokens.find((t) => t.id === s.token);
    if (!token || implemented.includes(token.rule)) return { ...s, source: 'solver' };
    const r = expectedFor(building, expected, s.token, edits);
    if (!r) return { ...s, source: 'solver' };
    const fail = r.status === 'fail';
    const m = fail ? measure(edited, token, r) : { needed: null, available: null };
    return {
      token: s.token,
      status: r.status,
      path: routeFor(edited, token, r),
      blocked_at: fail ? r.blocked_at ?? null : null,
      reason: fail ? r.reason ?? 'no_route' : null,
      needed: m.needed,
      available: m.available,
      source: 'expected',
    };
  });
}
