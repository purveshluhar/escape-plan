# 0006. TypeScript, Vite and three.js, with Node's own test runner

Status: accepted (2026-11-14)

## Context

Five people need a browser-only stack that starts in seconds, shares types, and needs no server.

## Decision

- One npm package (no workspaces): TypeScript, Vite and three.js (with `@types/three`).
  Exact versions are pinned in `package.json`.
- `npm test` runs Node's built-in test runner on `*.test.ts` files. Node 22.18+ runs
  TypeScript directly, so there is no test framework and no build step for tests.
- Data files are checked by `contract/validate.ts`, a small checker for the JSON Schema keywords
  we use. It throws on any other keyword, so it never passes silently.
- Test files are not type-checked by `npm run typecheck`, because that needs `@types/node`,
  which is not on the approved package list. Node still runs them.
- `.npmrc` sets `omit-lockfile-registry-resolved=true`, so `package-lock.json` records versions
  and integrity hashes but no registry host. Each machine installs from its own configured registry.
- New packages need P1's OK.

## Consequences

`npm ci && npm test` works on a fresh clone and in CI. If the team approves `@types/node`,
remove the `**/*.test.ts` exclude in `tsconfig.json`.
