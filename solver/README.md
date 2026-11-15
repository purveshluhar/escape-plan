# solver/

**Owner:** P1 (@purveshluhar).
**Purpose:** decide pass or fail for every token. Deterministic, under 100 ms. No AI here.
**Consumes:** `Building` (`data/building.json`) and an `Edit[]` list (`contract/types.ts`).
**Produces:** `SolverResult[]`, one per token, matching `contract/schema/solver-output.schema.json`.
**Entry:** `solver/index.ts` exports `solve(building, edits)` and `applyEdits(building, edits)`.

## Status

Every tier 1 rule is done: `no_steps` (wheelchair), `corner_turn` (sofa and glass),
`shortest_exit` (people, no smoke), `clearance` (chiller) and `downward` (load). The full-demo
edits give LEVEL COMPLETE (`level-complete.test.ts`). Tier 2 `spread` (smoke, and the people
race with it) is done. The other tier 2 and 3 rules are still placeholders, so their expected
cases in `solver.test.ts` show as `todo`. Adding a rule to `RULE_SOLVERS` in `index.ts` puts
it in `IMPLEMENTED_RULES` and turns its expected cases into real tests.

## Files

- `search.ts`: the search core for every walking rule. It builds the token's graph from the
  rule's edge kinds, runs the breadth-first search, checks the elevator car, and builds the
  fail record. It also holds the width and height checks.
- `corner-turn.ts`: `lMax(a, b, w)`, the longest token of width w that turns the corner, and
  the corner check that uses it.
- One file per rule: `no-steps.ts` gives the rule's edge kinds and its edge checks in order.
  A new walking rule adds its own checks and calls `walk()`.
  `clearance.ts` (chiller) does this with width and height only, and adds `shaft`.
- `shortest-exit.ts`: people. It calls `walk()` with width and height only, and adds `time`:
  the edges walked on a pass, null on a fail.
- `spread.ts`: smoke (T2). Smoke moves one open edge per time step (`buildGraph()` from the
  core, no checks). People race it in `shortest-exit.ts`: smoke at a path node at the same step
  or earlier gives `smoke_first` there. Tests use fixtures until P5 adds smoke cases.
- `downward.ts`: the load. It walks `supported_by` to a foundation and holds `cutOf()`, the
  shaft-breaks-beam cut (also for `supply` later).
- `downhill.ts`: water (T2). It walks `drain_route` edges one way, from `from` to `to`. Each
  edge must fall at least 1 % over the plan distance between the two box centres (`uphill`),
  and must not cross a beam or transfer beam unless sleeved (`crosses_beam`). It has its own
  one-way search, so `search.ts` stays two-way. `downhill.test.ts` uses a fixture until P5 adds
  water data.
- `mvp-resolve.test.ts`: the MVP gate (P1-07). One edit changes each MVP token's result, solve()
  over every expected case stays under 100 ms, and solve() is pure and deterministic. The sofa
  and people are in `data/building.json`, with their cases in `data/expected.json`.
- `level-complete.test.ts`: the tier 1 gate (P1-19). The glass record at `lobby-door`, every tier 1
  rule implemented, and the full-demo edits giving LEVEL COMPLETE for the tier 1 tokens in any
  order, with each fix needed. It reads the fixes from `full-demo`, so it holds when P5 adds
  tokens. `full-demo` includes the office door fix that lets people out.

## Tier 1 first task

MVP first (ADR 0009): the search core and the wheelchair (`no_steps`), then the sofa
(`corner_turn`, with the token's width) and people walking out (`shortest_exit`, no smoke).
Then the chiller (`clearance`), the load (`downward` and the `cuts_above_width`
shaft-breaks-beam rule) and the glass. The rule text is the "Rule details" section of
`contract/README.md`. Use the `solver-token` skill for each.
