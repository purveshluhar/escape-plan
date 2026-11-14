# server/

**Owner:** P1 (@purveshluhar). See ADR 0008.
**Purpose:** the small local Node server. It keeps keys out of the browser. It turns a typed
sentence into an edit (Jev parse, or plan B or plan C), gives one vote per discipline after an
edit (Jev votes), and relays the phone messages over WebSocket in tier 3. Any other call that
needs a key, such as the LLM post-game report (P4 with P3), also goes through this server; who
writes that route is box A in docs/plan-graph.html. Jev never decides pass or fail; the solver does.
**Consumes:** `JevParseRequest`, `JevVoteRequest` and the phone messages (`contract/types.ts`).
**Produces:** `JevParse` and `JevVote`. Plan B (a general LLM) and plan C (a keyword parser)
return the same shapes as Jev. It only relays phone messages: `join`, `escape` and `vote` in, and
the solver's `result` (worked out in `app/`) out.
**Runs in:** Node only, never in the browser. It reads keys from the git-ignored `.env`, never
with a `VITE_` prefix. The Jev and LLM routes always listen on `127.0.0.1` only. For the phone demo, a
separate WebSocket listener uses the venue network; it carries only phone messages, never a key. Browser code (`app/`, `viewer/`, `design/`) never
imports this folder: P3's screens in `app/` call the server over HTTP or WebSocket.

## Status

Empty until tier 2 starts at 17:00. When the first code lands, P1 adds `server/` to the test and
typecheck globs (AGENTS.md).

## Tier 2 first task

`parse(request)` for Jev, with plan B and plan C behind the same function. Accept an answer only
when every confidence is >= `JEV_ACCEPT_CONFIDENCE` (0.8). Go/no-go (P1's call): 13:00 (key in
hand?) and 17:30 (slower than 2 s means plan B or C).
