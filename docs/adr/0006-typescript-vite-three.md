# 0006. TypeScript, Vite and three.js, with Node's own test runner

Status: accepted (2026-11-14)

## Context

Five people need a browser stack that starts in seconds and shares types. Tier 1 needs no
server; tier 2 and 3 calls that need a key or a socket use one (ADR 0008).

## Decision

- One npm package (no workspaces): TypeScript, Vite and three.js, with `@types/three` and
  `@types/node` (matching the Node 22 runtime). Exact versions are pinned in `package.json`.
- `npm test` runs Node's built-in test runner on `*.test.ts` files. Node 22.18+ runs
  TypeScript directly, so there is no test framework and no build step for tests.
- Data files are checked by `contract/validate.ts`, a small checker for the JSON Schema keywords
  we use. It walks every schema at load and throws on any other keyword.
- `npm run typecheck` covers every `.ts` file, test files included. `tsconfig.json` loads the
  `node` types, so `node:test`, `node:assert` and `node:fs` type-check. Browser code in
  `viewer/` and `app/` must still not use Node APIs: they do not exist in the browser, and the
  type checker no longer catches that.
- `.npmrc` sets `omit-lockfile-registry-resolved=true`, so `package-lock.json` records versions
  and integrity hashes but no registry host. Each machine installs from its own configured registry.
- The lockfile lists the native bindings for every platform. Regenerate it only from an empty
  `node_modules` (`rm -rf node_modules package-lock.json && npm install`); CI runs on Linux and macOS.
- New packages need P1's OK.

## Consequences

`npm ci && npm run check` works on a fresh clone and in CI. A type error in a test fails the
merge gate, the same as one in source.
