# 0008. Keys and phone sockets go through a small local server

Status: accepted (2026-11-14)

Updated 2026-11-14: P1 owns the server, and it lives in the top-level `server/` folder, not in
`app/server/`. The team moved the Jev work (parse, plan B and C, votes) to P1. P3 keeps the
screens (text box, "Did you mean" buttons, vote bubbles, phone controllers, voice) and calls the
server from `app/`.

## Context

Vite puts every `VITE_*` value into the browser bundle, so a key there is public. A browser page
also cannot accept WebSocket connections, and the tier 3 phone controllers need one.

## Decision

- Tier 1 stays browser-only, with no server and no key.
- When Jev parse (T2), plan B or C, or phones (T3) start, P1 adds a small Node server in `server/`.
  It reads keys from the git-ignored `.env` (never with a `VITE_` prefix), calls Jev or the LLM,
  and returns only the contract shapes (`JevParse`, `JevVote`).
- The server binds to `127.0.0.1` by default. Only for the phone demo does the WebSocket listen on
  the venue network, and it carries only the contract phone messages, never a key. The routes that
  use a key stay on `127.0.0.1` even then; the phone WebSocket gets its own listener.
- A WebSocket server package (for example `ws`) needs P1's OK, like any new package.
- Browser code (`app/`, `viewer/`, `design/`) never imports `server/`. It calls the server over
  HTTP or WebSocket and gets back only the contract shapes.

## Consequences

No key reaches the browser, `dist/` or the repo. The phone demo has a 19:30 wifi go/no-go.
