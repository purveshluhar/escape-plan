# solver/

**Owner:** P1 (purveshluhar).
**Purpose:** decide pass or fail for every token. Deterministic, under 100 ms. No AI here.
**Consumes:** `Building` (`data/building.json`) and an `Edit[]` list (`contract/types.ts`).
**Produces:** `SolverResult[]`, one per token, matching `contract/schema/solver-output.schema.json`.
**Entry:** `solver/index.ts` exports `solve(building, edits)` and `applyEdits(building, edits)`.

## Status

Starter stub. `IMPLEMENTED_RULES` is empty, so every expected case in `solver.test.ts` shows as
`todo`. Adding a rule to `IMPLEMENTED_RULES` turns its expected cases into real tests.

## Tier 1 first task

Chiller end to end by 14:30: the `clearance` rule (clear width and height on every edge, plant
to truck). Then glass (`corner_turn`), wheelchair (`no_steps`), load (`downward`), and the
`cuts_above_width` shaft-breaks-beam rule. Use the `solver-token` skill for each.
