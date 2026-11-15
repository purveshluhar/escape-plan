# viewer/

**Owner:** P2 (@justinjao).
**Purpose:** animate each token's path over the real building in the backdrop, isometric.
**Consumes:** `Building` and `SolverResult[]` (`contract/types.ts`), colours from `design/tokens.ts`.
**Produces:** `createViewer(container)` returning `{ show(building, results), setBackdrop(object), setCovered(ids) }` (`viewer/index.ts`).
`setBackdrop` adds context drawn under the model (the Cityweft block, real floor plans). The graph's
rooms are self-made, so the viewer draws no box for them; only each exit gets a label. `setCovered`
takes node ids the backdrop stands in for: the camera frames only the other
nodes' boxes (routes still use every node).
Mouse: the wheel zooms (0.1x close to 60x far); left-drag orbits the camera around the model; right-drag
(or shift-drag) pans; double-click returns to the framed, isometric view.
`onZoom(zoom)` in the options reports each change; the app uses it to lift the backdrop's 4 m cut as you
zoom out (`cutHeight` in `app/backdrop.ts`), so the context shows at full height.
Pure layout math lives in `viewer/layout.ts` so it can be tested without a browser.

Route math (`tokenRoute`), fail label words (`labels.ts`) and the rest of the pure logic are
tested without a browser.

## Status

Tier 1 (#5), restyled to Liquid Glass v2 (`design/look.md`). Every `show()` re-runs all tokens,
`MOTION.staggerSeconds` apart. Each token, a tile with its glyph, travels the route dots along
its `path`, which goes through the door between rooms. On a No it shakes, and a blinking red
X pops above `blocked_at` with a label: "Chiller: too narrow / Plant shaft: needs 1.6 m, has
1.2 m". Labels go right, left or above their X, whichever overlaps least. When every token
passes, the Yes to all banner shows.

`createViewer(container, { insetRight })`: pixels on the right covered by a floating panel.
The model and the Yes to all banner centre in the space left of it. The canvas is transparent, so the
page backdrop shows through.

Dev page: `npm run dev`, then open http://localhost:5173/viewer/dev.html (add `&inset=372` to
mimic the app's side panel). It plays each case in `data/expected.json`. Tokens whose rule the
solver does not answer yet use the hand-made results in `fixtures.ts`, and the header says
which. The main app always shows the real solver output.

Not done yet: the rest of `design/look.md` v2 (accent route dots, FAIL dashes past a block,
the `1.2 < 1.6 m` callout, the fail freeze), the edit flash, and the asks in `design/flow.md`.

Go/no-go at 15:30: if a token does not read clearly moving through the cutaway, switch to 2D
stacked plans (one SVG per level) and keep 3D on a branch.

## Smoke tint

`viewer.setSmoke({ steps, secondsPerStep })` tints each node of the slice the smoke has reached
(`viewer/smoke.ts`, tested): one translucent block per node, denser near the source, shown from
`step * secondsPerStep` seconds after `show()`, and all at once with reduced motion. Tower floors the
backdrop stands in for get none. `setSmoke(null)` clears it.
