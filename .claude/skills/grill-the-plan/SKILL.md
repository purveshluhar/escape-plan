---
name: grill-the-plan
description: Stress-test a plan, spec or design with hard questions before anyone builds it. Use when a plan is written but not started, when two people disagree, or when someone says "grill this".
---

# Grill the plan

Goal: find the decisions that will hurt at 17:00, while they are still cheap to change.

## Steps

1. Read the plan, then `AGENTS.md`, `contract/`, `docs/adr/` and `docs/plan.md`.
2. List every open decision you can find. Look hardest at:
   - the demo moment: will it read on a projector in five seconds?
   - the contract: does it need a field that is not in `contract/types.ts`?
   - the truth: which expected case in `data/expected.json` proves it works?
   - time: does it fit before its checkpoint? What is the switch or fallback if it does not?
   - the house rules: solver decides, a game not a code check, no Cityweft files, no secrets.
3. Ask in rounds of **at most 4 questions**. For each question give:
   - the question, in one sentence;
   - your **recommended answer** and the one-line reason;
   - what changes if they pick something else.
4. Wait for answers. Record each answer in the plan or issue as you go.
5. Repeat until no open decision changes what gets built, or three rounds are done.
   Then list what is still open, each with the default you will build to.
6. If an answer is hard to reverse or surprising, write an ADR in `docs/adr/`
   (copy the shape of `0001`), or ask P1 to.

## Done when

- Every question has an answer or a stated default.
- Each answer is written into the plan or issue, not left in chat.
- Any contract change it needs has gone to `contract-change`.
