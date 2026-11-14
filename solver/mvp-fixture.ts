// TEST FIXTURE until P5 adds the sofa and people tokens and their cases to data/ (P5 owns data/).
// Used by mvp-resolve.test.ts (P1-07) and level-complete.test.ts (P1-19). Delete it, and point
// both files at data/building.json, once P5's tokens and cases land.
//
// The real building plus the two MVP tokens. The sofa takes the P1-03 numbers: 0.9 m wide,
// 2.2 m long, from the lobby. data/building.json has no edge a person cannot pass and no edit
// that changes a person's result, so the people fixture adds one narrow door: `fixture-office-door`,
// 0.5 m, from a ground-floor office to the corridor. The fixture tokens replace any `sofa` or
// `people` token in data/, so P5's tokens do not shadow them; P5's own cases run in solver.test.ts.
import type { Building, Edit, Token } from '../contract/types.ts';

export const FIXTURE_SOFA: Token = {
  id: 'sofa', discipline: 'logistics', start: 'lobby', goal: null,
  size: { width: 0.9, height: 1.0, length: 2.2 }, rule: 'corner_turn',
};
export const FIXTURE_PEOPLE: Token = {
  id: 'people', discipline: 'life_safety', start: 'fixture-office', goal: null,
  size: { width: 0.6, height: 2.0, length: 0.6 }, rule: 'shortest_exit',
};

// The one edit that lets people out of the fixture office.
export const WIDEN_FIXTURE_OFFICE_DOOR: Edit = { op: 'widen', target: 'fixture-office-door', value: 0.9, source: 'button' };

// A new building: `base` plus the fixture office, its door, the sofa and people. `base` is not changed.
export function withMvpFixture(base: Building): Building {
  return {
    ...structuredClone(base),
    nodes: [
      ...structuredClone(base.nodes),
      { id: 'fixture-office', name: 'Office', level: 'L1', type: 'room', box: { x: 0, y: 8.4, width: 6, depth: 12 }, is_exit: false },
    ],
    edges: [
      ...structuredClone(base.edges),
      { id: 'fixture-office-door', name: 'Office door', from: 'fixture-office', to: 'corridor', kind: 'door', clear_width: 0.5, clear_height: 2.1, step_height: 0 },
    ],
    tokens: [
      ...structuredClone(base.tokens.filter((t) => t.id !== FIXTURE_SOFA.id && t.id !== FIXTURE_PEOPLE.id)),
      structuredClone(FIXTURE_SOFA), structuredClone(FIXTURE_PEOPLE),
    ],
  };
}
