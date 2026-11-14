# viewer/

**Owner:** P2.
**Purpose:** draw the building as an isometric 3D cutaway and animate each token's path.
**Consumes:** `Building` and `SolverResult[]` (`contract/types.ts`), colours from `design/tokens.ts`.
**Produces:** `createViewer(container)` returning `{ show(building, results) }` (`viewer/index.ts`).
Pure layout math lives in `viewer/layout.ts` so it can be tested without a browser.

Route math (`tokenRoute`), fail label words (`labels.ts`) and the rest of the pure logic are
tested without a browser.

## Status

Tier 1 (#5): the maze-arcade look from `design/look.md`. Every `show()` re-runs all tokens,
`MOTION.staggerSeconds` apart. Each token eats a pellet trail along its `path`, which goes
through the door between rooms. On a fail it shakes, and a blinking red X pops above
`blocked_at` with a label: "CHILLER  TOO NARROW / Plant shaft: needs 1.6 m, has 1.2 m". When
every token passes, the walls flash and LEVEL COMPLETE shows.

Dev page: `npm run dev`, then open http://localhost:5173/viewer/dev.html. It plays each case
in `data/expected.json`. Tokens whose rule the solver does not answer yet use the hand-made
results in `fixtures.ts`, and the header says which. The main app always shows the real
solver output.

Not done yet: the edit flash on the changed edge or member (`design/look.md`, edit moment).
`show()` is not told which edit was made.

Go/no-go at 15:30: if a token does not read clearly moving through the cutaway, switch to 2D
stacked plans (one SVG per level) and keep 3D on a branch.
