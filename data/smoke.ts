// The smoke for the question "do people get out before the smoke?". Smoke starts in the lobby and
// spreads one open edge per time step (rule `spread`, contract/README.md). It is not in
// data/building.json: with smoke always there, people lose to it at the corridor in every case, and the
// hand-checked "people get out" cases would turn to No. A question that asks about the smoke adds it
// to the building (`withSmoke`), and the expected cases whose id starts with `smoke-` are replayed
// on that building (`caseBuilding`). Owner: P1 (the people-and-smoke task).
import type { Building, ExpectedCase, Token } from '../contract/types.ts';

export const SMOKE_ID = 'smoke';
export const SMOKE_START = 'lobby';
// The door the building manager closes to keep the smoke out of the corridor (probe-checked).
export const SMOKE_FIX_EDGE = 'lobby-door';
export const SMOKE_CASE_PREFIX = 'smoke-';

export const SMOKE: Token = {
  id: SMOKE_ID, discipline: 'fire', start: SMOKE_START, goal: null,
  size: { width: 0, height: 0, length: 0 }, rule: 'spread',
};

// The building with the smoke in it. Smoke already there (a second call) leaves it as it is. A new
// object; the input is not changed.
export function withSmoke(building: Building): Building {
  if (building.tokens.some((t) => t.id === SMOKE_ID)) return building;
  return { ...building, tokens: [...building.tokens, SMOKE] };
}

// The building an expected case is replayed on: with smoke for a `smoke-` case, as built otherwise.
export function caseBuilding(building: Building, c: Pick<ExpectedCase, 'id'>): Building {
  return c.id.startsWith(SMOKE_CASE_PREFIX) ? withSmoke(building) : building;
}
