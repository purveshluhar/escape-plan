// DECIDER=strands: a local Strands Decider (`strands-decider serve`) answers op and target. Owner: P1.
// The limits come from the decider spike, and each one is a rule here:
// - Strands answers op and target only. The plan C number parser reads the value, with its
//   0-5 m range check (keywordValue), because a model score was right 1 time in 5.
// - Reset skips the target check: Strands gives a reset target 0.32-0.46.
// - Only the on-screen targets go to the model. 14 worked; 156 gave no answer over 0.8 and 255
//   did not fit. Over STRANDS_MAX_TARGETS the model is not asked.
// - When Strands is down, slow, busy with another call, or answers something unusable, parse()
//   answers at confidence 0, so the app shows "Did you mean". It never switches parser silently.
// - Plan C's guards cap the model's op and target confidence (keywordOpCap, keywordTargetCap).
// The Strands server must be on this machine: STRANDS_URL accepts only http://127.0.0.1.
import type { EditOp, JevParse, JevParseRequest } from '../contract/types.ts';
import { JEV_ACCEPT_CONFIDENCE } from '../contract/types.ts';
import { request as httpRequest } from 'node:http';
import { keywordOpCap, keywordTargetCap, keywordValue } from './keywords.ts';

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

class Timeout extends Error {}

// One POST with a deadline. node:http with agent:false, not fetch: fetch goes through a proxy set
// in the environment (NODE_USE_ENV_PROXY with HTTP_PROXY), which would send the sentence off this
// machine, and node:http never follows a redirect. `text` is null when the answer passed
// MAX_ANSWER_BYTES.
function postJson(url: string, body: string, timeoutMs: number): Promise<{ status: number; text: string | null }> {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const req = httpRequest(url, {
      method: 'POST',
      agent: false,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    }, (res) => {
      const status = res.statusCode ?? 0;
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_ANSWER_BYTES) {
          finish(() => resolve({ status, text: null }));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => finish(() => resolve({ status, text: Buffer.concat(chunks).toString('utf8') })));
      res.on('error', (e) => finish(() => reject(timedOut ? new Timeout() : e)));
    });
    const timer = setTimeout(() => { timedOut = true; req.destroy(new Timeout()); }, timeoutMs);
    let done = false;
    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      settle();
    };
    req.on('error', (e) => finish(() => reject(timedOut ? new Timeout() : e)));
    req.end(body);
  });
}

// Strands answers one call at a time and does not stop work for a caller that left. So `busy`
// lasts until Strands really answers (or MAX_STRANDS_TIMEOUT_MS passes), not until our own
// timeout, and a call meanwhile gets "Did you mean" at once instead of queueing into a timeout.
let busy = false;

const isConfidence = (x: unknown): x is number => typeof x === 'number' && x >= 0 && x <= 1;

// Strands refuses a choice with fewer than 2 options, so a single option gets a "none of these"
// option beside it. Its key never equals a real option.
function choices(options: [string, string][]): { criteria: Record<string, string>; none: string | null } {
  if (options.length >= 2) return { criteria: Object.fromEntries(options), none: null };
  let none = 'none of these';
  while (options.some(([k]) => k === none)) none += '!';
  // fromEntries makes own keys, so an id such as "__proto__" stays a choice.
  return { criteria: Object.fromEntries([...options, [none, 'something else, or none of these']]), none };
}

// One answer as { choice, confidence }, or null unless the choice is one of `allowed`. The "none
// of these" option reads as the only real option at confidence 0.
function readChoice(answers: unknown, key: string, allowed: readonly string[], none: string | null): { choice: string; confidence: number } | null {
  if (typeof answers !== 'object' || answers === null || !Object.hasOwn(answers, key)) return null;
  const a = (answers as Record<string, unknown>)[key];
  if (typeof a !== 'object' || a === null) return null;
  const { choice, confidence } = a as Record<string, unknown>;
  if (typeof choice !== 'string' || !isConfidence(confidence)) return null;
  if (none !== null && choice === none) return { choice: allowed[0]!, confidence: 0 };
  return allowed.includes(choice) ? { choice, confidence } : null;
}

export async function strandsParse(request: JevParseRequest, config: StrandsConfig): Promise<JevParse> {
  if (request.ops.length === 0 || request.targets.length === 0) throw new Error('strandsParse needs at least one op and one target');
  if (request.targets.length > STRANDS_MAX_TARGETS) {
    return unsure(request, `${request.targets.length} targets is over ${STRANDS_MAX_TARGETS}; send only the targets on screen`);
  }
  const ops = [...new Set(request.ops)];
  const ids = request.targets.map((t) => t.id);
  const opQ = choices(ops.map((o) => [o, OP_TEXT[o]]));
  const targetQ = choices(request.targets.map((t) => [t.id, t.name]));
  const body = {
    // JSON quoting, so a quote in the sentence cannot end the frame.
    state: `A player typed this edit command in a building game: ${JSON.stringify(request.text)}`,
    questions: {
      op: { type: 'choice', instructions: 'Which edit does the player ask for?', criteria: opQ.criteria },
      target: { type: 'choice', instructions: 'Which object on screen does the player mean?', criteria: targetQ.criteria },
    },
  };
  if (busy) return unsure(request, 'a Strands call is still running');
  busy = true;
  const call = postJson(`${config.url}/v1/systemone`, JSON.stringify(body), MAX_STRANDS_TIMEOUT_MS);
  call.then(() => { busy = false; }, () => { busy = false; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), config.timeoutMs); });
  let text: string | null;
  try {
    const reply = await Promise.race([call, deadline]);
    if (reply === 'timeout') return unsure(request, `no answer in ${config.timeoutMs} ms`);
    if (reply.status !== 200) return unsure(request, `Strands answered HTTP ${reply.status}`);
    text = reply.text;
  } catch (e) {
    if (e instanceof Timeout) return unsure(request, `no answer in ${MAX_STRANDS_TIMEOUT_MS} ms`);
    return unsure(request, `no answer from ${config.url} (${e instanceof Error ? e.message : String(e)})`);
  } finally {
    clearTimeout(timer);
  }
  if (text === null) return unsure(request, `answer over ${MAX_ANSWER_BYTES} bytes`);
  let answers: unknown;
  try {
    answers = (JSON.parse(text) as { answers?: unknown } | null)?.answers;
  } catch {
    return unsure(request, 'answer is not JSON');
  }
  const op = readChoice(answers, 'op', ops, opQ.none);
  const read = readChoice(answers, 'target', ids, targetQ.none);
  if (op === null || read === null) return unsure(request, 'answer has no usable op or target');
  // Plan C's guards still hold whatever the model says (keywordOpCap, keywordTargetCap).
  const opChoice = { choice: op.choice as EditOp, confidence: Math.min(op.confidence, keywordOpCap(request, op.choice as EditOp)) };
  const target = { choice: read.choice, confidence: Math.min(read.confidence, keywordTargetCap(request, read.choice)) };
  if (opChoice.choice === 'reset') {
    // A sure reset has no target: the slot is the first target and is not in doubt (plan C D1).
    // An unsure one keeps the target the model read, so "Did you mean" shows it.
    if (opChoice.confidence >= JEV_ACCEPT_CONFIDENCE) return { op: opChoice, target: { choice: ids[0]!, confidence: 1 }, value: null };
    return { op: opChoice, target, value: null };
  }
  return { op: opChoice, target, value: opChoice.choice === 'widen' ? keywordValue(request) : null };
}
