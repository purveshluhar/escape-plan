# solver/

**Owner:** P1 (@purveshluhar).
**Purpose:** decide pass or fail for every token. Deterministic, under 100 ms. No AI here.
**Consumes:** `Building` (`data/building.json`) and an `Edit[]` list (`contract/types.ts`).
**Produces:** `SolverResult[]`, one per token, matching `contract/schema/solver-output.schema.json`.
**Entry:** `solver/index.ts` exports `solve(building, edits)` and `applyEdits(building, edits)`.

## Status

`no_steps` (wheelchair) is done.
`corner_turn` (sofa; the glass cases run on it too) is done.
Every other rule is still a placeholder, so its expected cases in
`solver.test.ts` show as `todo`. Adding a rule to `RULE_SOLVERS` in `index.ts` puts it in
`IMPLEMENTED_RULES` and turns its expected cases into real tests.

## Files

- `search.ts`: the search core for every walking rule. It builds the token's graph from the
  rule's edge kinds, runs the breadth-first search, checks the elevator car, and builds the
  fail record. It also holds the width and height checks.
- `corner-turn.ts`: `lMax(a, b, w)`, the longest token of width w that turns the corner, and
  the corner check that uses it.
- One file per rule: `no-steps.ts` gives the rule's edge kinds and its edge checks in order.
  A new walking rule (for example `corner_turn`) adds its own check and calls `walk()`.

## Tier 1 first task

MVP first (ADR 0009): the search core and the wheelchair (`no_steps`), then the sofa
(`corner_turn`, with the token's width) and people walking out (`shortest_exit`, no smoke).
Then the chiller (`clearance`), the load (`downward` and the `cuts_above_width`
shaft-breaks-beam rule) and the glass. The rule text is the "Rule details" section of
`contract/README.md`. Use the `solver-token` skill for each.
