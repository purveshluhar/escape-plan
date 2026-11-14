---
name: solver-token
description: Add or fix one token rule in solver/ (clearance, corner_turn, no_steps, downward, then T2/T3 rules). Use when P1 implements a token, or a solver expected case fails.
---

# Add a token rule to the solver

Every rule has the same four parts: filter the edges, search a path, build the record, test it.
The solver decides pass or fail. It is deterministic and must answer all tokens in under 100 ms.

## Steps

1. **Read the rule.** `GLOSSARY.md` (Rules), plan table in `docs/plan.md`, and the token's
   cases in `data/expected.json`. Write down what `blocked_at`, `reason`, `needed` and
   `available` mean for this rule.
2. **Apply edits first.** `applyEdits(building, edits)` returns a new building. Add any edit op
   the rule needs there (for example `add_transfer_beam`, `add_ramp`). Never mutate the input.
3. **Filter.** Decide which edges the token may use:
   - `clearance`: `clear_width >= size.width` and `clear_height >= size.height`;
   - `corner_turn`: clearance, and where `corner_a` and `corner_b` are set,
     `size.length <= (a^(2/3) + b^(2/3))^(3/2)`;
   - `no_steps`: no edge with `kind: 'step'` or `step_height > 0`;
   - `downward`: walk `supported_by` from the start member; a member is cut if an edge that
     crosses it has `clear_width > cuts_above_width`, unless it is a `transfer_beam`.
4. **Search.** Breadth-first search from `start` to `goal` (or to any `is_exit` node when
   `goal` is null). Edges are two-way, except `drain_route` and `supply` (from to to only).
   Visit neighbours in node id order, so the path is the same every run.
5. **Build the record** (`SolverResult`):
   - pass: `path` from start to goal, `blocked_at`, `reason`, `needed`, `available` all `null`;
   - fail: search again with the filter off to find where the best path is blocked. Set
     `blocked_at` to that edge or member, `reason` from the contract list, `needed` and
     `available` to the two numbers that clash, `path` up to the block. No route at all:
     `no_route`.
6. **Turn the tests on.** Add the rule to `IMPLEMENTED_RULES` in `solver/index.ts`. Its cases in
   `data/expected.json` stop being `todo` and run for real.
7. Run `npm test`. Debug by hand against the numbers: the expected case is the truth.
8. Add one unit test per edge case you hit (exactly equal width, a node with no edges).

## Done when

- The rule is in `IMPLEMENTED_RULES` and every expected case for its token is green.
- `npm test` passes and the solver output still matches `solver-output.schema.json`.
- `solve()` on the demo building takes under 100 ms.
