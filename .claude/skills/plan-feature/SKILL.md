---
name: plan-feature
description: Turn an idea into a small spec plus GitHub issues, each with an owner folder, a tier and an acceptance check. Use when someone has an idea, a feature request, or a tier item that is not yet a ticket.
---

# Plan a feature

Goal: a spec short enough to read in one minute, and tickets an agent can pick up without
asking anyone.

## Steps

1. Read `AGENTS.md`, `contract/types.ts`, `GLOSSARY.md` and `docs/plan.md`. Find the tier the
   idea belongs to. If it is tier 2 or 3, say which gate it waits for.
2. Write the spec in the issue body (no separate file), in this shape:
   - **Goal**: one sentence a judge would understand.
   - **Demo moment**: what the audience sees when it works.
   - **Inputs and outputs**: the contract types it reads and produces. If a needed field is
     missing, stop and run `contract-change` first.
   - **Out of scope**: what it does not do.
3. If the plan has open questions, run `grill-the-plan` on it before step 4.
4. Split the work into tickets. One ticket = one owner folder = about one hour or less.
   Each ticket has:
   - owner folder and tier (add the label `tier-1`, `tier-2` or `tier-3` by hand: the issue form
     asks for the tier but does not label it);
   - what to build, in glossary terms;
   - one **acceptance check** a person can run: a command, an expected-case id in
     `data/expected.json`, or a screen to look at;
   - "Blocked by #n" when it waits on another ticket.
5. Create the tickets with the commands in `docs/agents/issue-tracker.md`. Label a ticket
   `ready-for-agent` only when an agent could finish it from the ticket text alone; otherwise
   `ready-for-human` or `needs-info`.
6. Post the ticket numbers in the team chat.

## Done when

- Every ticket has an owner folder, a tier label and an acceptance check.
- No ticket spans two folders.
- Any contract change is either approved by P1 or listed as a blocker.
