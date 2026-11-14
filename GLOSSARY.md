# Glossary

Plain words for every term in `contract/types.ts`. Use these terms in code, tests, issues and UI.
Units are metres and kN.

## Game

- **Token**: one discipline's thing that must escape the building (chiller, glass panel, ...). Each token has a start, a goal, a size and one rule.
- **Escape**: run the solver and animate every token along its path.
- **Discipline**: the trade a token stands for: `mep`, `logistics`, `accessibility`, `structure`, `life_safety`, `fire`, `plumbing`, `electrical`.
- **Edit**: one change to the building, such as widening a door. Every edit re-solves every token.
- **Re-solve**: run the solver again on the building with all edits applied.
- **LEVEL COMPLETE**: every token passes.
- **Red X**: the mark drawn where a token is blocked (`blocked_at`).
- **Tier**: a scope band. Tier 1 must ship; tier 2 and tier 3 start only when the tier before is green.
- **Expected case**: one hand-checked scenario in `data/expected.json`: a list of edits and the results a person checked.

## Tokens (tier)

- **Chiller** (T1, `mep`, rule `clearance`): a big plant unit that must reach the truck on the street.
- **Glass** (T1, `logistics`, rule `corner_turn`): a long glass panel that must turn corridor corners.
- **Sofa** (T1, `logistics`, rule `corner_turn`): furniture that must turn corridor corners on its way out.
- **Wheelchair** (T1, `accessibility`, rule `no_steps`): must reach an exit with no step.
- **Load** (T1, `structure`, rule `downward`): gravity load that must reach a foundation through supporting members.
- **People** (T1 for the walk out, T2 for the race with smoke, `life_safety`, rule `shortest_exit`): walk the shortest path to an exit at a fixed speed.
- **Smoke** (T2, `fire`, rule `spread`): spreads one open edge per time step and races the people.
- **Water** (T2, `plumbing`, rule `downhill`): a drain that must fall all the way.
- **Power** (T3, `electrical`, rule `supply`): electricity from its start node (the building's service entry) through a `panel` node to the kitchen.

## Building graph

- **Building graph**: the building as nodes (spaces) joined by edges (ways through), plus structural members. Stored in `data/building.json`.
- **Level**: a floor, with an `elevation` in metres.
- **Node**: a space a token can be in. Types: `room`, `corridor`, `plant` (plant room), `shaft`, `stair`, `elevator`, `terrace`, `lobby`, `street` (outside), `truck` (the delivery truck), `panel` (electrical panel), `kitchen`.
- **Box**: a node's plan rectangle: `x`, `y` of one corner, `width` along x, `depth` along y.
- **Exit**: a node with `is_exit: true`.
- **Invert** (T2): the elevation of a drain at a node.
- **Edge**: a way between two nodes (`from`, `to`). Two-way, except `drain_route` and `supply`, which run from `from` to `to` only. Kinds: `door`, `opening`, `shaft`, `stair`, `elevator`, `ramp`, `step` (a small level change at one edge, such as a sill), `drain_route` (T2), `supply` (T3).
- **Clear width / clear height**: the free space through an edge.
- **Step height**: the small level change at one edge, such as a door sill; 0 means level. A change of floor is an edge between two levels.
- **Corner a / corner b**: corridor widths before and after a 90-degree turn at an edge.
- **Open** (T2): smoke can pass through the edge.
- **Crosses**: the members an edge passes through (for example a shaft through a beam).
- **Cuts above width**: if the edge's clear width grows above this value, every member it crosses is cut.
- **Sleeved** (T2): a drain may pass through the members the edge crosses.
- **Member**: a structural element: `column`, `beam`, `transfer_beam`, `foundation`.
- **Supported by**: the members that hold a member up. A foundation has none; every other member has at least one.
- **Member node**: the node where the viewer draws a member (optional `node` field).
- **Transfer beam**: a beam that carries load around an opening. The `add_transfer_beam` edit turns a member into one; a transfer beam is never cut.
- **Cut**: a member removed by a widened edge; nothing it supported is carried through it.

## Rules (which token, what passes)

- **clearance**: the token's width and height fit through every edge on the path.
- **corner_turn**: clearance, plus a box of width w and length L turns a corner only if L <= L_max (formula in `contract/README.md`); for a thin panel this is (a^(2/3) + b^(2/3))^(3/2).
- **no_steps**: a path to an exit with no `step` or `stair` edge and no step_height.
- **downward**: follow `supported_by` down to a foundation; fail if any member on the chain is cut.
- **shortest_exit**: people take the exit with the fewest edges; clearance applies; time = edges walked.
- **spread** (T2): smoke moves one open edge per time step.
- **downhill** (T2): every drain route falls by at least 1 %; a crossed beam must be sleeved.
- **supply** (T3): a path of `supply` edges from the start node through a `panel` node to the kitchen; fail if the only path is cut.

## Solver output

- **Solver**: the deterministic code in `solver/` that decides pass or fail. Not AI.
- **Status**: `pass` or `fail`.
- **Path**: the ids the token walked (member ids for `downward`).
- **Blocked at**: the edge, node or member where the token failed.
- **Needed / available**: the number the token needs there, and what the building gives.
- **Time** (T1 for people walking out; T2 for smoke): edges walked or time steps.
- **Reasons**: `too_narrow`, `too_low`, `cannot_turn`, `step`, `no_support`, `smoke_first` (T2), `uphill` (T2), `crosses_beam` (T2), `no_supply` (T3), `no_route`.

## Edits and AI

- **Edit ops**: `widen` (set a new clear width; corner widths grow to at least that), `add_transfer_beam` (the member becomes a transfer beam), `add_ramp` (the edge becomes a ramp with no step), `close_door` (T2, the edge is no longer open), `add_sleeve` (T2), `reset`. Full table: `contract/README.md`.
- **Source**: where an edit came from: `button`, `text` (T2), `voice` (T3), `phone` (T3).
- **Jev**: TypeSafe AI's typed-decision model. It parses a sentence into an edit (T2) and votes per discipline (T3). It never decides pass or fail.
- **Jev parse**: three typed answers about one sentence: which op, which target, what value, each with a confidence.
- **Confidence threshold**: 0.8. Below it, the app shows "Did you mean" and the buttons.
- **Vote**: `accept`, `object` or `review`, with a confidence. Shown as a bubble only.
- **Plan B**: a general LLM forced to return the same typed answers as Jev.
- **Plan C**: a keyword parser and the buttons.
- **Phone messages** (T3): `join`, `escape`, `vote` from a phone; `result` back to it.
- **Cityweft** (T2): the source of the city-block backdrop. Its files never enter the repo.
