# 0003. The building graph JSON is the shared contract, owned by P1

Status: accepted (2026-11-14)

## Context

Each person's agent will otherwise invent its own field names, and the 13:00 merge fails.

## Decision

`contract/` holds the TypeScript types (`types.ts`) and JSON Schemas (`schema/`) for every
format: `building.json`, solver output, the edit list, Jev parse and votes, phone messages,
and `expected.json`. P1 owns it. It changes only at an hourly merge point, and everyone is told.
`npm test` checks that the schemas and the TypeScript enums match, and that every `data/*.json`
file matches its schema.

Gaps in the plan, filled with the simplest choice:

- `Token.discipline` is one of eight values: `mep`, `logistics`, `accessibility`, `structure`,
  `life_safety`, `fire`, `plumbing`, `electrical`.
- `Token.goal` is a node id, or `null` for "any exit" (any foundation for the `downward` rule).
  For `downward`, `Token.start` is a member id.
- `Building` and `ExpectedFile` take an optional `note` string, so example files say they are
  examples.
- `expected.json` is a list of cases. Each case has `edits` applied in order to
  `data/building.json` and the hand-checked fields per token.
- Jev parse is split into a request (`text`, `ops`, `targets` up to 255, `value_range`) and an
  answer (`op`, `target`, `value`, each with a confidence).

## Consequences

Agents build against one set of names. A missing field is a request to P1 (`contract-change`
skill), not a local addition.
