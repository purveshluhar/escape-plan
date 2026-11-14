# app/

**Owner:** P3.
**Purpose:** the game shell: app state, edit buttons, reset, scoreboard. Later Jev parsing (T2),
Jev votes and phone controllers (T3).
**Consumes:** `solve()` from `solver/`, `createViewer()` from `viewer/`, `data/building.json`.
**Produces:** the page (`index.html` + `app/main.ts`) and `Edit` objects (`contract/types.ts`).
Pure logic (`app/scoreboard.ts`) is tested in `app/scoreboard.test.ts`.

## Status

Starter: an Escape! button, a scoreboard and a LEVEL COMPLETE banner.

## Tier 1 first task

Edit buttons that push `Edit` objects (`widen`, `add_transfer_beam`, `add_ramp`, `close_door`,
`reset`) and re-solve on every edit. Jev go/no-go is at 13:00: no key means plan B (a general
LLM with the same typed answers) or plan C (keyword parser and buttons). Same `JevParse` shape.
Keys go in `.env` only, never in code.
