// The first MVP experience: the wheelchair, the sofa and people, plus the owner's chiller and the
// structure (load) that the chiller's shaft puts at risk, and the manager's smoke question. All in data/building.json with their
// cases in data/expected.json. Owner: P3.
import type { Building, Id } from '../contract/types.ts';
import { solve } from '../solver/index.ts';
import { raceButtons } from './smoke.ts';
import type { DemoButton } from './state.ts';

// Placeable in this order (keys 1 to 6); the dock offers no other token.
export const MVP_TOKENS: readonly Id[] = ['wheelchair', 'sofa', 'people', 'chiller', 'load', 'smoke'];

// The fix buttons for the MVP: the demo buttons that open a door an MVP token is stuck at, and the
// two that belong to the owner's story whatever is stuck now. Those are every edge that crosses a
// member (the shaft: widening it can break a beam) and every member (a transfer beam fixes it). The
// load passes as built, so nothing is stuck at the beam until the shaft is widened.
export function mvpButtons(building: Building, demo: readonly DemoButton[]): DemoButton[] {
  const keep = new Set(solve(building)
    .filter((r) => MVP_TOKENS.includes(r.token) && r.blocked_at !== null)
    .map((r) => r.blocked_at!));
  for (const e of building.edges) if (e.crosses && e.crosses.length > 0) keep.add(e.id);
  for (const m of building.members) keep.add(m.id);
  for (const b of raceButtons(demo)) if (b.edit.target !== null) keep.add(b.edit.target); // close the door that lets the smoke in
  return demo.filter((b) => b.edit.target !== null && keep.has(b.edit.target));
}
