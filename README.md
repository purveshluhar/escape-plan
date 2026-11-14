# Escape Plan

**Every discipline has to get out, fast.**

## The problem

Every discipline has the same hidden question: can my thing get through the building? The new
chiller in year 15. The 4 m glass panel on delivery day. The wheelchair at the terrace door.
Smoke racing people to the stair. A drain that must cross a beam. A load that needs a path to
the ground. Each trade checks its own path alone and late, and the clash shows up on site.

## What the demo shows

Escape Plan turns the building into a game. One building graph, one token per discipline.
Press **Escape!** and every token races out. The chiller sticks in the plant shaft. The glass
will not turn the corner. The wheelchair hits a step. Widen the shaft, and the chiller reaches
the truck, but the shaft cuts beam B2 and the load turns red. Add a transfer beam, a ramp at the
terrace door, and widen the lobby corner, and everything goes green: **LEVEL COMPLETE**.

A deterministic solver decides every pass or fail and shows the numbers. Jev (TypeSafe AI)
turns typed or spoken edits into actions and gives each discipline a vote bubble. Cityweft can
put the building in its real NYC block as a backdrop. It is a game, not a code check.

## Quickstart

Needs Node 22.18 or later (`.nvmrc`).

```sh
git clone git@github.com:purveshluhar/escape-plan.git
cd escape-plan
npm ci
npm run dev      # http://localhost:5173
npm test         # contract, solver, data schema checks
npm run check    # typecheck + test + build: run before every merge
```

## Folder map

Roles: P1 @purveshluhar, P2 @justinjao, P3 and P4 @minsookim1014 and @jackwayfeel (together, on both roles), P5 @kalunkuo.

| Folder | Owner | What it is |
|---|---|---|
| `contract/` | P1 | Shared TypeScript types and JSON Schemas. Read first. |
| `solver/` | P1 | Deterministic pass or fail per token. |
| `viewer/` | P2 | three.js isometric cutaway and token paths. |
| `app/` | P3 | Game shell: edits, scoreboard, text box, phone controllers. |
| `server/` | P1 | Small local server: keys, Jev and plan B or C calls, votes, phone sockets (tier 2 and 3). |
| `design/` | P4 | Colours, icons, motion, sound, demo script. |
| `data/` | P5 | `building.json` and the hand-checked `expected.json`. |
| `docs/` | P1 | Plan, ADRs, agent docs. |
| `.claude/skills/` | P1 | Team skills for coding agents. |

## How we work with agents

Every person codes with an AI agent against one frozen contract. Start with
[AGENTS.md](AGENTS.md): the rules, folder ownership, commands, merge rhythm and the first prompt
for your agent. Team skills are mapped in [docs/agents/skills.md](docs/agents/skills.md).
Decisions are in [docs/adr/](docs/adr/), and terms in [GLOSSARY.md](GLOSSARY.md).

## Tiers and timeline

[![Tier ladder: tiers, checkpoints and switch times](docs/plan-graph/tier-ladder.png)](docs/plan-graph.html)

The full visual plan (when: tier ladder; how the parts connect; who owns each feature; what the audience sees: demo path) is
[docs/plan-graph.html](docs/plan-graph.html). Open it in a browser; the PNGs are in
[docs/plan-graph/](docs/plan-graph/).

- **Tier 1 (must ship):** chiller, glass, wheelchair and load; live re-solve; the
  shaft-breaks-beam moment; the 3D cutaway. Tag `tier1-demo` at 17:00.
- **Tier 2:** people and smoke race, Jev parsing, Cityweft backdrop, sound, water. Tag `tier2-demo` at 19:30.
- **Tier 3:** Jev votes, phone controllers, electrical, voice, post-game report.
- Feature freeze 21:00. Full plan: [docs/plan.md](docs/plan.md).

## Licence

MIT. See [LICENSE](LICENSE). All building data is self-made. No Cityweft data is in this repo
(its licence bars publishing derived geometry); plug in your own context locally.

Built at AEC Tech NYC 2026.
