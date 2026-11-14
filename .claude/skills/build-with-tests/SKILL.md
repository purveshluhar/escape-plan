---
name: build-with-tests
description: Write or change code red-first, with tests against data/expected.json and the contract. Use for any code change in solver/, viewer/, app/, design/, data/ or server/.
---

# Build with tests

`data/expected.json` is the truth. When a test disagrees with it, the code is wrong until a
human proves the expected case wrong.

## Steps

1. Read the ticket's acceptance check. Find the expected case or behaviour that proves it.
2. Write the test first, in your own folder, as `<folder>/<name>.test.ts`:
   - `import { test } from 'node:test'` and `import assert from 'node:assert/strict'`;
   - import local files with the `.ts` extension, types with `import type`;
   - put logic you want to test in a pure function (no DOM, no three.js), like
     `viewer/layout.ts` and `app/scoreboard.ts`.
3. Run `npm test` and see the new test go **red** for the right reason.
4. Write the smallest code that makes it green. Stay inside your folder.
5. Run `npm run check` (typecheck, test, build). It must pass.
6. If a test against `data/expected.json` still fails and you think the expected value is
   wrong, stop. Tell P5 (and P1 for the solver) with the case id, the value, and your numbers.
   The expected value stays as it is until P5 changes it by hand.
7. Commit in your folder: `feat(<folder>): <what>` or `fix(<folder>): <what>`, plain ASCII.

## Rules

- Leave `data/expected.json` values alone to make code pass; P5 owns them.
- Keep a failing test visible: fix it, or mark it `{ todo: '<why>' }` with a ticket number.
- The solver is deterministic: no randomness, no clock, no network.

## Done when

- The new test went red first, then green.
- `npm run check` passes.
- Only your folder changed.
