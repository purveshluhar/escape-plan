# viewer/

**Owner:** P2 (@justinjao).
**Purpose:** draw the building as an isometric 3D cutaway and animate each token's path.
**Consumes:** `Building` and `SolverResult[]` (`contract/types.ts`), colours from `design/tokens.ts`.
**Produces:** `createViewer(container)` returning `{ show(building, results) }` (`viewer/index.ts`).
Pure layout math lives in `viewer/layout.ts` so it can be tested without a browser.

## Status

Starter: translucent boxes per node and an orthographic isometric camera.

## Tier 1 first task

Draw each token's `path` as a glowing line, animate the token along it, show a red X at
`blocked_at`, and show LEVEL COMPLETE when all pass. Follow the `arcade-look` skill.
Go/no-go at 15:30: if a token does not read clearly moving through the cutaway, switch to 2D
stacked plans (one SVG per level) and keep 3D on a branch.
