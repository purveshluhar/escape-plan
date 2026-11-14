# data/

**Owner:** P5.
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
- Self-made and synthetic data only. No Cityweft files here: they go in git-ignored
  `data/cityweft/` or `private-context/`.

## Cityweft block (tier 2)

`node --env-file=.env data/cityweft-fetch.ts` fetches an 800 m block (override with
`CITYWEFT_SIZE_M`) into git-ignored `data/cityweft/`. It needs `CITYWEFT_API_KEY` in the
git-ignored `.env`, never with a `VITE_` prefix. Nothing from `data/cityweft/` is ever committed
(`docs/adr/0004`).

- The block is centred 350 m south of 120 Broadway so the bay (water) fills its south side. 120
  Broadway lands about 400 m east and 50 m from the north edge.
- `block.glb` holds buildings, surface (roads, paths, gardens, water), barriers (fence, wall) and
  terrain. `meta.json` records the target, centre, size and polygon.
- The GLB export leaves instances out (tested: an empty placeholder), so a second small request
  saves them as points in `instances.json`: `type` (tree, bench, busStop, picnicTable, hydrant,
  sculpture, ...), `x`, `y`, `z`, `height` (metres), `rotation` (radians). Trees ask for
  `treeSource: hybrid`, which the docs recommend.
- Frame (inferred from where the water falls): x east, y up, z south, origin at the north-west
  corner. The GLB and `instances.json` share it.
- `cityweft-request.ts` holds the pure builders that `cityweft-request.test.ts` checks.
- Size grows fast: about 10 MB at 300 m and 63 MB at 800 m.

## Tier 1 first task

`building.json` v1 and `expected.json` for the four tier 1 tokens (chiller, glass, wheelchair,
load): the base building plus every demo edit. Then expected cases for people, smoke and water.
