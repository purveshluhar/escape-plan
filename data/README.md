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
- Self-made and synthetic data only. No Cityweft files here: the Cityweft block is fetched locally
  into git-ignored `data/cityweft/` (below) and never committed (`docs/adr/0004`).

## Cityweft block (tier 2)

The block is not in the repo, so a fresh clone shows the plain ground. To see the city around the
tower, fetch it on your machine:

1. Copy `.env.example` to `.env` (git-ignored) and put your key after `CITYWEFT_API_KEY=`.
   Never give it a `VITE_` prefix.
2. Run `node --env-file=.env data/cityweft-fetch.ts`. It fetches a 500 m block around 432 Park
   Avenue (override with `CITYWEFT_SIZE_M`) into git-ignored `data/cityweft/`.
3. Reload the game in `npm run dev`. The dev server serves the block; a build never has it.

Nothing from `data/cityweft/` is ever committed (`docs/adr/0004`). Credit: Cityweft, OpenStreetMap,
Overture Maps Foundation, Meta & WRI canopy heights.

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

## The tier 1 tokens

`building.json` holds all six tier 1 tokens: chiller, glass, wheelchair and load, and the sofa and
people the dock offers with the wheelchair. The sofa (0.9 x 1.0 x 2.2 m, from the lobby), people
(0.6 x 2.0 x 0.6 m, from the ground-floor office) and the office with its 0.5 m door used to be a
solver test fixture. They are slice data now, and their cases are in `expected.json`: the base case,
widening the lobby door (the sofa), widening the office door (people), and `full-demo`, which
widens the office door too.

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
     plant for an open mechanical band) joined by a lift and two egress stairs, and per apartment a
     living-room box with a door to the core. `sliceJoin` joins the slice to the tower: the express
     lift from the lobby to level 4, a service lift from the lobby to the L3 plant, and both stairs
     level by level (lobby, L2 core, L3 plant, level 4). Only the tower part of `building.json` and
     these join edges are rewritten; the slice's own rooms and edges are untouched.
  4. `tower-floors.ts` (generated, do not edit) records the plan and turn per level for the viewer.
- `typical-floors.ts` and `typical-floors-load.ts` draw the real floor plan at every apartment level
  (and the slice's level 2, which uses level 10's plan) in the viewer, when the package is on the machine.
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
- Elevations are real (86 levels, 425 m). The package has no door, lift or stair data: all doors,
  lifts and stairs are self-made. Assumed values:
  - Doors are 1.0 x 2.4 m.
  - Lifts are 1.2 x 2.4 m. They are edges with no car node, so no car-size check runs.
  - Stairs A and B are 1.12 m wide with 2.03 m headroom (44 in and 80 in, IBC 2021 1011.2 and
    1011.3). Each landing is as wide as the stair (corner 1.12 by 1.12 m, IBC 2021 1011.6).
  - Both stairs come down to the L1 lobby. In a real building at most half the exits may discharge
    through a lobby (IBC 2021 1028.1). Here the lobby door stays the demo's one way out.
  - These values come from code minimums as recalled, not checked against the code text.
- The slice's L2 is level 2: the names say so ("Level 2 core lobby"). It uses level 10's
  three-apartment plan as a stand-in typical floor. The tower's own level 10 is T10.
- Tests: `tower-plans.test.ts`, `whole-tower.test.ts`, `typical-floors.test.ts`, and `egress.test.ts`
  (no drop on any level leaves people, the wheelchair or the sofa with no route out).

## Tier 1 first task

`building.json` v1 and `expected.json` for the four tier 1 tokens (chiller, glass, wheelchair,
load): the base building plus every demo edit. Then expected cases for people, smoke and water.
