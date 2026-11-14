# Skills map

Which skill to use for which job. Team skills are in `.claude/skills/<name>/SKILL.md`.
Claude Code loads them by name; any other agent can open the file and follow it.

## By phase

| Phase | Skill | Output |
|---|---|---|
| Plan | `plan-feature` | A short spec and GitHub issues with owner folder, tier and acceptance check |
| Plan | `grill-the-plan` | Answered questions (rounds of at most 4, each with a recommendation) |
| Design | `arcade-look` | A screen that passes the readability checklist |
| Design | `contract-change` | A contract change proposal for P1 |
| Build | `build-with-tests` | Red-first tests, green code, own folder only |
| Build | `solver-token` | One token rule, its expected cases green |
| Review | `review-merge` | A clean hourly merge, or a revert |
| Demo | `demo-and-pitch` | Script, backup recording, Q&A answers |

## By role

| Role | Plan | Design | Build | Review | Demo |
|---|---|---|---|---|---|
| P1 Solver, contract and server | `plan-feature`, `grill-the-plan` | `contract-change` (owner) | `solver-token`, `build-with-tests` | `review-merge` (merges) | `demo-and-pitch` (Q&A: "does AI decide?") |
| P2 Viewer | `plan-feature` | `arcade-look` | `build-with-tests` | `review-merge` | `demo-and-pitch` (backup recording) |
| P3 App and edits | `plan-feature`, `grill-the-plan` | `contract-change` (phones) | `build-with-tests` | `review-merge` | `demo-and-pitch` (run guide) |
| P4 Design and pitch | `grill-the-plan` | `arcade-look` (owner) | `build-with-tests` (design/tokens.ts) | `review-merge` | `demo-and-pitch` (owner) |
| P5 Data and tests | `grill-the-plan` | `contract-change` (data fields) | `build-with-tests` (expected cases) | `review-merge` | `demo-and-pitch` (Q&A) |

## Where knowledge lives

| Need | Read |
|---|---|
| The rules, owners, commands | `AGENTS.md` |
| The formats | `contract/README.md`, `contract/types.ts` |
| A word | `GLOSSARY.md` |
| Why something is the way it is | `docs/adr/` |
| Tiers, times, cut order | `docs/plan.md` |
| Tickets and labels | `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md` |

## Public tools worth installing (optional, each person's own choice)

Links only. Check each licence before copying anything from them into this repo.

- [Matt Pocock's skills](https://github.com/mattpocock/skills): engineering skills that read the `docs/agents/` files in this repo (triage, specs, tickets).
- [Anthropic's public skills](https://github.com/anthropics/skills): example skills and the skill format.
- [GitHub CLI](https://cli.github.com/): `gh`, used by every issue command in `docs/agents/issue-tracker.md`.
- [three.js examples](https://threejs.org/examples/): working code for glow (bloom), lines and cameras.
- [WebAIM contrast checker](https://webaim.org/resources/contrastchecker/): the 4.5:1 check in `arcade-look`.
