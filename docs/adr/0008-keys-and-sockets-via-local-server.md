# 0008. Keys and phone sockets go through a small local server

Status: accepted (2026-11-14)

## Context

Vite puts every `VITE_*` value into the browser bundle, so a key there is public. A browser page
also cannot accept WebSocket connections, and the tier 3 phone controllers need one.

## Decision

- Tier 1 stays browser-only, with no server and no key.
- When Jev parse (T2), plan B, or phones (T3) start, P3 adds a small Node server in `app/server/`.
  It reads keys from the git-ignored `.env` (never with a `VITE_` prefix), calls Jev or the LLM,
  and returns only the contract shapes (`JevParse`, `JevVote`).
- The server binds to `127.0.0.1` by default. Only for the phone demo does the WebSocket listen on
  the venue network, and it carries only the contract phone messages, never a key.
- A WebSocket server package (for example `ws`) needs P1's OK, like any new package.

## Consequences

No key reaches the browser, `dist/` or the repo. The phone demo has a 19:30 wifi go/no-go.
