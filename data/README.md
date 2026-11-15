# data/

**Owner:** P5 (@kalunkuo).
**Purpose:** the building and the truth.
**Produces:**
- `building.json`: the building graph (`contract/schema/building.schema.json`).
- `expected.json`: hand-checked results per case and token (`contract/schema/expected.schema.json`).

Both files are **examples** now: a tiny self-made building and an expected-results skeleton.
They are not real answers. Replace them with v1.

## Rules

- `expected.json` is the truth. Solver tests read it. Check each case by hand, with the numbers.
- Every case lists the edits applied in order, and only the fields you checked by hand.
- `npm test` validates every `data/*.json` file against its schema and checks that every id
  points at something real. A new JSON file needs a line in `SCHEMA_FOR` in `data.test.ts`.
- Self-made and synthetic data only, with one exception: the Cityweft block (`data/cityweft/block.glb`
  and `meta.json`) is committed so a fresh clone shows the real city around the tower. Credit:
  Cityweft, OpenStreetMap, Overture Maps Foundation, Meta & WRI canopy heights. `instances.json` and
  anything else Cityweft writes stays git-ignored.

## Cityweft block (tier 2)

`node --env-file=.env data/cityweft-fetch.ts` fetches a 500 m block around 432 Park Avenue (override with
`CITYWEFT_SIZE_M`) into git-ignored `data/cityweft/`. It needs `CITYWEFT_API_KEY` in the
git-ignored `.env`, never with a `VITE_` prefix. Nothing from `data/cityweft/` is ever committed
(`docs/adr/0004`).

- The block is centred 162 m north and 10 m west of 432 Park Avenue so a little of Central Park
  (north of 59th Street, west of Fifth Avenue) fills its north-west corner. `meta.json` records
  where the tower and the park's south-east corner land (`local`).
- `block.glb` holds buildings, surface (roads, paths, gardens, water), barriers (fence, wall) and
  terrain. `meta.json` records the target, centre, size and polygon.
- The GLB export leaves instances out (tested: an empty placeholder), so a second small request
  saves them as points in `instances.json`: `type` (tree, bench, busStop, picnicTable, hydrant,
  sculpture, ...), `x`, `y`, `z`, `height` (metres), `rotation` (radians). Trees ask for
  `treeSource: hybrid`, which the docs recommend.
- Frame (checked by drawing the GLB top-down): x north, y up, z east, origin at the south-west
  corner of the block. The GLB and `instances.json` share it.
- `cityweft-request.ts` holds the pure builders that `cityweft-request.test.ts` checks.
- Size grows fast: about 10 MB at 300 m and 63 MB at 800 m (Lower Manhattan).

## The whole tower

`building.json` holds the demo slice (L1 to L3, hand-written) plus the rest of 432 Park Avenue as
levels `T04` to `T86`. It is built from the 432 Park package in `data/432-park/`, using the
package's individual floor plans (Typical_1 to Typical_4 in its GLB: one, two, three and four apartments).

- `node data/whole-tower-build.ts` does all of it, and is rerunnable (seed 432, same tower each time):
  1. `tower-plans.ts` gives every apartment floor a random plan, keeping the turn the package gave it.
  2. The package's `432_Park_Avenue_Rooms.csv` gets a new `type_assignment`: the GLB room each room
     comes from (for example `Typical_4_Apartment_Plan_R001`). The original is kept beside it as
     `432_Park_Avenue_Rooms.original.csv`. Row counts change, because the plans differ in room count.
  3. `whole-tower.ts` turns those plans into graph data: a core per level (lobby, services room or
     plant for an open mechanical band) joined by lifts, and per apartment a living-room box with a
     door to the core. Only the tower part of `building.json` is rewritten; the slice is untouched.
  4. `tower-floors.ts` (generated, do not edit) records the plan and turn per level for the viewer.
- `typical-floors.ts` and `typical-floors-load.ts` draw the real floor plan at every apartment level
  (and the slice's level 10) in the viewer, when the package is on the machine.
- The two package models the viewer draws are in the repo, in `data/432-park/`:
  `432_Park_Avenue_Typical_Plans.glb` (the four floor plans) and `432_Park_Avenue_Lightweight.glb`
  (the complete tower, used for its exterior). They are our own approximate model (a reconstruction
  from published diagrams), 4.8 MB together. The package's metadata, CSV, plan polygons and README
  (sources and assumptions) that `whole-tower-build.ts` reads sit beside them.
- The outside is the package's complete Lightweight model (`432_Park_Avenue_Lightweight.glb`): its
  exterior concrete grid, facade and window modules and roof parapet, 28.5 m by 425.5 m, centred on
  the tower. Its own levels, interiors and ground plinth are dropped (our floors and the backdrop
  draw those). Without the file the floors show without a facade.
- Levels with no plan (lobby, services, open mechanical) get a plain slab and the fixed core as a
  stand-in, using the GLB's own `Slab` and `Core` nodes: the package has no layout for them.
- Elevations are real (86 levels, 425 m). The package has no door data: doors and lifts are ours.
- Tests: `tower-plans.test.ts`, `whole-tower.test.ts`, `typical-floors.test.ts`.

## Tier 1 first task

`building.json` v1 and `expected.json` for the four tier 1 tokens (chiller, glass, wheelchair,
load): the base building plus every demo edit. Then expected cases for people, smoke and water.
