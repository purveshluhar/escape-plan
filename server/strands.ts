// DECIDER=strands: a local Strands Decider (`strands-decider serve`) answers op and target. Owner: P1.
// The limits come from the decider spike, and each one is a rule here:
// - Strands answers op and target only. The plan C number parser reads the value, with its
//   0-5 m range check (keywordValue), because a model score was right 1 time in 5.
// - Reset skips the target check: Strands gives a reset target 0.32-0.46.
// - Only the on-screen targets go to the model. 14 worked; 156 gave no answer over 0.8 and 255
//   did not fit. Over STRANDS_MAX_TARGETS the model is not asked.
// - When Strands is down, slow or answers something unusable, parse() answers at confidence 0,
//   so the app shows "Did you mean". It never switches to another parser silently.
// The Strands server must be on this machine: STRANDS_URL accepts only http://127.0.0.1.
import type { EditOp, JevParse, JevParseRequest } from '../contract/types.ts';
import { keywordValue } from './keywords.ts';

export const DEFAULT_STRANDS_URL = 'http://127.0.0.1:8000'; // `strands-decider serve` default port
export const DEFAULT_STRANDS_TIMEOUT_MS = 5000;
export const MAX_STRANDS_TIMEOUT_MS = 60_000;
export const STRANDS_MAX_TARGETS = 50;
const MAX_ANSWER_BYTES = 64 * 1024; // a real answer for 50 targets is a few KiB

export interface StrandsConfig {
  url: string; // origin only, for example http://127.0.0.1:8000
  timeoutMs: number;
}

// One line per op, from the contract edit table. The spike measured this wording.
const OP_TEXT: Record<EditOp, string> = {
  widen: 'make a door, shaft or opening wider, to a width in metres',
  add_transfer_beam: 'turn a beam or column into a transfer beam',
  add_ramp: 'replace a step with a ramp',
  close_door: 'close a door so smoke cannot pass',
  add_sleeve: 'add a sleeve so a drain can pass through',
  reset: 'undo every edit and go back to the start',
};

// Reads STRANDS_URL and STRANDS_TIMEOUT_MS. Empty means "not set". A URL that is not plain
// http on 127.0.0.1 is refused, so a typed sentence never leaves this machine.
export function strandsConfigFromEnv(env: Record<string, string | undefined>): StrandsConfig {
  const rawUrl = env.STRANDS_URL ?? '';
  let url = DEFAULT_STRANDS_URL;
  if (rawUrl !== '') {
    const refuse = (why: string) => new Error(`STRANDS_URL=${JSON.stringify(rawUrl)} refused: ${why}. Use http://127.0.0.1:<port>.`);
    let u: URL;
    try {
      u = new URL(rawUrl);
    } catch {
      throw refuse('not a URL');
    }
    if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1') throw refuse('the Strands server must be http on 127.0.0.1');
    if (u.username !== '' || u.password !== '' || u.pathname !== '/' || u.search !== '' || u.hash !== '') {
      throw refuse('give the origin only, with no user, path, query or fragment');
    }
    url = u.origin;
  }
  const rawTimeout = env.STRANDS_TIMEOUT_MS ?? '';
  let timeoutMs = DEFAULT_STRANDS_TIMEOUT_MS;
  if (rawTimeout !== '') {
    if (!/^\d{1,6}$/.test(rawTimeout) || Number(rawTimeout) < 1 || Number(rawTimeout) > MAX_STRANDS_TIMEOUT_MS) {
      throw new Error(`STRANDS_TIMEOUT_MS=${JSON.stringify(rawTimeout)} refused: use a whole number from 1 to ${MAX_STRANDS_TIMEOUT_MS}.`);
    }
    timeoutMs = Number(rawTimeout);
  }
  return { url, timeoutMs };
}

// A JevParse nobody accepts: every confidence 0, so the app shows "Did you mean" and the buttons.
// The value is still read from the sentence, so "Did you mean" can offer the typed width.
function unsure(request: JevParseRequest, why: string): JevParse {
  console.error(`strands decider: ${why}; answering at confidence 0`);
  const op = request.ops.find((o) => o !== 'reset') ?? request.ops[0]!;
  return {
    op: { choice: op, confidence: 0 },
    target: { choice: request.targets[0]!.id, confidence: 0 },
    value: op === 'widen' ? keywordValue(request) : null,
  };
}

// The answer body as text, or null when it passed MAX_ANSWER_BYTES.
async function readCapped(res: Response): Promise<string | null> {
  if (res.body === null) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const c of res.body) {
    size += c.byteLength;
    if (size > MAX_ANSWER_BYTES) return null;
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const isConfidence = (x: unknown): x is number => typeof x === 'number' && x >= 0 && x <= 1;

// One answer as { choice, confidence }, or null unless the choice is one of `allowed`.
function readChoice(answers: unknown, key: string, allowed: readonly string[]): { choice: string; confidence: number } | null {
  if (typeof answers !== 'object' || answers === null || !Object.hasOwn(answers, key)) return null;
  const a = (answers as Record<string, unknown>)[key];
  if (typeof a !== 'object' || a === null) return null;
  const { choice, confidence } = a as Record<string, unknown>;
  if (typeof choice !== 'string' || !allowed.includes(choice) || !isConfidence(confidence)) return null;
  return { choice, confidence };
}

export async function strandsParse(request: JevParseRequest, config: StrandsConfig): Promise<JevParse> {
  if (request.ops.length === 0 || request.targets.length === 0) throw new Error('strandsParse needs at least one op and one target');
  if (request.targets.length > STRANDS_MAX_TARGETS) {
    return unsure(request, `${request.targets.length} targets is over ${STRANDS_MAX_TARGETS}; send only the targets on screen`);
  }
  const body = {
    state: `A player typed this edit command in a building game: "${request.text}"`,
    questions: {
      op: { type: 'choice', instructions: 'Which edit does the player ask for?', criteria: Object.fromEntries(request.ops.map((o) => [o, OP_TEXT[o]])) },
      // fromEntries makes own keys, so an id such as "__proto__" stays a choice.
      target: { type: 'choice', instructions: 'Which object on screen does the player mean?', criteria: Object.fromEntries(request.targets.map((t) => [t.id, t.name])) },
    },
  };
  let text: string | null;
  try {
    const res = await fetch(`${config.url}/v1/systemone`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error', // a redirect could send the sentence off this machine
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (res.status !== 200) {
      await res.body?.cancel();
      return unsure(request, `Strands answered HTTP ${res.status}`);
    }
    text = await readCapped(res);
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') return unsure(request, `no answer in ${config.timeoutMs} ms`);
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : String(e);
    return unsure(request, `no answer from ${config.url} (${cause})`);
  }
  if (text === null) return unsure(request, `answer over ${MAX_ANSWER_BYTES} bytes`);
  let answers: unknown;
  try {
    answers = (JSON.parse(text) as { answers?: unknown } | null)?.answers;
  } catch {
    return unsure(request, 'answer is not JSON');
  }
  const op = readChoice(answers, 'op', request.ops);
  const target = readChoice(answers, 'target', request.targets.map((t) => t.id));
  if (op === null || target === null) return unsure(request, 'answer has no usable op or target');
  const opChoice = { choice: op.choice as EditOp, confidence: op.confidence };
  // Reset has no target: the slot is the first target and is not in doubt (as in plan C, D1).
  if (opChoice.choice === 'reset') return { op: opChoice, target: { choice: request.targets[0]!.id, confidence: 1 }, value: null };
  return { op: opChoice, target, value: opChoice.choice === 'widen' ? keywordValue(request) : null };
}
