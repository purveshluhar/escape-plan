// Schema check for every JSON file in data/. Runs in `npm test` and in CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { validate, checkBuildingRefs } from '../contract/validate.ts';
import type { Building, ExpectedFile } from '../contract/types.ts';

const dir = new URL('./', import.meta.url);
const read = (name: string): unknown => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));

// Which schema each data file must match. A new JSON file in data/ needs a line here.
const SCHEMA_FOR: Record<string, string> = {
  'building.json': 'building.schema.json',
  'expected.json': 'expected.schema.json',
};

test('every data/*.json file has a schema and matches it', () => {
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const schema = SCHEMA_FOR[name];
    assert.ok(schema, `data/${name} has no schema; add it to SCHEMA_FOR in data/data.test.ts`);
    assert.deepEqual(validate(schema, read(name)), [], `data/${name}`);
  }
});

test('building.json ids all point at something real', () => {
  assert.deepEqual(checkBuildingRefs(read('building.json') as Building), []);
});

test('expected.json names only tokens and edit targets that exist', () => {
  const b = read('building.json') as Building;
  const tokens = new Set(b.tokens.map((t) => t.id));
  const targets = new Set([...b.edges.map((e) => e.id), ...b.members.map((m) => m.id)]);
  const errors: string[] = [];
  for (const c of (read('expected.json') as ExpectedFile).cases) {
    for (const r of c.expect) if (!tokens.has(r.token)) errors.push(`${c.id}: unknown token ${r.token}`);
    for (const e of c.edits) if (e.target !== null && !targets.has(e.target)) errors.push(`${c.id}: unknown target ${e.target}`);
  }
  assert.deepEqual(errors, []);
});
