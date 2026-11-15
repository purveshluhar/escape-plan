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

Tier 2: `POST /parse` works with plan C (the keyword parser, the default) and with
`DECIDER=strands` (a local Strands Decider, see below). Jev and plan B are not built yet; they go
behind the same `parse()`. Jev votes and the phone relay are tier 3.

## Run it

1. Copy `.env.example` to `.env` (git-ignored). The defaults work as they are.
2. Run `npm run server`. It prints `escape-plan server on http://127.0.0.1:8787 (DECIDER=keywords)`.
3. Stop it with Ctrl+C.

| Variable | Default | Meaning |
|---|---|---|
| `DECIDER` | `keywords` | Which parser fills `JevParse`: `keywords` (plan C) or `strands`. Any other name stops the server at start. |
| `SERVER_PORT` | `8787` | Port on 127.0.0.1. |
| `SERVER_HOST` | `127.0.0.1` | Accepted only as `127.0.0.1`. Any other value stops the server at start. |
| `STRANDS_URL` | `http://127.0.0.1:8000` | Where `strands-decider serve` listens. Only `http://127.0.0.1:<port>`; any other URL stops the server at start. |
| `STRANDS_TIMEOUT_MS` | `5000` | Longest wait for one Strands answer, 1 to 60000 ms. |

The server does not read `HOST` or `PORT`, because shells and tools export those for other reasons.

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
  ops (exact or near), or a negation in the 3 words before the op word (`not`, `don't`,
  `wouldn't`, `never`, `no`, `cancel`), give at most 0.4. No op word gives 0. The op is always one
  of `request.ops`.
- Target: a target's full name or id in the sentence gives 1. A longer name beats a name inside
  it ("Lobby door" beats "Lobby"). Two different full names, or a place word in the 3 words before the name
  (`by`, `near`, `next to`), give 0.4. Part of a name gives at
  most 0.6. Send only the targets on screen.
- Reset: no target and no value. A sure reset ("reset", "reset everything") fills the target slot
  with the first target at confidence 1, so it never asks "Did you mean". A reset that also names
  a target or a number, or an unsure one (`undo`), gives at most 0.4 and keeps the target it read.
- Value (widen only): one number with `m` or `cm` gives 1, a bare number 0.6. "from 1 m to 2 m"
  means 2 m. Two numbers otherwise, or a number with punctuation in it (`1,5`, `1/2`, `-2`, `1e3`),
  give at most 0.4. A change instead of a width ("by 2 m", "another 1 m", "50 cm more", "2 m wider",
  "from 1 m") gives at most 0.6. When unclear, the number after "to" is offered. The value must be
  inside `value_range` and inside 0 to 5 m, or its confidence is 0. The score is always inside
  `value_range`.

## DECIDER=strands (`strands.ts`)

A local Strands Decider (`strands-decider serve`, model
`StrandsAgents/strands-decider-2B-qwen3.5-v1-2610`) answers op and target. The decider spike set
these rules:

- Strands is asked two questions only: which op (from `request.ops`) and which target (from
  `request.targets`). Its confidence goes into `JevParse` as it is.
- The value comes from the plan C number parser, with the same rules and the 0-5 m check as above.
- Reset skips the target check: the target slot is the first target at confidence 1, and the value
  is `null`.
- Plan C's guards cap the op confidence at 0.4: a reset that also names a target or a number, and
  an op word with a negation in the 3 words before it ("don't widen").
- Send only the targets on screen. Over 50 targets, the model is not asked. 50 is not measured: the
  spike found that 14 worked, 156 gave no answer at 0.8 or more, and 255 did not fit. Long names fill
  the model's window sooner; Strands then answers an error, and the rule below applies.
- One Strands call runs at a time. A call that comes while one is running gets confidence 0 at once.
- When Strands is down, takes longer than `STRANDS_TIMEOUT_MS`, answers with an error, or answers an
  op or target that was not offered, `POST /parse` still answers `200` with a valid `JevParse` at
  confidence 0. The app shows "Did you mean". The server logs one line with the reason. It never
  switches to plan C on its own.
- Strands runs on this machine only. The server sends the typed sentence to `STRANDS_URL` over
  `node:http`, so it follows no redirect and uses no proxy from the environment. Any program that
  listens on that port gets the sentences, so check the port is Strands' own (`/health`).

Use it only if the warm op + target call is under 2 s on the demo laptop. On this team's CPU
Cloud Desktop it is slower (see the P1-12 timing log).

### Time it on the laptop (macOS, Apple silicon)

1. Install it once, outside the repo (about 5 GB of downloads):

   ```bash
   mkdir -p ~/strands-spike && cd ~/strands-spike
   python3.11 -m venv venv && source venv/bin/activate   # any Python 3.10 or later
   pip install strands-decider
   ```

2. Start Strands in its own terminal. Wait for `warmed up in ... s`, or until
   `curl -s http://127.0.0.1:8000/health` prints `"status":"ok"`:

   ```bash
   cd ~/strands-spike && source venv/bin/activate
   export HF_HOME=~/strands-spike/hf
   strands-decider serve StrandsAgents/strands-decider-2B-qwen3.5-v1-2610 \
     --device mps --host 127.0.0.1 --port 8000
   ```

3. In a second terminal, in the repo, start the server with Strands:

   ```bash
   DECIDER=strands STRANDS_URL=http://127.0.0.1:8000 npm run server
   ```

4. In a third terminal, in the repo, time 5 calls:

   ```bash
   set -o pipefail; npm run time-parse | tee parse-timing.log; echo "exit $?"
   ```

   Each call line shows the time, the answer, whether it passed the `JevParse` schema, and whether
   it is the right edit. The last line names the decider (it must say `strands`) and shows the
   median. If the median is under 2000 ms and all 5 are right, `DECIDER=strands` can go in `.env`.
   If not, keep `keywords`. `exit 1` or "no answer from the decider" means Strands did not answer;
   the server terminal says why. A first call can pass 5 s, so run step 4 twice.

5. Stop each terminal with Ctrl+C. Delete `~/strands-spike` to remove Strands.
