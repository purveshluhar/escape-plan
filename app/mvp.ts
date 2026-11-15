// The first MVP game: the wheelchair, the sofa and people. Owner: P3.
// data/building.json has only the wheelchair so far, so the sofa, people, and the office people
// start in come from the solver's MVP fixture (solver/mvp-fixture.ts), the same ones its tests use.
// When P5 adds sofa and people to data/, drop the fixture here and play data/building.json as is.
import type { Building, Id } from '../contract/types.ts';
import { solve } from '../solver/index.ts';
import { WIDEN_FIXTURE_OFFICE_DOOR, withMvpFixture } from '../solver/mvp-fixture.ts';
import { editLabel } from './state.ts';
import type { DemoButton } from './state.ts';

// Placeable in this order (keys 1, 2, 3); the dock offers no other token.
export const MVP_TOKENS: readonly Id[] = ['wheelchair', 'sofa', 'people'];

export function mvpBuilding(base: Building): Building {
  return withMvpFixture(base);
}

// The fix buttons for the MVP game: the demo buttons that open a door an MVP token is stuck at,
// plus widening the fixture office door for people (expected.json has no people case yet).
export function mvpButtons(building: Building, demo: readonly DemoButton[]): DemoButton[] {
  const stuck = new Set(solve(building)
    .filter((r) => MVP_TOKENS.includes(r.token) && r.blocked_at !== null)
    .map((r) => r.blocked_at!));
  const office = WIDEN_FIXTURE_OFFICE_DOOR;
  const own: DemoButton = {
    id: `edit-${office.op}-${office.target}`, label: editLabel(building, office), edit: { ...office, source: 'button' },
  };
  return [...demo.filter((b) => b.edit.target !== null && stuck.has(b.edit.target)), ...(stuck.has(office.target!) ? [own] : [])];
}
