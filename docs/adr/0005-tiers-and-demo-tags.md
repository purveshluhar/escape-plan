# 0005. Build in tiers, with go/no-go times and demo tags

Status: accepted (2026-11-14)

## Context

Full scope in ten hours is possible only in tiers, and not certain. A late merge can break a
working demo.

## Decision

- Tier 1 must ship: the graph; chiller, glass, wheelchair and load; live re-solve; the
  shaft-breaks-beam moment; the 3D cutaway (or 2D plans after 15:30).
- Tier 2 starts at 17:00 only if tier 1 is green. Tier 3 starts at 19:30 only if tier 2 is tagged.
- Tag `tier1-demo` at 17:00 and `tier2-demo` at 19:30.
- Switch times: Jev 13:00 (no key) and 17:30 (slower than 2 s); Cityweft 14:00; 3D 15:30;
  phones 19:30 (wifi blocks local sockets).
- Feature freeze at 21:00.

## Consequences

If a merge breaks tier 1, revert it and demo from the last tag. The pitch is planned around
tier 1. Details: `docs/plan.md`.
