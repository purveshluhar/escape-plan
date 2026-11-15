# Escape Plan

**Ask your building: can my sofa get in, can my parent's wheelchair get out?**

## What it is

Escape Plan answers the questions people ask about their building. It is for home buyers,
families, building owners, building managers, and anyone with a real problem to solve in a
building. Each question opens with the person who asks it:

| Person | Question | As built | The fix |
|---|---|---|---|
| Family | Can my parent's wheelchair get out? | No: a 0.15 m step at the terrace door | Add ramp at terrace door |
| Home buyer | Can my sofa get in? | No: the 2.2 m sofa cannot turn the corner at the lobby door | Widen lobby door to 1.6 m |
| Building manager | Can everyone get out? | No: the office door is 0.5 m, people need 0.6 m | Widen office door to 0.9 m |
| Building owner | Does a new chiller fit through the shaft? | No: it needs 1.6 m, the shaft has 1.2 m | Widen plant shaft to 2.0 m |
| Building owner | Does the structure still hold? | Yes, until the shaft is widened: then nothing holds up beam B2 | Add transfer beam at beam B2 |
| Building manager | Do people get out before the smoke? | No: the office door is too narrow. Widen it, and people and smoke reach the corridor at the same step | Widen office door to 0.9 m, then Close lobby door |

Pick a question and press **Show me**. The building answers Yes or No, with the place and the
numbers. Make an edit and every question is checked again. Fix one answer and you can break
another: widen the shaft for the chiller, and the structure answer turns to No at beam B2. A
transfer beam fixes it. It is a quick check of sizes and routes, not a code review.

Plain rules in a deterministic solver decide every answer, the same every time. You can type an
edit ("widen the plant shaft to 2 m"). A reader turns the sentence into one edit and shows a
confidence for each part; it can say "not sure". After each edit, a
review panel gives one vote for each discipline asked about. A vote never changes an answer. **Hint** asks the rules for the smallest edit at
the stuck place that turns a No to Yes, and says what it breaks.

The building is 432 Park Avenue in Manhattan, with all its floors. Zoom in and the facade opens
to the floor plans, from Level 2 to Level 86. The city block around it comes
from Cityweft, on your own machine only.

The live demo, beat by beat, is [design/demo-script.md](design/demo-script.md).

## What is real and what is approximate

| Part | Real or approximate |
|---|---|
| The answers | Real results of the rules on this data. The rules are simple checks of sizes and routes, not a building code. |
| 432 Park Avenue | Our own approximate model, rebuilt from published diagrams and sources. The height, floor-to-floor and window grid follow them. The floor plans are simplified, and the plan on each floor is generated. Sources: [data/432-park/README.txt](data/432-park/README.txt). |
| Doors, lifts, stairs, the plant shaft and beam B2 | Self-made. The demo rooms on the lower floors are hand-written. Some stair values are code minimums as recalled, not checked against the code text ([data/README.md](data/README.md)). |
| People and smoke | A count of steps: who reaches each place first. Not an egress analysis. The story is the ground floor; above it, the smoke reaches the stairs first whatever door is closed. |
| Get-in questions | The sofa is checked on its route out, and its animation runs outward. Doors work both ways, so the answer is the same. |
| The city block | Real Cityweft context data, fetched with your own key. It is never in the repo. |

## Run it

Needs Node 22.18 or later (`.nvmrc`).

```sh
git clone git@github.com:purveshluhar/escape-plan.git
cd escape-plan
npm ci
npm run dev      # http://localhost:5173
```

That is all the app needs. With no server, the page reads typed edits itself (by keywords), and
the review panel says it is off. The rules still decide every answer.

### Optional: the local server

The server reads typed edits and gives the votes. It listens on 127.0.0.1 only.

1. Copy `.env.example` to `.env`. The `.env` file is git-ignored. Never commit it.
2. Run `npm run server` in a second terminal, beside `npm run dev`. Vite forwards `/parse` and
   `/votes` to it.

The variables in `.env`, by name only. The defaults are in `.env.example` and
[server/README.md](server/README.md).

| Name | Used by | What it sets |
|---|---|---|
| `DECIDER` | server | `keywords` (the default) or `strands`, a local Strands Decider model |
| `STRANDS_URL`, `STRANDS_TIMEOUT_MS` | server | Where the Strands Decider listens, and how long to wait |
| `SERVER_PORT`, `SERVER_HOST` | server and Vite | The server's port; the host is 127.0.0.1 only |
| `CITYWEFT_API_KEY`, `CITYWEFT_SIZE_M` | `data/cityweft-fetch.ts` | Your Cityweft key, and the side of the block in metres |

Never give a variable a `VITE_` prefix: Vite ships those to the browser. Before you set
`DECIDER=strands`, time the model on your laptop with `npm run time-parse`
([server/README.md](server/README.md)).

### Optional: the city block

1. Put your key after `CITYWEFT_API_KEY=` in `.env`.
2. Run `node --env-file=.env data/cityweft-fetch.ts`. It writes the block to git-ignored
   `data/cityweft/`.
3. Reload the app. Without the block, the ground is plain and every question still works.

### Check before a merge

```sh
npm test             # contract, solver, app, viewer, design, data and server tests
npm run check        # typecheck, test, test:timing (the 100 ms solver budget, run alone) and build
```

## Add a question

A question about a thing that must get through the building takes four small edits. The sofa
shows them:

1. One line in `data/building.json` for the thing: its size, start room and rule.
2. One line in `app/questions.ts` for the person, the question and the Yes line.
3. Its id in `MVP_TOKENS` in `app/mvp.ts`, the questions the dock offers.
4. Hand-checked cases in `data/expected.json`. The fix button comes from the edits in the
   `full-demo` case.

Put the new id before `smoke`, which stays last. Then update the dock lists that the tests pin
(`app/questions.test.ts`, `app/mvp.test.ts` and `app/smoke.test.ts`), and run `npm run check`. A seventh question was
not checked on screen. This works for the seven rules the solver answers (`IMPLEMENTED_RULES` in
`solver/index.ts`). A new rule is solver work.

## Folder map

Roles: P1 @purveshluhar, P2 @justinjao, P3 and P4 @minsookim1014 and @jackwayfeel (together, on both roles), P5 @kalunkuo.

| Folder | Owner | What it is |
|---|---|---|
| `contract/` | P1 | Shared TypeScript types and JSON Schemas. Read first. |
| `solver/` | P1 | The deterministic rules: Yes or No for each question, with the place and the numbers. |
| `viewer/` | P2 | three.js view of the tower, the figures and their routes. |
| `app/` | P3 | App shell: questions, answers, edits, Hint, the typed-edit strip and the review panel. |
| `server/` | P1 | Small local server: typed edits (`/parse`) and votes (`/votes`); keeps keys out of the browser. |
| `design/` | P4 | Colours, icons, motion, words on screen, the demo script. |
| `data/` | P5 | `building.json`, the hand-checked `expected.json`, and the 432 Park package. |
| `docs/` | P1 | Plan, ADRs, agent docs. |
| `.claude/skills/` | P1 | Team skills for coding agents. |

## How we work with agents

Every person codes with an AI agent against one frozen contract. Start with
[AGENTS.md](AGENTS.md): the rules, folder ownership, commands, merge rhythm and the first prompt
for your agent. Team skills are mapped in [docs/agents/skills.md](docs/agents/skills.md).
Decisions are in [docs/adr/](docs/adr/), and terms in [GLOSSARY.md](GLOSSARY.md). The plan is
[docs/plan.md](docs/plan.md).

## Credits

- Figures (wheelchair, rider, people, sofa): Kenney (www.kenney.nl), CC0 1.0
  ([viewer/figures/CREDITS.md](viewer/figures/CREDITS.md)).
- City block: Cityweft. Map data: OpenStreetMap contributors. The block also credits Overture
  Maps Foundation and Meta & WRI canopy heights ([data/README.md](data/README.md)).
- 432 Park Avenue by Rafael Vinoly Architects. Our model follows public sources: ArchEyes, the
  architect's project page, SLCE Architects and STRUCTURE magazine
  ([data/432-park/README.txt](data/432-park/README.txt)).
- three.js (MIT). The optional Strands Decider (Apache-2.0) is not in the repo.

## Licence

MIT. See [LICENSE](LICENSE). The building graph is self-made. No Cityweft data is in this repo
(its licence bars publishing derived geometry); fetch your own block locally.

Built at AEC Tech NYC 2026.
