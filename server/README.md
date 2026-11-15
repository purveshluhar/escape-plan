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

Tier 2: `POST /parse` with plan C (the keyword parser) works. Jev and plan B are not built yet;
they go behind the same `parse()`. Jev votes and the phone relay are tier 3.

## Run it

1. Copy `.env.example` to `.env` (git-ignored). The defaults work as they are.
2. Run `npm run server`. It prints `escape-plan server on http://127.0.0.1:8787 (DECIDER=keywords)`.
3. Stop it with Ctrl+C.

| Variable | Default | Meaning |
|---|---|---|
| `DECIDER` | `keywords` | Which parser fills `JevParse`. Only `keywords` (plan C) is built. Any other name stops the server at start. |
| `PORT` | `8787` | Port on 127.0.0.1. |
| `HOST` | `127.0.0.1` | Accepted only as `127.0.0.1`. Any other value stops the server at start. |

## Route: `POST /parse`

- Body: a `JevParseRequest` as `application/json`, at most 64 KiB, `text` at most 1000 characters.
  `ops` and `targets` must not be empty, target ids must be unique, and `value_range.min <= max`.
- Answer: `200` with a `JevParse`. Errors are `{ error, details }` with `400` (not JSON or not a
  `JevParseRequest`), `403` (Host or Origin not allowed), `404`, `405`, `413` (body too big) or
  `415` (not `application/json`). A body with an inherited key name (`__proto__`, `constructor`)
  is a `400`. A client that sends too slowly gets `408` after about 10 s.
- Callers: the game page on this machine, at `http://localhost:5173` or `http://127.0.0.1:5173`
  (`npm run dev`), or port 4173 (`npm run preview`). Other browser origins get `403`.
- Accept a parse only when every confidence is >= `JEV_ACCEPT_CONFIDENCE` (0.8). Else show
  "Did you mean" and the buttons.

```bash
curl -s http://127.0.0.1:8787/parse -H 'content-type: application/json' \
  -d '{"text":"widen the plant shaft to 2 m","ops":["widen","reset"],"targets":[{"id":"plant-shaft","name":"Plant shaft"}],"value_range":{"min":0,"max":5}}'
```

## Plan C rules (`keywords.ts`)

- Op: the op's own word gives confidence 1 (`widen`, `ramp`, `transfer beam`, `close`, `sleeve`,
  `reset`). A near word (`wider`, `slope`, `shut`, `undo`) gives 0.6. Words for two different
  ops (exact or near), or a negation (`not`, `don't`, `never`, `no`), give at most 0.4. No op word
  gives 0. The op is always one of `request.ops`.
- Target: a target's full name or id in the sentence gives 1. A longer name beats a name inside
  it ("Lobby door" beats "Lobby"). Two different full names give 0.4. Part of a name gives at
  most 0.6. Send only the targets on screen.
- Reset: no target and no value. A sure reset fills the target slot with the first target at
  confidence 1, so it never asks "Did you mean". An unsure reset (`undo`) keeps the target it read.
- Value (widen only): one number with `m` or `cm` gives 1, a bare number 0.6. "from 1 m to 2 m"
  means 2 m. Two numbers otherwise, or a number with punctuation in it (`1,5`, `1/2`, `-2`, `1e3`),
  give at most 0.4. "by 2 m" is a change, not a width, so it gives at most 0.6. The value must be
  inside `value_range` and inside 0 to 5 m, or its confidence is 0. The score is always inside
  `value_range`.
