// Solver: building + edits in, one SolverResult per token out. Deterministic, under 100 ms.
// Owner: P1. STARTER STUB: no token rule is implemented yet (IMPLEMENTED_RULES is empty).
// Add rules with the `solver-token` skill. Tests in solver.test.ts turn on per rule.
import type { Building, Edit, Rule, SolverResult } from '../contract/types.ts';

// Rules this solver really answers. solver.test.ts checks expected.json only for these.
export const IMPLEMENTED_RULES: readonly Rule[] = [];

// Apply edits in order to a copy of the building. The input is never changed.
export function applyEdits(building: Building, edits: readonly Edit[]): Building {
  let b: Building = structuredClone(building);
  for (const edit of edits) {
    if (edit.op === 'reset') {
      b = structuredClone(building);
    } else if (edit.op === 'widen') {
      const e = b.edges.find((x) => x.id === edit.target);
      if (e && edit.value !== null) e.clear_width = edit.value;
    }
    // TODO(P1): add_transfer_beam, add_ramp, close_door, add_sleeve (T2).
  }
  return b;
}

export function solve(building: Building, edits: readonly Edit[] = []): SolverResult[] {
  const b = applyEdits(building, edits);
  return b.tokens.map((token) => ({
    // Placeholder until the token's rule is in IMPLEMENTED_RULES. The UI shows it as "not solved".
    token: token.id,
    status: 'fail',
    path: [],
    blocked_at: null,
    reason: 'no_route',
    needed: null,
    available: null,
  }));
}
