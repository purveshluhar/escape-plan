---
name: demo-and-pitch
description: The 3-minute demo script, the backup recording, and answers for judge Q&A. Use when writing or rehearsing the demo, recording the backup, or preparing for questions.
---

# Demo and pitch

Plan the pitch around tier 1. Show a tier 2 or 3 item only if it is green at feature freeze.

## 30-second pitch beats

1. The hook: "In fifteen years your building's chiller dies. How do you get the new one in?"
2. The problem: every discipline has the same question: can my thing get through?
3. The game: every discipline gets a token; press Escape! and they race out.
4. The referee (only if green): Jev turns words into edits and every discipline votes, live.
5. The line: "Fix one, break another."

Drop any sentence whose feature is not green at freeze.

## 3-minute demo beats

1. **Press Escape!** The chiller sticks in the plant shaft. The glass will not turn. The
   wheelchair hits a step. (Tier 2: smoke beats people to the stair.)
2. **Widen the plant shaft to 2 m** (button, or typed if Jev is green). The chiller reaches
   the truck, but beam B2 is cut and the load turns red.
3. **Add a transfer beam at B2, a ramp at the terrace door, and widen the lobby corner** (and
   close the stair door, tier 2). Everything goes green: **LEVEL COMPLETE** (expected case
   `full-demo`).
4. Close: one graph, every discipline, every edit re-solved. A game, not a code check.

## Steps

1. Write the script in `design/demo-script.md` from the beats above, with who clicks what.
2. Each edit in the script must be an expected case in `data/expected.json`, so the demo
   cannot surprise you.
3. Rehearse from the `tier1-demo` (or `tier2-demo`) tag on the presenting laptop. Run
   `git fetch --tags --force` first, because `tier1-demo` is re-tagged. Time it.
4. At gate 12 in `docs/plan.md` (after feature freeze, gate 11), record a raw screen capture of
   the full demo: the backup. Keep it on two machines.
5. If anything fails live, switch to the backup without apology and keep talking.

## Judge Q&A

| Question | Answer |
|---|---|
| Has this been done? | Separate checks exist: accessibility and egress checkers, evacuation and equipment-path research. One shared graph where each discipline plays a token and every edit re-solves all of them, as a game, we did not find. Our search was limited, so we say "not found", not "new". |
| Is this a code check? | No. It is a game, not a code check. It shows path clashes early so the right expert looks. |
| Does AI decide? | No. A deterministic solver decides every pass or fail and shows the numbers. Jev turns words into edits and gives vote bubbles. |
| How did 5 people build this in 10 hours? | AI agents built against one frozen contract, small frequent merges, and hand-checked test cases as the truth. |
| Can I use it? | MIT, a sample building, runs in the browser (tier 1 needs no server). No Cityweft data is in the repo; plug in your own context. |

## Done when

- The script runs end to end in under 3 minutes, three times in a row.
- The backup recording exists on two machines.
- Every presenter can give each Q&A answer in one breath.
