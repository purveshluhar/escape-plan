# 0007. A game, not a code check

Status: accepted (2026-11-14)

## Context

Rules like "clear width" and "no steps" sound like a building code checker. Code compliance is
a different product, needs certified rules, and invites the wrong questions.

## Decision

Escape Plan is a game. Tokens race out; edits fix one path and break another; the goal is
LEVEL COMPLETE. The rules are simple geometric checks that show path clashes early, so the right
expert looks. We never claim compliance, and the UI, README and pitch say "a game, not a code
check".

## Consequences

Rule names stay plain (`clearance`, `no_steps`), not code clause numbers. People-and-smoke is a
race, not an egress analysis.
