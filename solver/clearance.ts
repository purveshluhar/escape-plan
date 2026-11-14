// Rule `clearance` (chiller): contract/README.md, "Rule details". The token fits through each
// edge by width and height, and fits any elevator car it enters (the core's car check). It may
// ride a shaft. Steps, stairs and corners do not block it.
import { heightCheck, widthCheck } from './search.ts';
import type { WalkRule } from './search.ts';

export const CLEARANCE: WalkRule = {
  kinds: ['door', 'opening', 'ramp', 'step', 'stair', 'elevator', 'shaft'],
  checks: [widthCheck, heightCheck],
};
