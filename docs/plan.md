# Team plan

Visual version for discussion: [plan-graph.html](plan-graph.html) (open in a browser), with PNGs
in [plan-graph/](plan-graph/): [tier ladder](plan-graph/tier-ladder.png),
[who builds what](plan-graph/who-builds-what.png), [feature owners](plan-graph/feature-owners.png),
[demo path](plan-graph/demo-path.png). If the two disagree, this file wins.

Five people, each coding with an AI agent. Build Saturday 12:00-22:00; Sunday is rehearsal and
the 11:30 submit. Full scope is kept in three tiers. Each tier starts only when the one before
it is green, so we never end with nothing working.

## Roles

| Role | Folder | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|---|
| P1 Graph and solver lead (@purveshluhar) | `contract/`, `solver/`, `server/` | Contract; chiller, glass, wheelchair, load; re-solve; tests | People and smoke race; water; local server; Jev parse (or plan B or C) | Electrical; Jev votes; phone sockets in the server |
| P2 3D and animation (@justinjao) | `viewer/` | Isometric cutaway; token paths; red X and LEVEL COMPLETE | Cityweft backdrop; smoke spread animation | Look polish, camera moves |
| P3 Front-end, edits and AI (@minsookim1014, @jackwayfeel) | `app/` | Edit buttons, reset, scoreboard, app state | Text box and "Did you mean" buttons for Jev edits | Vote bubbles; phone controllers; voice |
| P4 Designer and presenter (@minsookim1014, @jackwayfeel) | `design/` | Icons, colours, path style, script | Sound | LLM post-game report (with P3); final deck |
| P5 Domain modeller and tester (@kalunkuo) | `data/` | `building.json`; `expected.json` for the 4 tokens | Cityweft export; expected cases for people, smoke and water | Electrical data; Q&A prep |

Humans keep: the contract, the expected results, the merge, the look, and the demo script.

P1 owns the Jev work (parse, plan B and C, votes) and the small local server in `server/` (ADR 0008).
P3 owns the screens that use it and wires them to that server. @minsookim1014 and @jackwayfeel
share P3 and P4 and work on both roles together.

## Tiers

**Tier 1, must ship.** The shared graph. Chiller, glass, wheelchair and load. Live re-solve
after an edit. The shaft-breaks-beam moment. The 3D cutaway, or 2D stacked plans after 15:30.

**Tier 2** (go at 17:00 only if tier 1 is green), in this order:
1. People and smoke race.
2. Jev parse, or plan B.
3. Cityweft backdrop.
4. Sound.
5. Water.

**Tier 3** (go at 19:30 only if tier 2 is tagged), in this order:
1. Jev votes.
2. Phone controllers.
3. Electrical.
4. Voice.
5. LLM post-game report.

**Cut order.** If time runs short, cut from the bottom of tier 3 upward, then the bottom of
tier 2 upward. Tier 1 is never cut.

## Checkpoints

| Time | Checkpoint |
|---|---|
| 12:00-12:45 | Contract freeze, all five. `AGENTS.md` and `contract/` land. |
| 13:00 | Merge 1. Jev go/no-go (key in hand?). |
| 14:00 | Cityweft go/no-go. |
| **14:30** | **Checkpoint 1:** chiller end to end: JSON, solver, animated path, red X. |
| 15:30 | 3D go/no-go: a token must read clearly moving through the cutaway. |
| 16:30-17:00 | Integration session, all. |
| **17:00** | **Checkpoint 2, tier 1 done:** 4 tokens, live re-solve, shaft-breaks-beam. Tag `tier1-demo`. Go/no-go for tier 2. |
| 17:30 | Jev latency check (slower than 2 s?). |
| 19:00-19:30 | Integration session, all. |
| **19:30** | **Checkpoint 3:** tag `tier2-demo` with the green tier 2 items. Go/no-go for tier 3. Wifi check for phones. |
| **21:00** | **Feature freeze.** Fixes only. README and run guide. Rehearsal 1. |
| 21:00-22:00 | Fixes. Raw screen capture of the demo (the backup). Rehearsal 2. |
| 22:00 | Stop. |
| Sun 08:00-10:30 | Final run on the presenting laptop; rehearse with the video and deck 3 times; Q&A. |
| Sun 11:00 | Pencils down. Submit by 11:30. |

## Switch times

- **Jev:** 13:00 to plan B or C if there is no key; 17:30 to plan B or C if calls are slower than 2 s.
- **Cityweft:** 14:00 to the plain ground plane with a hand-modelled curb and truck.
- **3D:** 15:30 to 2D stacked plans (one SVG per level). 3D polish continues on a branch only.
- **Phones:** 19:30 to a stage-only demo if the wifi blocks local sockets.

## Top risks

| Risk | Trigger | What we do |
|---|---|---|
| Contract drift | The 13:00 merge fails on types or field names | Only P1 changes `contract/`; every agent reads it first. |
| The solver is plausibly wrong | P5's cases fail at 14:30 or 17:00 | `expected.json` is the truth. No solver merge unless its cases are green. P1 debugs by hand. |
| A late merge breaks the demo | A tier 2 or 3 merge breaks tier 1 | Revert, demo from the last tag. |
| Access fails | No Jev key at 13:00; no Cityweft export at 14:00; Jev slower than 2 s; wifi blocks phones | Switch to plan B or C at once. |
| The 3D look eats the afternoon | At 15:30 a token still does not read clearly | Switch to 2D stacked plans. |

## Merges

Small merges to `main` on the hour, every hour, about 10 minutes, P1 merging. Each person works
on a branch `p<N>/<topic>` and opens a PR. `main` must always run the tier 1 demo. Before each
merge, run the `review-merge` skill.

## House rules

- All code is written at the event. MIT from the first commit.
- Self-made building data. No Cityweft data in the repo.
- It is a game, not a code check.
- The solver decides pass or fail. Jev parses edits and votes, but never decides.
