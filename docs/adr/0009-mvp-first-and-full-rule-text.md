# 0009. MVP first: wheelchair, sofa and people walk out; the rules are written down in full

Status: accepted (2026-11-14). Supersedes the tier 1 definition and the clock times in 0005.
It does not change the tier names or the tag names.

## Context

The solver is a stub (`IMPLEMENTED_RULES` is empty in `solver/index.ts`). P5 builds the real
building from the contract (building.json v1 has landed). The contract left holes a generated
building would fall through: no rule said which edge kinds a token may use, `step_height` had
two meanings, and the corner formula ignored a token's width. A grilling of P1's plan set the
order; then the team dropped the timeline from the plan.

## Decision

- MVP first: the wheelchair (`no_steps`), a sofa (`corner_turn`, discipline `logistics`) and
  people (`shortest_exit`, no smoke) walk out to any exit. Each object starts in its room
  (`Token.start`); the player picks the object, with no second click.
- The first gate is the MVP gate: wheelchair, sofa and people green on their expected cases. It
  replaces "chiller end to end" as the first checkpoint. `tier1-demo` is tagged at the MVP gate.
- Chiller, glass, load and the shaft-breaks-beam moment build on top, after the MVP gate. They
  join `tier1-demo` (re-tagged) when green.
- People walking out is tier 1; the race with smoke stays tier 2.
- Gates are defined by what is green, not by the clock. Go/no-go calls are conditions: Jev
  switches to plan B or C if there is no key or calls take over 2 s; phones fall back to a
  stage-only demo if the venue wifi blocks local sockets. Tier 2 starts when every tier 1 token
  is green (the re-tagged `tier1-demo`); tier 3 starts after `tier2-demo`.
- The contract README gets a rule-details section: an edge-kind table per rule, the corner rule
  with the token's width, an elevator-car fit check, fewest-edges search with node-id ties, the
  first block on the shortest unchecked path, and a needed/available table.
- `step_height` is a sill only. A floor change is an edge between two levels, of kind stair,
  elevator, shaft, ramp, drain_route or supply; `npm test` rejects any other.
- Power (tier 3): a supply edge is cut when a member in its `crosses` is cut. Widening the shaft
  cuts beam B2 and the power riser together; the transfer beam restores both. No edit op is added.
- P5 writes the hand-checked cases for the sofa and the people before their rules land.

## Consequences

No field or enum changes, so no folder breaks. The sofa looks the same as the glass on screen. A
2 m long, 0.9 m wide sofa fails a 1.2 m / 1.5 m corner (L_max about 1.997 m; P5 picks a sofa
length with margin). The current expected cases keep their answers (glass L_max about 3.71 m
before and 4.43 m after the lobby widening). An `elevator` edge needs a node of type `elevator`
at one end for the car fit; `npm test` checks this once `data/building.json` has an elevator
node.
