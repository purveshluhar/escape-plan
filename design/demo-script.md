# Demo script

Owner: P4, with P1. The live demo the team speaks over the real app, beat by beat. Every click
below passed in the final click-through of the demo build (step ids S01 to S53). Every string in
quotes is the exact text on screen. Words follow `design/copy.md`.

Each beat opens with one person's question about their building. Say the answer, then the
numbers, then the fix.

## Before you start

1. Run `npm ci`, then `npm run dev`. Open http://localhost:5173 at 1920 x 1080 or 1366 x 768.
2. Optional: run `npm run server` in a second terminal. The page reads typed edits on its own
   when the server is off (see "If something fails").
3. Keep `DECIDER=keywords` (the default) unless `npm run time-parse` on this laptop says
   `5/5 applied and right` with a median under 2000 ms (`server/README.md`).
4. Wait for "Loading the city around the tower" to go away.
5. Have the backup recording open in a second window.

Keys: `1` to `6` ask a question, `Space` is Show me, `/` opens Edit, `R` is Undo edits, `Esc`
closes a panel.

## Beat 1. The family: can my parent's wheelchair get out?

| Click | On screen | Say |
|---|---|---|
| Open the page | The 432 Park Avenue tower in its city block. "Your building", "Pick a question to start" | "This is 432 Park Avenue in Manhattan. One building, and everyone who lives in it or runs it has a question." |
| Click "Wheelchair", then Show me | "Checking 1 route", then the card: "FAMILY", "Can my parent's wheelchair get out?", "No", "Step in the way at Terrace door", "0.15 m high, needs level" | "A family asks if their parent's wheelchair gets out. No. There is a 15 cm step at the terrace door." |
| Click "Add ramp at terrace door" | "Yes", "The wheelchair gets out, no steps. With 1 edit." | "Add a ramp. Every answer is checked again, and now it is Yes." |
| Click "Undo edits" | "Checked again with the original building" | "Undo puts the building back as built." |
| Click "Clear" | "Pick a question to start" | |

## Beat 2. The home buyer: can my sofa get in?

| Click | On screen | Say |
|---|---|---|
| Press `2`, then `Space` | "HOME BUYER", "Can my sofa get in?", "No", "Cannot turn the corner at Lobby door", "2.2 m long, longest that fits 2.0 m". On the model: "Sofa: cannot turn the corner", "2.0 < 2.2 m", "Lobby door: 2.2 m long, fits 2.0 m" | "A buyer asks if the sofa gets in. No. The sofa is 2.2 m long. The longest thing that turns that corner is 2.0 m." |
| Click "Hint" | The sofa's Hint: "The rules tried 4 fixes.", "Widen lobby door to 1.4 m", "Then: The sofa gets in." | "Hint asks the rules. They tried 4 fixes at the stuck door and found the smallest one: 1.4 m." |
| Click "Apply this fix" | "Yes", "The sofa gets in. With 1 edit." | |
| Press `R` | Back to "No" | |

Speaker note: the fix button says 1.6 m and Hint says 1.4 m. Both are Yes. The button is the
hand-checked demo edit; Hint is the smallest width the rules accept.

## Beat 3. The owner: does a new chiller fit through the shaft? The key moment

| Click | On screen | Say |
|---|---|---|
| Click Clear. Press `4`, `5`, then Show me | "BUILDING OWNER", "Does a new chiller fit through the shaft?", "No", "Too narrow at Plant shaft", "Needs 1.6 m, has 1.2 m". The structure question is Yes. | "The owner asks two things. Does the new chiller fit through the shaft? No: it needs 1.6 m and the shaft has 1.2 m. Does the structure still hold? Yes, today." |
| Press `/`, type `widen the plant shaft to 2 m`, press `Enter` | The strip: "You typed: "widen the plant shaft to 2 m"", "Read by: this page", "No model is connected, so this page read it.", "EDIT Widen 0.95", "WHERE Plant shaft 1.00", "SIZE 2.0 m 0.95", "Every part is 0.80 or more, so the edit was made.", then "Decided: building rules, 3 ms" (the time can differ), "Chiller Yes", "Load No". Under it: "Reads your words. It can say "not sure"." and "Plain rules decide. Same answer every time." | "I just type the edit. The reader turns my words into one edit and gives a confidence for each part. Only at 0.80 or more is the edit made." |
| Look at the fix sheet | "Widen plant shaft to 2.0 m broke an answer", "Does the structure still hold? Yes became No. Load is stuck at beam B2: nothing holds it up, no path down to a foundation". Beam B2 flashes red. | "The chiller now fits. But the wider shaft cuts beam B2, and nothing holds it up. One fix broke another answer, and the building told us right away." |
| Look at the review panel | "Review panel: rules only", "Votes by: the rules. No model is connected.", one vote for each discipline asked about, "Votes only. They never change an answer: the rules decide." | "Each discipline asked about votes on the edit. A vote never changes an answer." |
| Click "Add transfer beam at beam B2" on the fix sheet | "Yes to all 2", "The chiller fits through the shaft. The structure still holds. With 2 edits." | "A transfer beam carries B2 again. Both answers are Yes." |

The line for this beat: "A decision model can be the reader and the review panel. The rules
decide." Say what the screen says. With the default `DECIDER=keywords`, the strip says "Read by:
this page" and the panel says "Votes by: the rules. No model is connected." With a model that
passed the laptop timing, the strip says "Read by: the model" and the panel line starts "Votes by: the model". Either way, the
answer is the rules'.

Optional, after the beat, to show "not sure": press `R`, press `/`, type `make it bigger`. The strip turns amber:
"Not sure (0.20). Nothing was changed.", then "Did you mean" and buttons. Press `Esc`.

## Beat 4. The building manager: do people get out before the smoke?

| Click | On screen | Say |
|---|---|---|
| Press `R`, then Clear. Press `6`, then Show me | A grey haze spreads from the lobby, room by room. Then "Do people get out before the smoke?", "No", "Too narrow at Office door", "Needs 0.6 m, has 0.5 m" | "The manager asks if people get out before the smoke. First, they cannot get out at all: the office door is 0.5 m." |
| Click "Widen office door to 0.9 m" | "Smoke gets there first at North service corridor", "People reach North service corridor at step 1. Smoke gets there at step 1. A tie goes to the smoke." | "Now they get out of the office, but the smoke reaches the corridor at the same step. A tie goes to the smoke." |
| Click "Close lobby door" | "Yes", "Everyone gets out before the smoke. With 2 edits." | "Close the lobby door. The smoke is now one step behind them." |

Say it plainly: "This answer is for the ground floor. We also checked people starting on Level 10
and Level 20: there the smoke reaches the stairs first, even with the lobby door closed."

## Beat 5. The whole tower

| Click | On screen | Say |
|---|---|---|
| Click Clear. Turn the mouse wheel 3 notches in | The facade fades. The open floor has a label, for example "Level 2". | "Zoom in and the facade opens to the floor plans." |
| Right-drag the model down, then up | The open floor changes as the view moves. Its label names it, for example "Level 30". | "Every floor of the tower opens, from Level 2 to Level 86." |
| Double-click the model | Back to the framed view | "Every edit checks every question again over the whole tower, in a few milliseconds." |

## Close

Say: "One building answers everyone at once, and one person's fix can change another person's
answer. It is a quick check of sizes and routes, not a code review." The same line is at the foot
of the Answers panel: "A quick check of sizes and routes, not a code review."

## Open source

- MIT licence (`LICENSE`). Clone the repo, then `npm ci` and `npm run dev`. No key and no server
  are needed. `npm run check` runs the typecheck, the tests, the solver timing test and the build.
- A new question is about four small edits. The sofa shows them:
  1. One line in `data/building.json` for the thing: its size, start room and rule (line 757).
  2. One line in `app/questions.ts` for the person, the question and the Yes line (line 18).
  3. One id in the list of questions on screen, `MVP_TOKENS` in `app/mvp.ts` (line 10).
  4. Hand-checked cases in `data/expected.json`. The sofa's fix case is 24 lines (lines 116 to
     139). A fix button comes from the edits in the `full-demo` case.
  Put the new id before `smoke`, which stays last. Then update the dock lists that the tests pin
  (`app/questions.test.ts`, `app/mvp.test.ts` and `app/smoke.test.ts`), and run `npm run check`. A seventh question
  was not checked on screen. This works for the seven rules the solver answers
  (`IMPLEMENTED_RULES` in `solver/index.ts`). A new rule is solver work.

## Learning and the team

- What we learned: each presenter says one thing that was new to them. The repo backs these
  examples:
  - a small decision model that picks from a list and gives a confidence (Strands Decider);
  - the Cityweft API for the city block;
  - five people coding with AI agents against one frozen contract (`AGENTS.md`).
- The team: five people in five roles: graph and rules, 3D, front end, design, and data. Two of
  them share front end and design (`AGENTS.md`). Name each person and their role.

## Limits, said plainly

- The building data is self-made and approximate. The 432 Park Avenue model is our own
  reconstruction from published diagrams and sources (`data/432-park/README.txt`). Every door,
  lift and stair in the graph is self-made.
- It is not a code-compliance check. The rules are simple checks of sizes and routes.
- Get-in questions (the sofa) are checked on the route out, and the animation runs outward. The
  answer is the same, because the doors work both ways.
- The people-and-smoke answer is for the ground floor only. Above it, the smoke reaches the
  stairs first whatever door is closed.

## If something fails

| What fails | What the page shows | What to do |
|---|---|---|
| The server is off | The strip: "Read by: this page", "The server is not reachable." The panel: "Review panel is off", "No votes - the server is not reachable", "The rules still decide every answer." | Keep going. The page reads the sentence itself, and the edit is made. Say: "The rules still decide every answer." |
| The model is off or slow (`DECIDER=strands`) | The strip: "Read by: this page", "The model gave no answer (down or busy)." The panel: "Votes by: the rules. The model gave no usable vote (off, busy, slow or unclear)." | Keep going. The page reads it, and the rules vote. |
| The city block is slow | "Loading the city around the tower". Questions and answers work before it arrives; the floor plans come with it. | Start with beats 1 to 4. Do beat 5 once the block is in. |
| The city block is not on this laptop | Plain ground, no city. The tower questions still work. | Skip the city line. |
| A typed edit asks "Did you mean" | Amber strip, "Nothing was changed." | Click the right button under "Did you mean", or use the fix button. |
| The page breaks | | Switch to the backup recording without apology and keep talking. |

## Judge questions

| Question | Answer |
|---|---|
| Does the AI decide? | No. Plain rules in the solver decide every Yes and No, the same every time. The model only reads the sentence and votes. |
| Why not just try everything? | We do, where it is cheap. On this build, trying every single edit across the building takes 11,922 solves in about 25 s. That is too slow to feel live. Trying edits only at the stuck places takes 10 tries in about 35 ms, and finds a fix for each stuck question. That is what Hint does: on the sofa it needed 4 tries. It stops at 100 tries or 250 ms. |
| Is this a code check? | No. It is a quick check of sizes and routes, so the right expert looks early. |
| Is the building real? | The tower is a 432 Park Avenue model we built from published diagrams and sources: the real height and floor-to-floor, approximate plans. The doors, lifts and stairs are self-made. |
| Which model reads the words? | Today, on this laptop, the page reads them by keywords; the strip says "Read by: this page". The server can run Strands Decider, an open-source (Apache-2.0) decision model, on this computer. Then the strip says "Read by: the model". |
| How fast is it? | One check of the whole tower takes a few milliseconds. The test suite holds every hand-checked case under 100 ms in total. |
| Can I use it? | Yes: MIT, it runs in the browser, and it needs no key. The city block is not in the repo; fetch it with your own Cityweft key. |
