// The ADR 0002 budget: solve() over every expected case stays under 100 ms in total.
// A wall-clock test, so it runs alone (`npm run test:timing`, one file at a time) and not in the
// parallel `npm test`, where other test processes take its CPU. The budget is exact: do not
// widen it to make this pass; slow the solver down instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { solve } from './index.ts';
import type { Building, Edit, ExpectedFile } from '../contract/types.ts';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const building = read('../data/building.json') as Building;
const expected = read('../data/expected.json') as ExpectedFile;

const button = (op: Edit['op'], target: string, value: number | null = null): Edit => ({ op, target, value, source: 'button' });
// The same four cases as MVP_CASES in mvp-resolve.test.ts.
const MVP_CASES: { id: string; edits: Edit[] }[] = [
  { id: 'mvp-base', edits: [] },
  { id: 'mvp-ramp', edits: [button('add_ramp', 'terrace-door')] },
  { id: 'mvp-widen-lobby', edits: [button('widen', 'lobby-door', 1.6)] },
  { id: 'mvp-widen-office', edits: [button('widen', 'office-door', 0.9)] },
];

test('solve() over every expected case takes under 100 ms in total (ADR 0002)', (t) => {
  // First in this file, and node --test runs each file in its own process: these are the first
  // solve() calls in the process, as on the first click.
  const start = performance.now();
  for (const c of expected.cases) solve(building, c.edits);
  for (const c of MVP_CASES) solve(building, c.edits);
  const ms = performance.now() - start;
  t.diagnostic(`solve() over ${expected.cases.length} expected cases + ${MVP_CASES.length} MVP edit cases: ${ms.toFixed(2)} ms`);
  assert.ok(ms < 100, `took ${ms.toFixed(2)} ms`);
});
