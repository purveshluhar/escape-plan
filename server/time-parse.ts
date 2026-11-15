// Times 5 calls through the running server's POST /parse and checks each answer against the
// JevParse schema (contract/validate.ts). Run `npm run server` first, then `npm run time-parse`.
// It reads SERVER_PORT like the server does. Exit 1 when a call fails or an answer is not a
// JevParse. The 2 s bar is for warm calls, so start it after the decider has warmed up. Owner: P1.
import type { JevParseRequest } from '../contract/types.ts';
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

const SENTENCES = [
  'widen the plant shaft to 2 m',
  'add a ramp at the terrace door',
  'reset',
  'close the north door',
  'make the lobby door 1.5 metres wide',
];

const port = Number(process.env.SERVER_PORT || DEFAULT_PORT);
const url = `http://${HOST}:${port}/parse`;
console.log(`time-parse: ${SENTENCES.length} calls to ${url}, ${TARGETS.length} targets, at ${new Date().toISOString()}`);

const times: number[] = [];
let failed = 0;
for (const [i, text] of SENTENCES.entries()) {
  const request: JevParseRequest = { text, ops: [...EDIT_OPS], targets: TARGETS, value_range: { min: 0, max: 5 } };
  const t0 = performance.now();
  let line: string;
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
    const body: unknown = await res.json();
    const ms = Math.round(performance.now() - t0);
    times.push(ms);
    const errors = res.status === 200 ? validate('jev.schema.json#/$defs/parse', body) : [`HTTP ${res.status}`];
    if (errors.length > 0) {
      failed++;
      line = `${ms} ms NOT a JevParse: ${errors.join('; ')} ${JSON.stringify(body)}`;
    } else {
      const p = body as { op: { choice: string; confidence: number }; target: { choice: string; confidence: number }; value: { score: number; confidence: number } | null };
      const confs = [p.op.confidence, ...(p.op.choice === 'reset' ? [] : [p.target.confidence]), ...(p.value ? [p.value.confidence] : [])];
      const accept = confs.every((c) => c >= JEV_ACCEPT_CONFIDENCE) ? 'applied' : 'Did you mean';
      const value = p.value ? ` value ${p.value.score} (${p.value.confidence})` : '';
      line = `${ms} ms valid JevParse: op ${p.op.choice} (${p.op.confidence}) target ${p.target.choice} (${p.target.confidence})${value} -> ${accept}`;
    }
  } catch (e) {
    failed++;
    line = `${Math.round(performance.now() - t0)} ms FAILED: ${e instanceof Error ? e.message : String(e)}`;
  }
  console.log(`call ${i + 1} "${text}": ${line}`);
}

const sorted = [...times].sort((a, b) => a - b);
const median = sorted.length > 0 ? sorted[Math.floor((sorted.length - 1) / 2)]! : NaN;
console.log(`median ${median} ms, max ${sorted.at(-1) ?? NaN} ms, ${SENTENCES.length - failed}/${SENTENCES.length} valid`);
if (failed > 0) process.exitCode = 1;
