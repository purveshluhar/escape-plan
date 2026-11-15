# app/

**Owner:** P3 (@minsookim1014 and @jackwayfeel).
**Purpose:** the app shell: app state, edit buttons, Undo edits, the Answers panel. Later the text box and
"Did you mean" buttons for Jev edits (T2), vote bubbles, phone controllers and voice (T3). P3
wires these screens to P1's local server in `server/` (ADR 0008), which makes the Jev, plan B and
plan C calls and runs the phone sockets.
**Consumes:** `solve()` from `solver/`, `createViewer()` from `viewer/`, `data/building.json`.
**Produces:** the page (`index.html` + `app/main.ts`, both P3's) and `Edit` objects (`contract/types.ts`).
Pure logic (`app/scoreboard.ts`) is tested in `app/scoreboard.test.ts`.

## Status

Starter: a Show me button, the Answers panel and the Yes to all banner.

## Tier 1 first task

Edit buttons that push `Edit` objects (`widen`, `add_transfer_beam`, `add_ramp`, `close_door`,
`reset`) and re-solve on every edit. The Jev go/no-go is at 13:00 (P1's call): no key means plan B
(a general LLM with the same typed answers) or plan C (keyword parser and buttons). The app gets
the same `JevParse` shape either way.
Keys go in `.env` only, never in code and never with a `VITE_` prefix. A Jev or LLM call that
needs a key, and the T3 phone sockets, go through P1's local server in `server/` (ADR 0008).
Browser code never imports `server/`.
