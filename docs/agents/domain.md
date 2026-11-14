# Domain docs

How agents use this repo's domain documentation. Layout: **single-context**.

```
/
|-- GLOSSARY.md        every token, node, edge and rule term in plain words
|-- docs/adr/          architecture decision records, numbered 0001-...
`-- contract/          the formats themselves (types.ts, schema/)
```

## Before exploring, read these

- `GLOSSARY.md` at the repo root.
- `docs/adr/`: the ADRs that touch the area you are about to work in.

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a test name, a commit, a UI label),
use the term as `GLOSSARY.md` defines it. If the concept is not there yet, either you are
inventing language the project does not use (reconsider), or there is a real gap: ask P1 to add
the term at the next merge point.

## Flag ADR conflicts

If your output contradicts an ADR, say so explicitly rather than silently overriding:

> _Contradicts ADR-0002 (the solver decides), but worth reopening because..._

## New decisions

Record a decision as a new ADR when it is hard to reverse, surprising without context, or a
real trade-off. Copy the shape of `docs/adr/0001-record-decisions-with-adrs.md`.
