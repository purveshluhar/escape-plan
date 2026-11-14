# 0001. Record decisions with ADRs

Status: accepted (2026-11-14)

## Context

Five people and their agents build in parallel for ten hours. A decision made in one chat is
invisible to every other agent, so the same question gets re-argued or silently re-decided.

## Decision

Record each decision that is hard to reverse, surprising without context, or a real trade-off
as a short ADR in `docs/adr/NNNN-title.md`: Status, Context, Decision, Consequences. Number them
in order. To change a decision, write a new ADR that supersedes the old one, and mark the old
one `superseded by NNNN`.

## Consequences

Agents read `docs/adr/` before working in an area (`docs/agents/domain.md`). ADRs stay short:
a few lines per section.
