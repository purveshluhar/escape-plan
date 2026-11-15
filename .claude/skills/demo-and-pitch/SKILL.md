---
name: demo-and-pitch
description: The 3-minute demo script, the backup recording, and answers for judge Q&A, with each scene told as a person's question about their building. Use when writing or rehearsing the demo, recording the backup, or preparing for questions.
---

# Demo and pitch

Plan the pitch around tier 1. Show a tier 2 or 3 item only if it is green at feature freeze.
Escape Plan is never a game. Each scene is a real person's question about their building. Use
the words in `design/copy.md`: question, Yes or No, Show me, Answers, Yes to all, Undo edits.

## How to tell each scene

1. Open with the person and their question: "A home buyer asks: can my sofa get in?"
2. Give the answer with the place and the numbers: "No. The sofa is stuck at the lobby door: it
   cannot turn the corner: it is 2.2 m long, and the longest that fits is 2.0 m."
3. Then the fix, and the answer after it: "Widen the lobby door to 1.6 m. Yes, the sofa gets in."

End the demo on the line "a quick check, not a code review".

## 30-second pitch beats

1. The hook: "In fifteen years your building's chiller dies. Can you widen the shaft to get the
   new one in?"
2. The problem: everyone with a building has the same question: can my thing get through?
3. The answer: ask your building. Press Show me and each person's question gets a Yes or a No.
4. Jev (only if green): it turns words into edits, and every discipline votes, live.
5. The line: "One person's fix can change another person's answer."

Drop any sentence whose feature is not green at freeze.

## 3-minute demo beats

1. **Press Show me.** The owner asks about the chiller: No, it is stuck at the plant shaft. The
   building owner's glass panel cannot turn the corner at the lobby door. The family asks about
   the wheelchair: No, a 0.15 m step at the terrace door. (Tier 2: the building manager asks if
   people beat the smoke.)
2. **Widen the plant shaft to 2 m** (button, or typed if Jev is green). The chiller gets out,
   but the structure answer turns to No: the shaft cuts beam B2.
3. **Add a transfer beam at B2, a ramp at the terrace door, widen the lobby corner, and widen the
   office door for the people** (and close the stair door, tier 2). Every answer is Yes: **Yes to
   all** (expected case `full-demo`).
4. Close: one building answers everyone, and every edit checks every answer again. A quick
   check, not a code review.

## The three awards

Say the line for each award in the pitch and in the deck.

- **Most Impactful**: real people get real answers, before moving day or a renovation.
- **Most Collaborative**: one model answers everyone, and one person's fix changes another
  person's answer: the shaft edit cuts beam B2.
- **Best Overall**: a deterministic solver that checks every answer again on each edit.

## Steps

1. Write the script in `design/demo-script.md` from the scenes above, with who clicks what.
2. Each edit in the script must be an expected case in `data/expected.json`, so the demo
   cannot surprise you.
3. Rehearse from the `tier1-demo` (or `tier2-demo`) tag on the presenting laptop. Run
   `git fetch --tags --force` first, because `tier1-demo` is re-tagged. Time it.
4. At gate 12 in `docs/plan.md` (after feature freeze, gate 11), record a raw screen capture of
   the full demo: the backup. Keep it on two machines.
5. If anything fails live, switch to the backup without apology and keep talking.
6. Check the script, deck and video for game words (level complete, score, win, player, play,
   race, token). Replace each one with the words in `design/copy.md`.

## Judge Q&A

| Question | Answer |
|---|---|
| Has this been done? | Separate checks exist: accessibility and egress checkers, evacuation and equipment-path research. One shared building graph that answers every person's question and checks every answer again on each edit, we did not find. Our search was limited, so we say "not found", not "new". |
| Is this a code check? | No. It is a quick check of sizes and routes, not a code review. It shows clashes early so the right expert looks. |
| Does AI decide? | No. A deterministic solver decides every Yes or No and shows the numbers. Jev turns words into edits and gives vote bubbles. |
| Is this an egress analysis? | No. People and smoke is a timed check of who gets there first, not an egress analysis. |
| How did 5 people build this in 10 hours? | AI agents built against one frozen contract, small frequent merges, and hand-checked test cases as the truth. |
| Can I use it? | MIT, a sample building, runs in the browser (tier 1 needs no server). No Cityweft data is in the repo; plug in your own context. |

## Done when

- The script runs end to end in under 3 minutes, three times in a row.
- The backup recording exists on two machines.
- Every presenter can give each Q&A answer in one breath.
