# contract/ - the shared formats

Owner: **P1** (purveshluhar). Every folder builds against these files. Read them first.

| File | What it is |
|---|---|
| `types.ts` | TypeScript types and enum lists for every format. Import types from here. |
| `schema/building.schema.json` | `data/building.json`: levels, nodes, edges, members, tokens (plan 4.1). |
| `schema/solver-output.schema.json` | Solver output: an array, one record per token (plan 4.2). |
| `schema/edits.schema.json` | The edit list: `op`, `target`, `value`, `source` (plan 4.3). |
| `schema/jev.schema.json` | Jev parse request and answer (T2), vote request and vote (T3). |
| `schema/phone.schema.json` | Phone messages over WebSocket (T3): `join`, `escape`, `vote`, and `result`. |
| `schema/expected.schema.json` | `data/expected.json`: P5's hand-checked cases. |
| `validate.ts` | `validate(ref, data)` (schema check, no extra package) and `checkBuildingRefs(building)`. |
| `examples.ts` | One typed example of each format. |
| `contract.test.ts` | Checks the examples against the schemas, and the schema enums against `types.ts`. |

## Rules

- Units are metres and kN. Ids are strings, unique inside their list.
- T1 = must ship. Fields and enum values marked T2 or T3 are optional until that tier starts.
- The solver decides pass or fail. Jev (or plan B or C) only fills `JevParse` and `JevVote`.
  A vote is a bubble. It never changes a token's colour or status.
- `JevParse` is the same shape for Jev, plan B (a general LLM with typed answers) and plan C
  (a keyword parser). Accept it only when every confidence is >= `JEV_ACCEPT_CONFIDENCE` (0.8).
- `Token.goal = null` means "any node with `is_exit: true`" (for rule `downward`: any foundation).
- For rule `downward`, `Token.start` is a member id and `path` lists member ids.
- Edges are two-way, except `drain_route` and `supply`, which run only from `from` to `to`.
- `Member.node` (optional) is the node where the viewer draws a member, so the load's red X
  has a place. A foundation has `supported_by: []`; every other member has at least one support.

## Edit effects

`applyEdits()` in `solver/index.ts` follows this table. Expected cases are checked against it.

| op | target | value | Effect |
|---|---|---|---|
| `widen` | edge | metres | `clear_width = value`. `corner_a` and `corner_b`, where set, become at least `value`. |
| `add_transfer_beam` | member | null | The member becomes `kind: 'transfer_beam'`. A transfer beam is never cut. |
| `add_ramp` | edge | null | `kind = 'ramp'`, `step_height = 0`. |
| `close_door` (T2) | edge | null | `open = false`. |
| `add_sleeve` (T2) | edge | null | `sleeved = true`. |
| `reset` | null | null | Back to `data/building.json`. |

An edit whose target does not exist changes nothing.

## Changing the contract

Only P1 changes this folder, and only at an hourly merge point. Everyone is told first.
To ask for a change, use the `contract-change` skill (`.claude/skills/contract-change/SKILL.md`).
A change must update `types.ts`, every schema that repeats the field or enum, and `examples.ts`
together.
`npm test` fails if a schema enum and a `types.ts` enum drift apart.
