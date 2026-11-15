# Copy: every screen as a person's question about their building

Status: applied on branch `reframe` (2026-11-15). Source read: branch `token-drag` at
`dacee76`. Line numbers below are at that commit, before the change. Owner of the words: P4. Code ids stay.

Standing rule (human, 2026-11-15): Escape Plan is an immersive experience for home buyers,
building owners, building managers and anyone else solving a real problem with their building,
never a game. No game terms on screen or in the story: no level complete, score, win, player,
play, token, race, PASS or FAIL.

## 0. Assumptions

- Assumption 2026-11-15: the three question chips in the dock ARE the scenario picker. No
  separate "Who are you?" screen. Section 2 says why.
- Assumption 2026-11-15: the primary button `Escape!` becomes `Show me` (Space stays).
- Assumption 2026-11-15: answers on screen are `Yes` and `No`, never PASS and FAIL.
- Assumption 2026-11-15: the all-yes banner says `Yes` (one question) or `Yes to all 3`.
  No confetti, flash, score or count of tries.
- Assumption 2026-11-15: `Reset` becomes `Undo edits`, so it does not read like `Clear`.
- Assumption 2026-11-15: the UI keeps the word "edit" for a change to the building.
- Assumption 2026-11-15: place names stay as the data writes them ("Lobby door").
- Assumption 2026-11-15: metres show at least one decimal ("2.0 m", "1.17 m", "0.15 m").
- Assumption 2026-11-15: the sofa question says "get in". The solver walks the sofa out of the
  lobby. Edges are two-way and the corner check is symmetric, so the answer is the same. The
  motion task can play the route in reverse (section 7).
- Assumption 2026-11-15: glass stays, as a building owner's question. Its data route already
  runs in (street to lobby).
- Assumption 2026-11-15: one line on the Answers panel says "A quick check of sizes and routes,
  not a code review." ADR 0007's no-compliance rule still holds.
- Assumption 2026-11-15: contract ids (`token`, `Reason`, `escape`, phase `complete`) and
  export names (`SCORE`, `levelComplete`, `scoreRows`) stay. Only words people read change.

## 1. Words on screen (one term per concept)

| Concept | Say | Never say |
|---|---|---|
| A thing that must get through (token) | its name: Sofa, Wheelchair, People | token, object, player, piece |
| What a person asks | question | level, scenario, challenge |
| The solver's verdict | Yes / No | PASS / FAIL, win, lose |
| Run the check and animate | Show me / Checking | Escape!, escaping, running, race |
| All answers yes | Yes to all | LEVEL COMPLETE, complete, victory |
| Change to the building | edit | move, fix count, score |
| Where it gets blocked | stuck at {Place} | red X (internal word only) |
| The list of answers | Answers | scoreboard, score |

## 2. The questions (persona framing)

Each question opens the scenario. Numbers are LIVE from the solver on `data/building.json`
(`solve-base.log`).

| Thing | Person | Question (chip text) | Yes line | No line today (base building) | Suggested fix | In dock |
|---|---|---|---|---|---|---|
| Sofa | Home buyer | Can my sofa get in? | The sofa gets in | Sofa is stuck at Lobby door: cannot turn the corner, needs 2.2 m, has 2.0 m | Widen lobby door to 1.6 m | now (key 2) |
| Wheelchair | Family | Can my parent's wheelchair get out? | The wheelchair gets out, no steps | Wheelchair is stuck at Terrace door: step in the way, 0.15 m high, needs level | Add ramp at terrace door | now (key 1) |
| People | Building manager | Can everyone get out? | Everyone gets out | People are stuck at Office door: too narrow, needs 0.6 m, has 0.5 m | Widen office door to 0.9 m | now (key 3) |
| Chiller | Building owner | Can I widen this shaft for a new chiller? | The chiller fits through the shaft | Chiller is stuck at Plant shaft: too narrow, needs 1.6 m, has 1.2 m | Widen plant shaft to 2.0 m | tier 1 later |
| Load | Building owner (same scene) | Does the structure still hold? | The structure still holds | After the shaft edit: Load is stuck at beam B2: nothing holds it up, no path down to a foundation | Add transfer beam at beam B2 | tier 1 later |
| Glass | Building owner | Can a 4 m glass panel get into the lobby? | The glass panel gets into the lobby | Glass is stuck at Lobby door: cannot turn the corner, needs 4.0 m, has 3.71 m | Widen lobby door to 1.6 m | tier 1 later |
| People and smoke | Building manager | Do people get out before the smoke? | Everyone gets out before the smoke | People are stuck at North service corridor: smoke gets there first, needs 1 step, has 1 step | Close lobby door | now (key 6) |

Where the question shows:

1. **Dock chip** (the picker): dot, question, key number. The muted lead word `Place` becomes `Ask`.
   Under 1500 px wide (a 1366 px laptop) the chip and tool key hints hide so the dock fits;
   the keys still work, and `Show me` keeps its `Space` hint.
2. **Fix card header**: the person in small muted caps ("HOME BUYER"), then the question, then `No`.
3. **Answers panel row**: question, `Yes` or `No`, then the yes line or the stuck line.
4. **Caption on the model** keeps the short name ("Sofa - Lobby - No"). The question is already on the chip.
5. **Phones (< 700 px)**: chips show the short name only (the question does not fit at 14 px).

"Who are you?" picker: not needed. The three question chips already fit the dock at 1920 px and
scroll at 1366 px (the tools scroller exists). A gate screen would hide the other people's
questions, and the pitch is that one building answers everyone at once. Phase 2 adds one small
map, not a new control: `app/questions.ts` (P3), `token id -> { person, question, yes }`, with a
test that every `MVP_TOKENS` id has an entry. No contract change.

### The smoke question (applied on branch `smoke-race`)

- The smoke starts in the lobby and spreads one open edge per step. The answer is the people's
  answer on the same clock, so it is Yes only when people get out and the smoke is not there first.
  A tie goes to the smoke.
- The sheet says it in steps. No: "People reach North service corridor at step 1. Smoke gets there
  at step 1. A tie goes to the smoke." Yes: "People reach North service corridor at step 1 and Street at step 2. Smoke reaches North
  service corridor at step 2, 1 step after them." (One place for both, where the smoke is closest behind.) Never "race", "win" or "lose".
- The fix is `Close lobby door`. Type "close the lobby door" for the same edit. It is offered only
  on the smoke answer; the sofa stuck at that door is never told to close it.
- On the model the smoke is a grey tint on each room of the slice it has reached, one step at a time
  on the people's clock, and the smoke figure waits in the lobby. With reduced motion the tint shows at once.
- Dock: from 1501 px to 2199 px the chips show short names and the asked question shows as a
  sentence. Six questions do not fit as sentences at 1920 px.

## 3. Outcome lines (calm and factual)

- Yes, one thing: the yes line from section 2 ("Everyone gets out").
- No, one line (Answers row, live note, caption detail): `{Name} is stuck at {Place}: {reason}, {numbers}`.
  The verb agrees with the name: "People are stuck" (`plural` in `app/questions.ts`).
  Example: "Sofa is stuck at Lobby door: cannot turn the corner, needs 2.2 m, has 2.0 m".
- No, on the fix card: line 1 `{Reason} at {Place}`, line 2 `Needs 2.2 m, has 2.0 m`, then the fix buttons.
- On the model (red X card): title `{Name}: {reason}`, detail `{Place}: {numbers}`.
- All yes: banner `Yes` (one question) or `Yes to all {n}`; under it the yes lines joined by ". ",
  then `With {k} edit(s).` or `As built, no edits.`
  Example: "The sofa gets in. The wheelchair gets out, no steps. Everyone gets out. With 3 edits."

Reason words (same words in `app/scoreboard.ts` and `viewer/labels.ts`; capitalise the first
letter at the start of a line):

| Reason id (stays) | Now (app / model) | Say |
|---|---|---|
| `too_narrow` | too narrow / TOO NARROW | too narrow |
| `too_low` | too low / TOO LOW | too low |
| `cannot_turn` | cannot turn / CANNOT TURN | cannot turn the corner |
| `step` | step in the way / STEP | step in the way (numbers: "0.15 m high, needs level") |
| `no_support` | no support / NO SUPPORT | nothing holds it up (numbers: "no path down to a foundation") |
| `smoke_first` | smoke got there first / SMOKE FIRST | smoke gets there first |
| `uphill` | runs uphill / UPHILL | runs uphill |
| `crosses_beam` | crosses a beam / CROSSES BEAM | crosses a beam |
| `no_supply` | no supply / NO SUPPLY | no power reaches it |
| `no_route` | no route out / NO ROUTE | no way through |

## 4. Every user-facing string

| Id | file:line | Current | Replacement | Reason |
|---|---|---|---|---|
| S01 | index.html:6 | `<title>Escape Plan</title>` | `Escape Plan - ask your building` | Name stays; says what it is for |
| S02 | index.html:217 | aria `Game controls` | `Building controls` | Game term |
| S03 | index.html:219 | aria `Pick an object`; lead word `Place` | `Pick a question`; `Ask` | Frame as a question |
| S04 | app/main.ts:410, app/shell.ts:29 | chip text `Wheelchair` / `Sofa` / `People` | the question from section 2 (short name on phones) | The chip is the question |
| S05 | app/main.ts:414 | chip title `Click to place, or drag onto a floor. Arrow up or down moves the selected object a floor.` | `Click to ask. Or drag it onto a floor to start it there. Arrow up or down moves it one floor.` | "object" is a game piece word |
| S06 | index.html:223 | `Edit /` and aria `Type an edit` | keep `Edit /`; aria `Edit the building` | Not a game term; aria says what it edits |
| S07 | index.html:224, app/main.ts:274 | `Reset R` / `Reset (2) R` | `Undo edits R` / `Undo edits (2) R` | Two wipe buttons read the same |
| S08 | app/main.ts:275 | aria `Reset, 2 edits applied` / `Reset` | `Undo edits, 2 applied` / `Undo edits` | Match S07 |
| S09 | index.html:225 | `Clear` | keep `Clear` | Plain; removes the questions |
| S10 | index.html:228 | `Escape! Space` | `Show me Space` | Answers the question; "Run the plan" reads as a floor plan to AEC people |
| S11 | index.html:246 | `Place an object first` | `Pick a question first` | Match S03 |
| S12 | index.html:230, app/main.ts:286 | `Running` / `Running - 3 objects escaping` | `Checking` / `Checking 3 routes` | Escaping is the game action |
| S13 | app/shell.ts:92 | phases `Ready`, `Ready`, `Running`, `Result`, `LEVEL COMPLETE` | `Your building`, `Ready`, `Checking`, `Answer` (1) or `Answers`, `Yes to all` | No game terms; calm |
| S14 | app/shell.ts:96 | `Pick an object to place it` | `Pick a question to start` | Match S03 |
| S15 | app/shell.ts:101 | `2 placed` | `2 questions` / `1 question` | Questions, not pieces |
| S16 | app/shell.ts:97 | `3 escaping` | `3 routes` | Pill reads "Checking - 3 routes" |
| S17 | app/shell.ts:99 | `1 of 1 out` / `2 of 3 out` | `Yes` / `2 yes, 1 no`; all yes: `3 of 3 yes` | "out" is wrong for "get in" questions |
| S18 | app/main.ts:104 | word `PASS` / `FAIL` | `Yes` / `No` | Answers to a question |
| S19 | app/main.ts:105 | `...` / `Ready` | keep | Neutral |
| S20 | index.html:233, app/main.ts:299 | aria `Scoreboard`, `Scoreboard: ...` | `Answers`, `Answers: ...` | Score is a game term |
| S21 | app/main.ts:309 | `Starts in Lobby` | keep | Plain |
| S22 | app/main.ts:310 | `Out via A, B, C` | `Route: A, B, C`, listed from the street in for a get-in question (sofa) | Works for in and out |
| S23 | app/main.ts:327-330 | `Cannot turn at Lobby door - needs ...` | `{Name} is (are) stuck at {Place}: {reason}, {numbers}` | One stuck line everywhere (section 3) |
| S24 | new, foot of `#scorePanel` | none | `A quick check of sizes and routes, not a code review.` | Keeps ADR 0007's no-compliance rule |
| S25 | index.html:235, app/main.ts:318 | `LEVEL COMPLETE` / `Every object got out of the building` / `3 of 3 out with 2 edits` | `Yes` or `Yes to all {n}` / yes lines joined, then `With {k} edits.`; a glass card in the fix sheet slot (right, above the dock), shown with the Answers panel open | Section 3; never over the Answers panel |
| S26 | viewer/index.ts:106 | `LEVEL COMPLETE` | `Yes to all` (FONT_BODY, not the pixel font) | Game term; the app hides this one, dev.html shows it |
| S27 | app/main.ts:341, index.html:236 | sheet label `Fix it`; sheet aria `Fixes` | `Suggested fixes` (both) | Calm; not a level task |
| S28 | app/main.ts:359 | card aria `Sofa failed` | `Can my sofa get in? No` | Question framing |
| S29 | app/main.ts:360 | card header `Sofa` + `FAIL` | person label, question, `No` | Section 2, point 2 |
| S30 | app/main.ts:357, 361 | `Cannot turn` + ` at Lobby door`; fallback `Blocked` | `Cannot turn the corner at Lobby door`; fallback `Stuck` | Section 3 reason words |
| S31 | app/main.ts:362 | `Needs 2.2 m, has 2 m` | `Needs 2.2 m, has 2.0 m` | One-decimal metres |
| S32 | app/main.ts:363 | `No preset fix for this object.` | `No suggested fix here yet. Type an edit.` | "object" |
| S33 | app/main.ts:366, 368 | aria `Fix for Sofa`; `More fixes` | keep | Plain |
| S34 | app/main.ts:344, 345 | foot `Type an edit`, `Reset` | `Type an edit`, `Undo edits` | Match S07 |
| S35 | index.html:237, 238 | panel aria and label `Type an edit` | `Edit the building` | Says what it edits |
| S36 | index.html:238, 240, 241 | `Close Esc`, placeholder `For example: widen the lobby door to 1.6 m`, `Apply` | keep | Plain |
| S55 | new, viewer/corner-fx.ts | none | `Longest that fits: {n} m` beside the dashed line of a jam at a corner (one decimal) | Names the solver's own number; the card says the rest |
| S37 | app/main.ts:380, 382 | `Applied: {fix}`, `Reset` | `Applied: {fix}`, `Undo edits` | Match S07 |
| S38 | app/main.ts:389, 390, 393 | `Not sure what you meant by "x".`, `Did you mean`, `Cancel` | keep | Plain |
| S39 | app/main.ts:398 | `Typed edits use the keyword parser until Jev is connected.` | `Matched by keywords for now. Jev is not connected yet.` | Shorter; no parser jargon |
| S40 | app/main.ts:192 | note `Re-solved after Widen lobby door to 1.6 m` | `Checked again after: Widen lobby door to 1.6 m` | Solver jargon |
| S41 | app/main.ts:203 | note `Re-solved after Reset (back to building.json)` | `Checked again with the original building` | File name on screen |
| S42 | app/main.ts:180 | note `Sofa placed in Lobby` | `Sofa starts in Lobby` | "placed" is a game move |
| S43 | app/main.ts:61-62 | note `Sofa not placed: drop it on a floor of the tower` / `not moved` | keep | Plain |
| S44 | app/main.ts:488 | note `Sofa is already on the top floor` | keep | Plain |
| S45 | viewer/index.ts:68 | toast `Not placed: drop it on a floor of the tower` | keep | Plain |
| S46 | viewer/index.ts:441 | hints `Sofa: drop in Lobby`, `... not a floor, drop it on the tower` | keep | Plain |
| S47 | app/shell.ts:68-71 | caption `Sofa - Lobby - Escaping` / `Ready` / `PASS` / `FAIL: cannot turn` | `Sofa - Lobby - Checking` / `Ready` / `Yes` / `No: cannot turn the corner` | S12, S18 |
| S48 | app/scoreboard.ts:18-27 | reason text | section 3 table | One set of words |
| S49 | app/scoreboard.ts:56, 58, 59 | `blocked`; `escaped`; detail `too narrow at Plant shaft` | `stuck`; the yes line from section 2; the stuck line from section 3 | "escaped" is the game verb |
| S50 | app/scoreboard.ts:49, viewer/labels.ts:41 | `needs X m, has Y m` | keep, with one-decimal metres | Plain |
| S51 | viewer/labels.ts:6-15, 30, 44 | `SOFA  CANNOT TURN` (upper case, two spaces) | `Sofa: cannot turn the corner` | Shouting arcade caps; calm sentence case |
| S52 | viewer/labels.ts:37, 38 | `step 0.15 m, needs level`; `no load path to a foundation` | `0.15 m high, needs level`; `no path down to a foundation` | Shorter, plain |
| S53 | viewer/labels.ts:109 | room `Street - exit` | keep | Building word |
| S54 | app/state.ts:36-46 | fix labels `Widen lobby door to 1.6 m`, `Add transfer beam at beam B2`, `Add ramp at terrace door`, `Reset` | keep; `Reset` -> `Undo edits` | S07 |

Not on screen, so no change: CSS class names, key names, `console.warn` text
(`app/main.ts:504-505`), `app/flow.ts` badges (`READY`, `ESCAPED`, `COMPLETE`, `CONFLICT`; not
imported by `main.ts`), and every contract id.

## 5. Docs and story

| file:line | Current | Replacement |
|---|---|---|
| README.md:3 | `Every discipline has to get out.` | `Ask your building: can my sofa get in, can my parent's wheelchair get out?` |
| README.md:14-23 | "turns the building into a game ... races out ... LEVEL COMPLETE ... It is a game, not a code check." | "Escape Plan answers the questions people ask about a building. A home buyer asks if the sofa gets in. A family asks if a parent's wheelchair gets out. An owner asks if the shaft can be widened for a new chiller. Press Show me and the building answers each one, with the place and the numbers. Fix one answer and every other answer is checked again: widen the shaft and the structure answer turns to No at beam B2. It is a quick check of sizes and routes, not a code review." |
| README.md:47 | `Game shell: edits, scoreboard, ...` | `App shell: edits, answers, text box, phone controllers.` |
| README.md:71-76 | `race`, `post-game report` | `people and smoke`, `report after the session` |
| AGENTS.md:3-6, 33, 47; package.json:5 | "browser game", "plays a token", "It is a game, not a code check", "LEVEL COMPLETE", "Start the game", "graph game" | the README.md:3 and :14-23 wording; "Start the app" |
| GLOSSARY.md:6-14 | `## Game`; Token; Escape; LEVEL COMPLETE | `## Experience`. Add **Question**, **Answer** (Yes / No), **Person** (home buyer, family, owner, manager). **Token** stays as the code term, with: "On screen it is named (Sofa), never called a token." **Escape** -> **Show me** (code: `escape()`). **LEVEL COMPLETE** -> **Yes to all** (code: phase `complete`). |
| GLOSSARY.md:26-27 | "race with smoke", "races the people" | "timed against the smoke", "is timed against the people" |
| docs/adr/0007 | "A game, not a code check" | New ADR 0010 "Answers to people's building questions, not a game" supersedes it. Keeps: never claim compliance; people and smoke is not an egress analysis. |
| app/README.md:4, 14 | "the game shell", "Escape! button, a scoreboard and a LEVEL COMPLETE banner" | "the app shell", "Show me button, the Answers panel and the Yes to all banner" |
| viewer/README.md:26-30 | "LEVEL COMPLETE shows" | "the Yes to all banner shows" |
| data/README.md:30 | "Reload the game" | "Reload the app" |
| design/README.md:12-13, 27-28; design/look.md:62-64, 71-81, 107-118; design/tokens.ts:2-5, 32, 41, 127; design/flow.md:14, 20, 26-37 | "game surface", "board", "pixel type for moments", "ESCAPE!", "LEVEL COMPLETE", "REPLAY", "win", "level, escaped count", "player" | "calm, light surface", "model", "Show me", "Yes to all", "Try again", "all-yes"; flow sheet 10 "Yes to all". Retire the pixel font and the win flash for the all-yes banner (look task). |
| contract/README.md | `token`, `escape` ids | no change (contract, P1, code ids) |

## 6. Tests phase 2 must update with the strings

These assert UI words, not `data/expected.json` values, so rule 5 does not block them:
`app/shell.test.ts:41-44, 114, 117`, `app/scoreboard.test.ts:19-21, 48`, `app/state.test.ts:70`
(name only), `viewer/labels.test.ts:14`. Full list: `grep.log`, last section.

## 7. Notes for later tasks

- **Motion:** for "get in" questions (sofa), play the route from the street to the start room. No flash or bounce on Yes.
- **Hint:** use the section 1 words ("Pick a question", "Show me", "Undo edits").
- **Load:** the chiller and load share one scene and one person (owner). Show both answers together.
- **Smoke (T2):** question and lines in section 2. Numbers read "people need 6 steps, smoke takes 4".
- **Demo script and deck:** open each scene with the person and the question, say the answer
  and the numbers, then the fix. End on "a quick check, not a code review".
  - Most Impactful: real people, before moving day or a renovation.
  - Most Collaborative: one model answers everyone, and one person's fix changes another
    person's answer (the shaft edit cuts beam B2).
  - Best Overall: a deterministic solver that checks every answer again on each edit.
- **Dock size:** past three questions the dock will not fit at 1366 px. Revisit the picker
  when chiller, load and glass join the dock.
