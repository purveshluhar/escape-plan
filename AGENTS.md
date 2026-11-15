# AGENTS.md - Escape Plan

Escape Plan answers the questions people ask about a building, in the browser, from one
building graph. Ask your building: can my sofa get in, can my parent's wheelchair get out?
Each question is about one thing that must get through (wheelchair, sofa, people, chiller, glass
panel, load; later smoke, water, power). In code that thing is a token. Every edit checks every
answer again, live. A deterministic solver decides each Yes or No. It is a quick check of sizes
and routes, not a code review.

This file is the one source of truth for every coding agent (Claude Code reads it via `CLAUDE.md`).

## Rules

1. Read `contract/` first (`contract/README.md`, then `contract/types.ts`). Build against those types.
2. Do not change `contract/`. P1 owns it. Changes happen only at a merge point. To ask for one, use the `contract-change` skill.
3. Edit only your own folder (table below). Read other folders, and import from them, but leave their files alone.
4. Run `npm run check` (typecheck, test, build) before every merge. It must pass. `npm test` alone
   does not check types. `main` must always run the tier 1 demo.
5. `data/expected.json` is the truth. When a test fails against it, the code is wrong until a human proves the expected case wrong. Never change an expected value to make code pass.
6. No secrets in code. Keys go in a git-ignored `.env` only, never with a `VITE_` prefix (Vite
   ships those to the browser). Calls that need a key go through a local server (ADR 0008).
7. No Cityweft files in the repo. They live in git-ignored `private-context/` or `data/cityweft/`. Screenshots in the deck are fine.
8. All building data is self-made and synthetic.
9. Work on a branch `p<N>/<topic>` (for example `p2/token-paths`), push it, and open a PR to
   `main`. P1 merges PRs in small, frequent merges. Only P1 commits to `main`. Never push a
   broken `main`.
10. Commit messages: Conventional Commits, plain ASCII (for example `feat(solver): add chiller clearance rule`).
11. New dependencies need P1's OK first. Name the package and why.

## Folder ownership

| Role | Person | Folder | Tier 1 job |
|---|---|---|---|
| P1 Graph and solver lead | @purveshluhar | `contract/`, `solver/`, `server/` | Contract; MVP first: wheelchair, sofa and people walk out; then chiller, glass, load rules; re-solve; tests (later: the local server in `server/` with Jev parse, plan B and C, Jev votes and the phone sockets) |
| P2 3D and animation | @justinjao | `viewer/` | Isometric cutaway; token paths; red X and the Yes to all banner |
| P3 Front-end and edits | @minsookim1014, @jackwayfeel | `app/`, `index.html` | Edit buttons, Undo edits, the Answers panel, app state |
| P4 Designer and presenter | @minsookim1014, @jackwayfeel | `design/` | Icons, colours, path style, demo script |
| P5 Domain modeller and tester | @kalunkuo | `data/` | `data/building.json`; `data/expected.json` for the 4 tokens, plus the sofa and people tokens and their expected cases |

@minsookim1014 and @jackwayfeel share P3 and P4 and work on both roles together.
Shared files outside these folders (root config, `docs/`, `.github/`, `.claude/`) belong to P1.
Each folder's `README.md` says what it consumes and produces.

## Commands

| Command | What it does |
|---|---|
| `npm ci` | Install exact versions from `package-lock.json`. |
| `npm run dev` | Start the app at http://localhost:5173. |
| `npm run server` | Start the local server on 127.0.0.1 (`server/README.md`). It reads the git-ignored `.env`. |
| `npm test` | Node's built-in test runner: contract, solver, data schema checks, and every `*.test.ts`. |
| `npm run check` | Typecheck, test and build: the gate before every merge (CI runs it too). |
| `npm run typecheck` | `tsc --noEmit` over all source, test files included. |
| `npm run build` | Production build into `dist/`. |

Tests are `<folder>/*.test.ts`, run by `node --test` (Node 22.18+ runs TypeScript directly).
Import local files with the `.ts` extension, and use `import type` for types.
`viewer/`, `app/` and `design/` run in the browser: no `node:*` imports, `process` or `Buffer`
there. Typecheck loads Node types for the tests, so it does not catch this. `server/` runs in
Node only; browser code never imports it.

## Merge and tag rhythm

- Small, frequent merges: push your branch with `npm run check` green, open a PR, and P1 merges
  the PRs to `main` (about 10 minutes each).
- Before a merge, run the `review-merge` skill.
- Tags give known-good demo points: `tier1-demo` at the MVP gate (re-tagged when all of tier 1 is
  green), `tier2-demo` when tier 2 is done.
- If a merge breaks the tier 1 demo, revert it and demo from the last tag.
- Tier 2 starts when all of tier 1 is green. Tier 3 starts when tier 2 is tagged.
- Tiers, gates and switch conditions: `docs/plan.md`.

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
| `review-merge` | Before a merge to `main`. |
| `demo-and-pitch` | Demo script, backup recording, judge Q&A. |

Decisions are in `docs/adr/`. Words are in `GLOSSARY.md`. Use the glossary's terms.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `purveshluhar/escape-plan`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
