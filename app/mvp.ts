// The first MVP game: the wheelchair, the sofa and people, all three in data/building.json with
// their cases in data/expected.json. Owner: P3.
import type { Building, Id } from '../contract/types.ts';
import { solve } from '../solver/index.ts';
import type { DemoButton } from './state.ts';

// Placeable in this order (keys 1, 2, 3); the dock offers no other token.
export const MVP_TOKENS: readonly Id[] = ['wheelchair', 'sofa', 'people'];

// The fix buttons for the MVP game: the demo buttons that open a door an MVP token is stuck at.
export function mvpButtons(building: Building, demo: readonly DemoButton[]): DemoButton[] {
  const stuck = new Set(solve(building)
    .filter((r) => MVP_TOKENS.includes(r.token) && r.blocked_at !== null)
    .map((r) => r.blocked_at!));
  return demo.filter((b) => b.edit.target !== null && stuck.has(b.edit.target));
}
