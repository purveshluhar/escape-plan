# AGENTS.md - Escape Plan

Escape Plan is a browser game built on one building graph. Each discipline plays a token (chiller,
glass panel, wheelchair, load; later people, smoke, water, power) that must escape the building.
Every edit re-solves every token live. A deterministic solver decides pass or fail. It is a game,
not a code check.

This file is the one source of truth for every coding agent (Claude Code reads it via `CLAUDE.md`).

## Rules

1. Read `contract/` first (`contract/README.md`, then `contract/types.ts`). Build against those types.
2. Do not change `contract/`. P1 owns it. Changes happen only at a merge point. To ask for one, use the `contract-change` skill.
3. Edit only your own folder (table below). Read other folders, and import from them, but leave their files alone.
4. Run `npm test` before every merge. It must pass. `main` must always run the tier 1 demo.
5. `data/expected.json` is the truth. When a test fails against it, the code is wrong until a human proves the expected case wrong. Never change an expected value to make code pass.
6. No secrets in code. Keys go in a git-ignored `.env` only.
7. No Cityweft files in the repo. They live in git-ignored `private-context/` or `data/cityweft/`. Screenshots in the deck are fine.
8. All building data is self-made and synthetic.
9. Merge small, every hour, through P1. Never push a broken `main`.
10. Commit messages: Conventional Commits, plain ASCII (for example `feat(solver): add chiller clearance rule`).
11. New dependencies need P1's OK first. Name the package and why.

## Folder ownership

| Role | Person | Folder | Tier 1 job |
|---|---|---|---|
| P1 Graph and solver lead | purveshluhar | `contract/`, `solver/` | Contract; chiller, glass, wheelchair, load rules; re-solve; tests |
| P2 3D and animation | P2 | `viewer/` | Isometric cutaway; token paths; red X and LEVEL COMPLETE |
| P3 Front-end, edits and AI | P3 | `app/` | Edit buttons, reset, scoreboard, app state |
| P4 Designer and presenter | P4 | `design/` | Icons, colours, path style, demo script |
| P5 Domain modeller and tester | P5 | `data/` | `data/building.json`; `data/expected.json` for the 4 tier 1 tokens |

Shared files outside these folders (root config, `docs/`, `.github/`, `.claude/`) belong to P1.
Each folder's `README.md` says what it consumes and produces.

## Commands

| Command | What it does |
|---|---|
| `npm ci` | Install exact versions from `package-lock.json`. |
| `npm run dev` | Start the game at http://localhost:5173. |
| `npm test` | Node's built-in test runner: contract, solver, data schema checks, and every `*.test.ts`. |
| `npm run typecheck` | `tsc --noEmit` over all source (test files are not type-checked). |
| `npm run build` | Production build into `dist/`. |

Tests are `<folder>/*.test.ts`, run by `node --test` (Node 22.18+ runs TypeScript directly).
Import local files with the `.ts` extension, and use `import type` for types.

## Merge and tag rhythm

- Every hour, on the hour: commit in your folder, run `npm test`, then P1 merges to `main` (about 10 minutes).
- Before a merge, run the `review-merge` skill.
- Tags give known-good demo points: `tier1-demo` at 17:00, `tier2-demo` at 19:30.
- If a merge breaks the tier 1 demo, revert it and demo from the last tag.
- Tiers, checkpoints and switch times: `docs/plan.md`.

## First prompt for your agent

Paste this, with your folder:

> Read `AGENTS.md` and `contract/`. Build only in `<your folder>` against those types.
> Write tests against `data/expected.json` where relevant. Start with the tier 1 task in
> `<your folder>/README.md`.

## Skills

Team skills live in `.claude/skills/<name>/SKILL.md`. Claude Code loads them by name. Other
agents: open the file when its trigger fits. The map of which skill to use for which job, per
role, is `docs/agents/skills.md`.

| Skill | Use it when |
|---|---|
| `plan-feature` | An idea needs a small spec and GitHub issues. |
| `grill-the-plan` | A plan or spec needs hard questions before anyone builds. |
| `contract-change` | You need a field or format in `contract/` that is not there. |
| `build-with-tests` | You write or change code: red test first, against `data/expected.json`. |
| `solver-token` | P1 adds a token rule to the solver. |
| `arcade-look` | You build or judge anything on screen: colour, glow, camera, motion, sound. |
| `review-merge` | Before an hourly merge. |
| `demo-and-pitch` | Demo script, backup recording, judge Q&A. |

Decisions are in `docs/adr/`. Words are in `GLOSSARY.md`. Use the glossary's terms.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `purveshluhar/escape-plan`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
