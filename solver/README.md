# solver/

**Owner:** P1 (@purveshluhar).
**Purpose:** decide pass or fail for every token. Deterministic, under 100 ms. No AI here.
**Consumes:** `Building` (`data/building.json`) and an `Edit[]` list (`contract/types.ts`).
**Produces:** `SolverResult[]`, one per token, matching `contract/schema/solver-output.schema.json`.
**Entry:** `solver/index.ts` exports `solve(building, edits)` and `applyEdits(building, edits)`.

## Status

Starter stub. `IMPLEMENTED_RULES` is empty, so every expected case in `solver.test.ts` shows as
`todo`. Adding a rule to `IMPLEMENTED_RULES` turns its expected cases into real tests.

## Tier 1 first task

MVP first (ADR 0009): the search core and the wheelchair (`no_steps`), then the sofa
(`corner_turn`, with the token's width) and people walking out (`shortest_exit`, no smoke).
Then the chiller (`clearance`), the load (`downward` and the `cuts_above_width`
shaft-breaks-beam rule) and the glass. The rule text is the "Rule details" section of
`contract/README.md`. Use the `solver-token` skill for each.
