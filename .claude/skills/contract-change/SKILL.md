---
name: contract-change
description: Propose a change to contract/ (types, schemas, a new field or enum value) to P1 at a merge point. Use when your code needs a field, value or format that contract/ does not have.
---

# Propose a contract change

`contract/` is owned by P1 and changes only at an hourly merge point. Every other agent builds
against it, so one local edit breaks four people. You propose; P1 changes.

## Steps

1. Check it is really missing. Search `contract/types.ts`, `contract/README.md` and
   `GLOSSARY.md`. An existing field with another name often already covers it.
2. Write the smallest change that works. Prefer, in order:
   - an **optional** field (old data stays valid);
   - a new enum value at the end of the list;
   - a new type;
   - renaming or removing anything (last resort: it breaks other folders).
3. Open a GitHub issue titled `contract: <change>` with:
   - the exact TypeScript lines to add to `contract/types.ts`;
   - the matching JSON Schema lines for `contract/schema/<file>.schema.json`;
   - which folders read or write it, and what breaks for each;
   - the tier it belongs to;
   - a small example value.
4. Tell P1 in chat, with the issue number. Keep building with a local stand-in type inside
   your own folder until it lands. Mark the stand-in `// TODO(contract #<n>)`.
5. At the merge point P1 updates `types.ts`, the schema and `examples.ts` together, runs
   `npm test`, and announces the change. Then delete your stand-in and import the real type.

## Done when

- The change is in `contract/` on `main`, `npm test` passes, and the team was told.
- No folder keeps its own copy of the type.
