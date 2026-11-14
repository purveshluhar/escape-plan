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
- Self-made and synthetic data only. No Cityweft files here: they go in git-ignored
  `data/cityweft/` or `private-context/`.

## Cityweft block (tier 2)

`node --env-file=.env data/cityweft-fetch.ts` fetches a 150 m block around 120 Broadway as a GLB
into git-ignored `data/cityweft/` (`block.glb` and `meta.json`). It needs `CITYWEFT_API_KEY` in the
git-ignored `.env`, never with a `VITE_` prefix. `cityweft-request.ts` holds the pure request
builder that `cityweft-request.test.ts` checks. Nothing from `data/cityweft/` is ever committed
(`docs/adr/0004`).

## Tier 1 first task

`building.json` v1 and `expected.json` for the four tier 1 tokens (chiller, glass, wheelchair,
load): the base building plus every demo edit. Then expected cases for people, smoke and water.
