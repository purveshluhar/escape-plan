---
name: review-merge
description: Checks to run before a merge to main, by the author and by P1. Use before every merge, before a tag, or when deciding whether to revert.
---

# Review before merge

`main` must always run the tier 1 demo. A merge that breaks it is reverted, not fixed forward.

## Steps (author, before asking P1)

1. `git fetch` and rebase your branch on the latest `main`.
2. `git diff --stat origin/main...HEAD`. Every file is in your own folder. Anything else:
   move it out, or get the owner's OK.
3. `contract/` is unchanged, or the change was approved by P1 (`contract-change`).
4. `data/expected.json` values are unchanged, unless you are P5 and checked them by hand.
5. Run `npm ci` if `package.json` changed, then `npm run check` (typecheck, test, build). It passes.
6. Run `npm run dev`, press **Escape!**, and walk the demo path. It still works.
7. Search the diff for secrets and big files: no keys, no `.env`, no `*.glb`, no `*.3dm`, no
   Cityweft export, nothing over 5 MB.
8. Commit messages are Conventional Commits in plain ASCII.
9. Push your branch (`p<N>/<topic>`) and open a PR to `main` with the PR template filled in.
   Tell P1 the PR number and the acceptance check you ran.

## Steps (P1, at the merge point)

1. Merge the PRs one at a time, smallest first, after CI is green. Run `npm run check` on `main` after each.
2. If one breaks the build or the demo, take it out and hand it back with the failing output.
3. Push `main` only when `npm run check` is green and the demo runs.
4. At a tag gate in `docs/plan.md`, tag the green `main`: `git tag tier1-demo` at the MVP gate,
   or `git tag tier2-demo` when tier 2 is done. Then `git push origin <tag>`. To re-tag
   `tier1-demo` when all of tier 1 is green, use `git tag -f tier1-demo` and
   `git push -f origin tier1-demo`. Tell the team to run `git fetch --tags --force`, because a
   plain `git fetch` keeps the old tag.

## Done when

- `main` is green in CI, the demo runs, and the merged branches are listed in chat.
