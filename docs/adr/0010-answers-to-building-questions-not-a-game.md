# 0010. Answers to people's building questions, not a game

Status: accepted (2026-11-15). Supersedes 0007.

## Context

0007 framed Escape Plan as a game: tokens raced out, and the goal was LEVEL COMPLETE. The people
who use it are home buyers, families, building owners and building managers. Each of them has a
real question about a real building. Game words make their question look like a toy, and they
hide who is asking. The project owner set the rule on 2026-11-15: never a game.

## Decision

- Escape Plan is an immersive experience that answers people's questions about their building.
  It is never a game.
- Each scenario opens as one person's question: can my sofa get in, can my parent's wheelchair
  get out, does widening this shaft break a beam, do people beat the smoke.
- The screens, copy, docs, demo script, deck and video use no game terms: no level complete,
  score, win, player, play, race or token. `design/copy.md` holds the words on screen.
- The answer is Yes or No, with the place and the numbers. The button is Show me, the list is
  the Answers panel, and the all-yes banner is Yes to all.
- We never claim code compliance. The Answers panel says "A quick check of sizes and routes, not
  a code review." The README and the pitch say the same.
- Code identifiers stay as they are (`token`, `escape()`, phase `complete`, `levelComplete`,
  `SCORE`). Only words that people read change.

## Consequences

Rule names stay plain (`clearance`, `no_steps`), not code clause numbers. People and smoke is a
timed check of who gets there first, not an egress analysis. The code keeps some game-like
names, so docs that name them put them in backticks.
