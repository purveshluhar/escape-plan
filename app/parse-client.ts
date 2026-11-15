// Typed edits: ask the local server (POST /parse, ADR 0008), and fall back to this page's own
// keyword reader (shell.ts parseEdit). Browser code: no node imports. Owner: P3.
//
// Who reads the sentence (Assumption 2026-11-15): the server's answer is used only when it says
// x-decider: strands. Its keyword parser reads loose wording worse than parseEdit ("make the lobby
// door 1.5 metres wide" is widen 0.00 there, widen 0.95 here), so with keywords, or when the server
// is down, slow or refuses, this page reads the sentence itself. The solver decides either way.
import type { Building, EditOp, JevParse, JevParseRequest } from '../contract/types.ts';
import { JEV_ACCEPT_CONFIDENCE } from '../contract/types.ts';
import { placeName } from './scoreboard.ts';
import { parseEdit } from './shell.ts';
import type { ParseOutcome } from './shell.ts';
import type { DemoButton } from './state.ts';

export const PARSE_URL = '/parse'; // same origin; vite.config.ts proxies it to 127.0.0.1
export const PARSE_TIMEOUT_MS = 2500;
export const VALUE_RANGE = { min: 0.5, max: 6 }; // the range parseEdit reads widths in

// Why this reader answered: the server's Strands Decider, or this page because the server runs
// keywords, is down, took too long, gave an answer that cannot be used, or ran Strands but the
// model gave no answer (server/strands.ts answers every confidence 0 when it is down, slow or busy).
export type ReadWhy = 'strands' | 'keywords' | 'down' | 'slow' | 'refused' | 'no-model';

export interface Reading {
  text: string;
  out: ParseOutcome;
  reader: 'strands' | 'local';
  why: ReadWhy;
  decider: string | null; // the x-decider header as sent; null when no answer came
  ms: number;
}

export interface ClientDeps {
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

// The fixes on screen, by target, and the ops they use: the server picks only from these.
export function parseRequest(text: string, fixes: readonly DemoButton[], building: Building): JevParseRequest {
  const targets = new Map<string, string>();
  for (const f of fixes) if (f.edit.target !== null && !targets.has(f.edit.target)) targets.set(f.edit.target, placeName(building, f.edit.target));
  return {
    text,
    ops: [...new Set(fixes.map((f) => f.edit.op))],
    targets: [...targets].map(([id, name]) => ({ id, name })),
    value_range: { ...VALUE_RANGE },
  };
}

const conf = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;

// The server checks its own answer against the schema; this page still trusts only a JevParse whose
// choices come from what it asked.
function usable(x: unknown, req: JevParseRequest): x is JevParse {
  const p = x as JevParse;
  if (typeof p !== 'object' || p === null || typeof p.op !== 'object' || typeof p.target !== 'object' || p.op === null || p.target === null) return false;
  if (!req.ops.includes(p.op.choice as EditOp) || !conf(p.op.confidence)) return false;
  if (!req.targets.some((t) => t.id === p.target.choice) || !conf(p.target.confidence)) return false;
  if (p.value === null) return true;
  return typeof p.value === 'object' && typeof p.value.score === 'number' && Number.isFinite(p.value.score) && conf(p.value.confidence);
}

// A Strands answer as the outcome the strip and "Did you mean" use. It applies only as one of the
// fixes on screen (same op and target), with every part at JEV_ACCEPT_CONFIDENCE or more.
export function outcomeFrom(parse: JevParse, text: string, fixes: readonly DemoButton[]): ParseOutcome {
  const fix = fixes.find((f) => f.edit.op === parse.op.choice && f.edit.target === parse.target.choice);
  const widen = parse.op.choice === 'widen';
  const sure = fix !== undefined && parse.op.confidence >= JEV_ACCEPT_CONFIDENCE && parse.target.confidence >= JEV_ACCEPT_CONFIDENCE
    && (widen ? parse.value !== null && parse.value.confidence >= JEV_ACCEPT_CONFIDENCE : true);
  const first = fixes.filter((f) => f.edit.target === parse.target.choice);
  const suggestions = [...new Set([...first, ...parseEdit(text, fixes).suggestions])].slice(0, 3);
  return {
    parse,
    edit: sure ? { op: parse.op.choice, target: parse.target.choice, value: widen ? parse.value!.score : null, source: 'text' } : null,
    suggestions,
  };
}

export async function readEdit(text: string, fixes: readonly DemoButton[], building: Building, deps: ClientDeps = {}): Promise<Reading> {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? (() => performance.now());
  const started = now();
  const local = (why: ReadWhy, decider: string | null): Reading =>
    ({ text, out: parseEdit(text, fixes), reader: 'local', why, decider, ms: now() - started });
  const req = parseRequest(text, fixes, building);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), deps.timeoutMs ?? PARSE_TIMEOUT_MS);
  try {
    const res = await doFetch(PARSE_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req), signal: ctl.signal,
    });
    const decider = res.headers.get('x-decider');
    // 502, 503 or 504 with no x-decider is the Vite proxy saying it could not reach the server.
    // The server's own errors (400 to 500) are refused.
    if (!res.ok) return decider === null && res.status >= 502 && res.status <= 504 ? local('down', null) : local('refused', decider);
    if (decider !== 'strands') return local(decider === 'keywords' ? 'keywords' : 'refused', decider);
    const body: unknown = await res.json().catch(() => undefined);
    if (ctl.signal.aborted) return local('slow', null);
    if (!usable(body, req)) return local('refused', decider);
    if (body.op.confidence === 0 && body.target.confidence === 0) return local('no-model', decider);
    return { text, out: outcomeFrom(body, text, fixes), reader: 'strands', why: 'strands', decider, ms: now() - started };
  } catch {
    return local(ctl.signal.aborted ? 'slow' : 'down', null);
  } finally {
    clearTimeout(timer);
  }
}
