import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMAS, validate } from './validate.ts';
import * as T from './types.ts';
import * as X from './examples.ts';

const ok = (ref: string, data: unknown) => assert.deepEqual(validate(ref, data), [], ref);

test('typed examples match the JSON Schemas', () => {
  ok('solver-output.schema.json', [X.exampleResultFail, X.exampleResultPass, X.exampleResultPeople]);
  ok('edits.schema.json', X.exampleEdits);
  ok('jev.schema.json#/$defs/parse_request', X.exampleJevParseRequest);
  ok('jev.schema.json#/$defs/parse', X.exampleJevParse);
  ok('jev.schema.json#/$defs/vote_request', X.exampleJevVoteRequest);
  ok('jev.schema.json#/$defs/vote', X.exampleJevVote);
  for (const m of X.examplePhoneToApp) ok('phone.schema.json#/$defs/to_app', m);
  ok('phone.schema.json#/$defs/to_phone', X.exampleAppToPhone);
});

test('schema enums equal the TypeScript enums', () => {
  const def = (file: string, path: string[]): any =>
    path.reduce((node: any, key) => node[key], SCHEMAS[file]);
  const b = 'building.schema.json';
  assert.deepEqual(def(b, ['$defs', 'node', 'properties', 'type', 'enum']), [...T.NODE_TYPES]);
  assert.deepEqual(def(b, ['$defs', 'edge', 'properties', 'kind', 'enum']), [...T.EDGE_KINDS]);
  assert.deepEqual(def(b, ['$defs', 'member', 'properties', 'kind', 'enum']), [...T.MEMBER_KINDS]);
  assert.deepEqual(def(b, ['$defs', 'token', 'properties', 'discipline', 'enum']), [...T.DISCIPLINES]);
  assert.deepEqual(def(b, ['$defs', 'token', 'properties', 'rule', 'enum']), [...T.RULES]);
  const r = ['$defs', 'result', 'properties'];
  assert.deepEqual(def('solver-output.schema.json', [...r, 'status', 'enum']), [...T.STATUSES]);
  assert.deepEqual(def('solver-output.schema.json', [...r, 'reason', 'enum']), [...T.REASONS, null]);
  const e = ['$defs', 'edit', 'properties'];
  assert.deepEqual(def('edits.schema.json', [...e, 'op', 'enum']), [...T.EDIT_OPS]);
  assert.deepEqual(def('edits.schema.json', [...e, 'source', 'enum']), [...T.EDIT_SOURCES]);
  assert.deepEqual(def('jev.schema.json', ['$defs', 'vote', 'properties', 'vote', 'enum']), [...T.VOTES]);
  assert.equal(def('jev.schema.json', ['$defs', 'parse_request', 'properties', 'targets', 'maxItems']), T.JEV_MAX_TARGETS);
});

test('validator rejects bad data', () => {
  assert.notDeepEqual(validate('edits.schema.json', [{ op: 'explode', target: null, value: null, source: 'button' }]), []);
  assert.notDeepEqual(validate('edits.schema.json', [{ op: 'widen', target: 'd', value: 2 }]), []);
  assert.notDeepEqual(validate('solver-output.schema.json', [{ ...X.exampleResultPass, extra: 1 }]), []);
  assert.notDeepEqual(validate('jev.schema.json#/$defs/vote', { ...X.exampleJevVote, confidence: 1.5 }), []);
  assert.notDeepEqual(validate('phone.schema.json#/$defs/to_app', { type: 'vote', token: 't' }), []);
});
