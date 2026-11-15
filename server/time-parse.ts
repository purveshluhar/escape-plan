// Times 5 calls through the running server's POST /parse and checks each answer against the
// JevParse schema (contract/validate.ts). Run `npm run server` first, then `npm run time-parse`.
// It reads SERVER_PORT like the server does. The last line names the decider that answered.
// Exit 1 when a call fails, an answer is not a JevParse, or the decider gave no answer (every
// confidence 0: Strands down, slow or busy; the server log says which). Each answer is graded
// against the edit the sentence asks for. The 2 s bar is for warm calls. Owner: P1.
import type { EditOp, Id, JevParse, JevParseRequest } from '../contract/types.ts';
import { EDIT_OPS, JEV_ACCEPT_CONFIDENCE } from '../contract/types.ts';
import { validate } from '../contract/validate.ts';
import { DEFAULT_PORT, HOST } from './http.ts';

// The 14 on-screen targets the decider spike measured.
const TARGETS = [
  ['plant', 'Roof plant room'], ['lobby', 'Lobby'], ['terrace', 'Terrace'], ['corridor', 'North corridor'],
  ['street', 'Street'], ['truck', 'Truck'], ['plant-shaft', 'Plant shaft'], ['door-north', 'North door'],
  ['curb', 'Curb to truck'], ['lobby-door', 'Lobby door'], ['terrace-door', 'Terrace door'],
  ['f1', 'Foundation F1'], ['c1', 'Column C1'], ['beam-b2', 'Beam B2'],
].map(([id, name]) => ({ id: id!, name: name! }));

// Each sentence with the edit it asks for. Reset has no target to grade.
const CASES: { text: string; op: EditOp; target: Id | null; value: number | null }[] = [
  { text: 'widen the plant shaft to 2 m', op: 'widen', target: 'plant-shaft', value: 2 },
  { text: 'add a ramp at the terrace door', op: 'add_ramp', target: 'terrace-door', value: null },
  { text: 'reset', op: 'reset', target: null, value: null },
  { text: 'close the north door', op: 'close_door', target: 'door-north', value: null },
  { text: 'make the lobby door 1.5 metres wide', op: 'widen', target: 'lobby-door', value: 1.5 },
];

const port = Number(process.env.SERVER_PORT || DEFAULT_PORT);
const url = `http://${HOST}:${port}/parse`;
console.log(`time-parse: ${CASES.length} calls to ${url}, ${TARGETS.length} targets, at ${new Date().toISOString()}`);

const times: number[] = [];
let failed = 0;
let right = 0;
const deciders = new Set<string>();
for (const [i, c] of CASES.entries()) {
  const request: JevParseRequest = { text: c.text, ops: [...EDIT_OPS], targets: TARGETS, value_range: { min: 0, max: 5 } };
  const t0 = performance.now();
  let line: string;
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
    const body: unknown = await res.json();
    const ms = Math.round(performance.now() - t0);
    times.push(ms);
    deciders.add(res.headers.get('x-decider') ?? 'unknown');
    const errors = res.status === 200 ? validate('jev.schema.json#/$defs/parse', body) : [`HTTP ${res.status}`];
    if (errors.length > 0) {
      failed++;
      line = `${ms} ms NOT a JevParse: ${errors.join('; ')} ${JSON.stringify(body)}`;
    } else {
      const p = body as JevParse;
      const value = p.value ? ` value ${p.value.score} (${p.value.confidence})` : '';
      const answer = `op ${p.op.choice} (${p.op.confidence}) target ${p.target.choice} (${p.target.confidence})${value}`;
      if (p.op.confidence === 0 && p.target.confidence === 0) {
        failed++;
        line = `${ms} ms valid JevParse, but no answer from the decider (read the server log): ${answer}`;
      } else {
        // The app's rule: every confidence at 0.8 or more.
        const confs = [p.op.confidence, p.target.confidence, ...(p.value ? [p.value.confidence] : [])];
        const accept = confs.every((x) => x >= JEV_ACCEPT_CONFIDENCE) ? 'applied' : 'Did you mean';
        const ok = p.op.choice === c.op && (c.target === null || p.target.choice === c.target)
          && (c.value === null || (p.value !== null && Math.abs(p.value.score - c.value) < 0.05));
        if (ok) right++;
        line = `${ms} ms valid JevParse: ${answer} -> ${accept}, ${ok ? 'right' : 'WRONG'}`;
      }
    }
  } catch (e) {
    failed++;
    line = `${Math.round(performance.now() - t0)} ms FAILED: ${e instanceof Error ? e.message : String(e)}`;
  }
  console.log(`call ${i + 1} "${c.text}": ${line}`);
}

const sorted = [...times].sort((a, b) => a - b);
const median = sorted.length > 0 ? sorted[Math.floor((sorted.length - 1) / 2)]! : NaN;
console.log(`decider ${[...deciders].join(', ') || 'unknown'}: median ${median} ms, max ${sorted.at(-1) ?? NaN} ms, `
  + `${CASES.length - failed}/${CASES.length} answered, ${right}/${CASES.length} right`);
if (failed > 0) process.exitCode = 1;
