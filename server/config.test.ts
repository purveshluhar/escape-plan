// P1-11: server/ tests run in `npm test`, and server/ code is typechecked.
// If someone drops server/ from either list, this file stops running or fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

test('npm test globs include server/', () => {
  const pkg = read('../package.json') as { scripts: { test: string } };
  assert.match(pkg.scripts.test, /"server\/\*\*\/\*\.test\.ts"/);
});

test('tsconfig include lists server', () => {
  const ts = read('../tsconfig.json') as { include: string[] };
  assert.ok(ts.include.includes('server'));
});
