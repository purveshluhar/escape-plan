# 0002. The deterministic solver decides; Jev only parses edits and votes

Status: accepted (2026-11-14)

## Context

Judges will ask "does AI decide?". An AI pass or fail cannot be repeated or explained, and the
demo must give the same answer every run.

## Decision

- `solver/` alone decides every token's `status`, with the numbers (`needed`, `available`).
  It is deterministic and answers in under 100 ms.
- Jev (TypeSafe AI's typed-decision model) does two things only: turn a sentence into an `Edit`
  (`JevParse`, tier 2), and give one vote bubble per discipline after an edit (`JevVote`, tier 3).
- An answer is accepted only at confidence 0.8 or more; otherwise the app shows "Did you mean"
  and the buttons.
- Plan B (a general LLM with the same typed answers) and plan C (a keyword parser and buttons)
  return the same shapes, so the app does not change when we switch.

## Consequences

A vote never changes a token's colour; the colour always comes from the solver. The demo works
with no AI at all (plan C).
