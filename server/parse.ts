// parse(): one function in front of every decider, so the app never changes when we switch.
// DECIDER in .env picks one. Only "keywords" (plan C) is built; Jev and plan B come later and
// add their name here. Owner: P1. Jev only parses; the solver decides pass or fail (ADR 0002).
import type { JevParse, JevParseRequest } from '../contract/types.ts';
import { keywordParse } from './keywords.ts';

export const DECIDERS = { keywords: keywordParse } as const;
export type DeciderName = keyof typeof DECIDERS;
export const DEFAULT_DECIDER: DeciderName = 'keywords';

// Unset or empty means the default. Any other unknown name stops the server at start, so a typo
// never falls back to a decider nobody chose.
export function deciderFromEnv(value: string | undefined): DeciderName {
  if (value === undefined || value === '') return DEFAULT_DECIDER;
  if (Object.hasOwn(DECIDERS, value)) return value as DeciderName;
  throw new Error(`DECIDER=${JSON.stringify(value)} is not built. Use one of: ${Object.keys(DECIDERS).join(', ')}.`);
}

export function parse(request: JevParseRequest, decider: DeciderName = DEFAULT_DECIDER): JevParse {
  return DECIDERS[decider](request);
}
