// Solver: building + edits in, one SolverResult per token out. Deterministic, under 100 ms.
// Owner: P1. STARTER: applyEdits follows the edit table in contract/README.md, but no token rule
// is implemented yet (IMPLEMENTED_RULES is empty). Add rules with the `solver-token` skill.
import type { Building, Edit, Rule, SolverResult } from '../contract/types.ts';

// Rules this solver really answers. solver.test.ts checks expected.json only for these.
export const IMPLEMENTED_RULES: readonly Rule[] = [];

// Apply edits in order to a copy of the building. The input is never changed.
// An edit whose target does not exist is ignored.
export function applyEdits(building: Building, edits: readonly Edit[]): Building {
  let b: Building = structuredClone(building);
  for (const edit of edits) {
    const edge = b.edges.find((x) => x.id === edit.target);
    switch (edit.op) {
      case 'reset':
        b = structuredClone(building);
        break;
      case 'widen':
        if (edge && edit.value !== null) {
          edge.clear_width = edit.value;
          if (edge.corner_a !== undefined) edge.corner_a = Math.max(edge.corner_a, edit.value);
          if (edge.corner_b !== undefined) edge.corner_b = Math.max(edge.corner_b, edit.value);
        }
        break;
      case 'add_transfer_beam': {
        const member = b.members.find((m) => m.id === edit.target);
        if (member) member.kind = 'transfer_beam';
        break;
      }
      case 'add_ramp':
        if (edge) {
          edge.kind = 'ramp';
          edge.step_height = 0;
        }
        break;
      case 'close_door':
        if (edge) edge.open = false;
        break;
      case 'add_sleeve':
        if (edge) edge.sleeved = true;
        break;
    }
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
