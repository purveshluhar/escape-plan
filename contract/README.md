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

## Rule details

### Which edges each rule uses

A token searches only the edge kinds in its row. `drain_route` and `supply` carry no walking token.

| Rule | Tokens | Edge kinds it may use | Always blocks |
|---|---|---|---|
| `clearance` | chiller | door, opening, ramp, step, stair, elevator, shaft | - |
| `corner_turn` | glass, sofa | door, opening, ramp, step, stair, elevator | - |
| `no_steps` | wheelchair | door, opening, ramp, elevator, step, stair | `step` and `stair` edges, and any edge with `step_height > 0`: reason `step` |
| `shortest_exit` | people | door, opening, ramp, step, stair | - |
| `spread` (T2) | smoke | every kind except drain_route and supply, where `open` is not false | - |
| `downhill` (T2) | water | drain_route | - |
| `supply` (T3) | power | supply | a supply edge with a cut member in its `crosses` (the same cut as `downward`): reason `no_supply` |
| `downward` | load | none: it walks `supported_by` | - |

### Checks on the way (every walking rule)

- Width: `clear_width >= size.width`. Height: `clear_height >= size.height`. Equal passes.
- `corner_turn`, at an edge with both `corner_a` (a) and `corner_b` (b) set: the token turns only
  if `size.length <= L_max`, where
  `L_max = min over t in (0, 90 deg) of a / cos t + b / sin t - w / (sin t * cos t)`, `w = size.width`.
  Sample t in 0.1 degree steps. With w = 0 this is (a^(2/3) + b^(2/3))^(3/2).
- Elevator car: a token that enters a node of type `elevator` must fit its box in plan:
  (`width <= box.width` and `length <= box.depth`) or the same turned 90 degrees. Else `too_narrow`
  at that node.
- Check order at one edge: step, width, height, corner.

### Search and the fail record

- Shortest path = fewest edges, by breadth-first search. Neighbours in node id order; ties go to
  the lower node id. `goal: null` = the nearest node with `is_exit: true`.
- Pass: `path` = node ids start to goal; `blocked_at`, `reason`, `needed`, `available` = null.
  `shortest_exit`: `time` = edges on the path.
- Fail: search again with the checks off (kinds from the table still apply). Walk that path and
  report the FIRST edge or elevator node that fails a check. `path` = node ids from start up to
  the last node before the block. No path at all: `no_route`, `blocked_at: null`.

| reason | needed | available |
|---|---|---|
| too_narrow | `size.width` (elevator: the side that does not fit) | `clear_width` (elevator: that box side) |
| too_low | `size.height` | `clear_height` |
| cannot_turn | `size.length` | `L_max` |
| step | 0 | `step_height` (a stair: the elevation difference of its two levels) |
| no_support | the cutting edge's `cuts_above_width` | its `clear_width` |
| no_supply | the cut member's edge `cuts_above_width` | its `clear_width` |
| no_route | null | null |

### Levels

`step_height` is the small level change at one edge (a door sill). A change of floor is an edge
whose two nodes sit on different levels. Its kind must be stair, elevator, shaft, ramp,
drain_route or supply; `npm test` rejects any other kind. An `elevator` edge must have a node of
type `elevator` at one end, so the car box exists. `npm test` does not check this yet: the check
lands after `data/building.json` gets an elevator node.

## Changing the contract

Only P1 changes this folder, and only at a merge point. Everyone is told first.
To ask for a change, use the `contract-change` skill (`.claude/skills/contract-change/SKILL.md`).
A change must update `types.ts`, every schema that repeats the field or enum, and `examples.ts`
together.
`npm test` fails if a schema enum and a `types.ts` enum drift apart.
