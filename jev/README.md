# jev/

**Owner:** P1 (@purveshluhar). See ADR 0009.
**Purpose:** turn a typed sentence into an edit, and give one vote per discipline after an edit.
Jev never decides pass or fail; the solver does.
**Consumes:** `JevParseRequest` and `JevVoteRequest` (`contract/types.ts`).
**Produces:** `JevParse` and `JevVote`. Plan B (a general LLM) returns the same shapes.
**Runs in:** the local server in `app/server/` (P3). This folder exports `parse(request)` and
`vote(request)` and reads its own keys from `process.env` (git-ignored `.env`, never with a
`VITE_` prefix, ADR 0008). The server only calls those two functions, so a Jev change never needs a
server edit. Browser code never imports this folder.

## Status

Empty until tier 2 starts at 17:00.

## Tier 2 first task

`parse(request)` for Jev, with plan B behind the same function. Accept an answer only when every
confidence is >= `JEV_ACCEPT_CONFIDENCE` (0.8). Go/no-go: 13:00 (key in hand?) and 17:30
(slower than 2 s means plan B or C).
