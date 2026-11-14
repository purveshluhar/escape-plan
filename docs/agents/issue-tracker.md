# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues in
[purveshluhar/escape-plan](https://github.com/purveshluhar/escape-plan/issues). Use the `gh` CLI
for all operations. `gh` infers the repo when run inside a clone.

## One-time setup (P1 runs this once)

Create the labels. Each command is safe to re-run with `--force`.

```sh
gh label create needs-triage    --force --color FBCA04 --description "Maintainer needs to evaluate this issue"
gh label create needs-info      --force --color D4C5F9 --description "Waiting on reporter for more information"
gh label create ready-for-agent --force --color 0E8A16 --description "Fully specified, ready for an AFK agent"
gh label create ready-for-human --force --color 1D76DB --description "Requires human implementation"
gh label create wontfix         --force --color FFFFFF --description "Will not be actioned"
gh label create tier-1          --force --color B60205 --description "Tier 1: must ship"
gh label create tier-2          --force --color D93F0B --description "Tier 2: starts at 17:00 if tier 1 is green"
gh label create tier-3          --force --color FEF2C0 --description "Tier 3: starts at 19:30 if tier 2 is tagged"
```

## Ticket shape

Every task ticket names its **owner folder**, its **tier**, and one **acceptance check** a
person can run (a command, an expected-case id, or a screen to look at). The issue form in
`.github/ISSUE_TEMPLATE/task.yml` asks for all three. The `plan-feature` skill writes tickets
in this shape.

## Conventions

- **Create an issue**: `gh issue create --title "..." --label tier-1 --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with `--label` and `--state` filters.
- **Sub-issue**: `gh issue create --parent <parent> ...` (gh 2.94+). Otherwise put `Part of #<parent>` at the top of the child body.
- **Comment**: `gh issue comment <number> --body "..."`
- **Labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`
- **Link a PR**: put `Closes #<number>` in the PR body.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.
