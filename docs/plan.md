# Team plan

Visual version for discussion: [plan-graph.html](plan-graph.html) (open in a browser), with PNGs
in [plan-graph/](plan-graph/): [tier ladder](plan-graph/tier-ladder.png),
[who builds what](plan-graph/who-builds-what.png), [feature owners](plan-graph/feature-owners.png),
[demo path](plan-graph/demo-path.png). If the two disagree, this file wins.

Five people, each coding with an AI agent. Full scope is kept in three tiers. Each tier starts
only when the one before it is green, so we never end with nothing working. Work follows the
order and the green gates below, not the clock (ADR 0009).

## Roles

| Role | Folder | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|---|
| P1 Graph and solver lead (@purveshluhar) | `contract/`, `solver/`, `server/` | Contract; MVP first: wheelchair, sofa and people walk out; then chiller, glass, load; re-solve; tests | People and smoke; water; local server; Jev parse (or plan B or C) | Electrical; Jev votes; phone sockets in the server |
| P2 3D and animation (@justinjao) | `viewer/` | Isometric cutaway; token paths; red X and the Yes to all banner | Cityweft backdrop; smoke spread animation | Look polish, camera moves |
| P3 Front-end and edits (@minsookim1014, @jackwayfeel) | `app/` | Edit buttons, Undo edits, the Answers panel, app state | Text box and "Did you mean" buttons for Jev edits | Vote bubbles; phone controllers; voice |
| P4 Designer and presenter (@minsookim1014, @jackwayfeel) | `design/` | Icons, colours, path style, script | Sound | LLM report after the session (with P3); final deck |
| P5 Domain modeller and tester (@kalunkuo) | `data/` | `building.json`; `expected.json` for the 4 tokens, plus the sofa and people tokens and their expected cases | Cityweft export; expected cases for people and smoke, and water | Electrical data; Q&A prep |

Humans keep: the contract, the expected results, the merge, the look, and the demo script.

P1 owns the Jev work (parse, plan B and C, votes) and the small local server in `server/` (ADR 0008).
P3 owns the screens that use it and wires them to that server. @minsookim1014 and @jackwayfeel
share P3 and P4 and work on both roles together.

## Tiers

**Tier 1, must ship.** The shared graph. MVP first: wheelchair, sofa and people walk out. Then
chiller, glass and load, live re-solve, the shaft-breaks-beam moment. The 3D cutaway, or 2D
stacked plans.

**Tier 2** (go only when every tier 1 token is green and `tier1-demo` is re-tagged), in order:
1. People and smoke.
2. Jev parse, or plan B.
3. Cityweft backdrop.
4. Sound.
5. Water.

**Tier 3** (go only when `tier2-demo` is tagged), in this order:
1. Jev votes.
2. Phone controllers.
3. Electrical.
4. Voice.
5. LLM report after the session.

**Cut order.** When the team calls a cut, cut from the bottom of tier 3 upward, then the bottom
of tier 2 upward. Tier 1 is never cut.

## Gates

In this order. A gate is passed when its condition is green, not at a time.

| # | Gate |
|---|---|
| 1 | Contract freeze, all five. `AGENTS.md` and `contract/` land. |
| 2 | First merge. Jev go/no-go (key in hand?). |
| 3 | Cityweft go/no-go. |
| 4 | **MVP gate:** wheelchair, sofa and people green on their expected cases. Tag `tier1-demo`. |
| 5 | 3D go/no-go: a token must read clearly moving through the cutaway. |
| 6 | Integration session, all. |
| 7 | **Tier 1 done:** chiller, glass and load green too, live re-solve, shaft-breaks-beam. Re-tag `tier1-demo`. Go/no-go for tier 2. |
| 8 | Jev latency check (slower than 2 s?). |
| 9 | Integration session, all. |
| 10 | **Tier 2 done:** tag `tier2-demo` with the green tier 2 items. Go/no-go for tier 3. Wifi check for phones. |
| 11 | **Feature freeze.** Fixes only. README and run guide. Rehearsal 1. |
| 12 | Fixes. Raw screen capture of the demo (the backup). Rehearsal 2. |
| 13 | Final run on the presenting laptop; rehearse with the video and deck 3 times; Q&A. |
| 14 | Submit. |

## Switch conditions

- **Jev:** to plan B or C if there is no key, or if calls are slower than 2 s.
- **Cityweft:** to the plain ground plane with a hand-modelled curb and truck if there is no
  export at the Cityweft go/no-go.
- **3D:** to 2D stacked plans (one SVG per level) if a token still does not read clearly at the
  3D go/no-go. 3D polish continues on a branch only.
- **Phones:** to a stage-only demo if the wifi blocks local sockets.

## Top risks

| Risk | Trigger | What we do |
|---|---|---|
| Contract drift | The first merge fails on types or field names | Only P1 changes `contract/`; every agent reads it first. |
| The solver is plausibly wrong | P5's cases fail at the MVP gate or the tier 1 gate | `expected.json` is the truth. No solver merge unless its cases are green. P1 debugs by hand. |
| A late merge breaks the demo | A tier 2 or 3 merge breaks tier 1 | Revert, demo from the last tag. |
| Access fails | No Jev key at the first merge; no Cityweft export at its go/no-go; Jev slower than 2 s; wifi blocks phones | Switch to plan B or C at once. |
| The 3D look eats the build | At the 3D go/no-go a token still does not read clearly | Switch to 2D stacked plans. |

## Merges

Small, frequent merges to `main`, about 10 minutes each, P1 merging. Each person works
on a branch `p<N>/<topic>` and opens a PR. `main` must always run the tier 1 demo. Before each
merge, run the `review-merge` skill.

## House rules

- All code is written at the event. MIT from the first commit.
- Self-made building data. No Cityweft data in the repo.
- It answers people's questions about their building. It is a quick check of sizes and routes,
  not a code review (ADR 0010).
- The solver decides each Yes or No. Jev parses edits and votes, but never decides.
