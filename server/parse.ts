// parse(): one function in front of every decider, so the app never changes when we switch.
// DECIDER in .env picks one: "keywords" (plan C, the default) or "strands" (a local Strands
// Decider for op and target). Jev and plan B come later and add their name here. Owner: P1.
// Jev only parses; the solver decides pass or fail (ADR 0002).
import type { JevParse, JevParseRequest } from '../contract/types.ts';
import { keywordParse } from './keywords.ts';
import { strandsParse } from './strands.ts';
import type { StrandsConfig } from './strands.ts';

export const DECIDER_NAMES = ['keywords', 'strands'] as const;
export type DeciderName = (typeof DECIDER_NAMES)[number];
export const DEFAULT_DECIDER: DeciderName = 'keywords';

// What parse() needs from the server config. `strands` is read only when decider is "strands".
export interface DeciderConfig {
  decider: DeciderName;
  strands?: StrandsConfig;
}

// Unset or empty means the default. Any other unknown name stops the server at start, so a typo
// never falls back to a decider nobody chose.
export function deciderFromEnv(value: string | undefined): DeciderName {
  if (value === undefined || value === '') return DEFAULT_DECIDER;
  if ((DECIDER_NAMES as readonly string[]).includes(value)) return value as DeciderName;
  throw new Error(`DECIDER=${JSON.stringify(value)} is not built. Use one of: ${DECIDER_NAMES.join(', ')}.`);
}

export async function parse(request: JevParseRequest, config: DeciderConfig = { decider: DEFAULT_DECIDER }): Promise<JevParse> {
  if (config.decider === 'strands') {
    if (config.strands === undefined) throw new Error('DECIDER=strands needs a Strands config');
    return strandsParse(request, config.strands);
  }
  return keywordParse(request);
}
