// Rule `corner_turn` (sofa, glass): contract/README.md, "Rule details". At an edge with both
// `corner_a` and `corner_b` set, the token turns the 90-degree corner only if its length fits.
// Width and height apply as for every walking rule. Steps do not block this rule.
import { heightCheck, widthCheck } from './search.ts';
import type { EdgeCheck, WalkRule } from './search.ts';

// sin t and cos t for t = 0.1, 0.2, ..., 89.9 degrees: the open interval (0, 90) in 0.1 degree steps.
const ANGLES = Array.from({ length: 899 }, (_, i) => {
  const t = ((i + 1) / 10) * (Math.PI / 180);
  return { sin: Math.sin(t), cos: Math.cos(t) };
});

// The longest token of width w that turns from a corridor a wide into one b wide:
// min over t of a / cos t + b / sin t - w / (sin t * cos t). With w = 0 this is
// (a^(2/3) + b^(2/3))^(3/2). A token wider than a leg makes the true minimum negative, so
// L_max is 0 then. The width test comes first: just past a leg's width the 0.1 degree samples
// stay above 0 and would let a short token through.
export function lMax(a: number, b: number, w: number): number {
  if (w > Math.min(a, b)) return 0;
  let min = Infinity;
  for (const { sin, cos } of ANGLES) min = Math.min(min, a / cos + b / sin - w / (sin * cos));
  return Math.max(0, min);
}

export const cornerCheck: EdgeCheck = (edge, token) => {
  // Not set (absent, or null in hand-written JSON): no corner at this edge.
  if (typeof edge.corner_a !== 'number' || typeof edge.corner_b !== 'number') return null;
  const available = lMax(edge.corner_a, edge.corner_b, token.size.width);
  return token.size.length <= available
    ? null
    : { at: edge.id, reason: 'cannot_turn', needed: token.size.length, available };
};

export const CORNER_TURN: WalkRule = {
  kinds: ['door', 'opening', 'ramp', 'step', 'stair', 'elevator'],
  checks: [widthCheck, heightCheck, cornerCheck],
};
