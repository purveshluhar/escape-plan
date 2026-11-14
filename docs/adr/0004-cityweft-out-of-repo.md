# 0004. Cityweft geometry stays out of the repo

Status: accepted (2026-11-14)

## Context

The repo is public and MIT. Cityweft's end-user licence bars publishing derived geometry
([EULA](https://cityweft.com/legal/end-user-license)).

## Decision

- No Cityweft file (GLB, 3DM or any export) is committed. They live in git-ignored
  `private-context/` or `data/cityweft/`. `.gitignore` also blocks `*.glb` and `*.3dm` everywhere.
- Any key goes in a git-ignored `.env`.
- The street and truck nodes are hand-placed in our own `data/building.json`.
- Screenshots in the deck are fine.
- Fallback: a plain ground plane with a hand-modelled curb and truck.

## Consequences

A fresh clone shows the plain ground plane. The backdrop loads only on a machine that has the
file locally. If we need a GLB of our own, P1 adds a narrow `.gitignore` exception for it.
