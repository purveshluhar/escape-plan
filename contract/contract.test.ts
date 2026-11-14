import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMAS, checkBuildingRefs, validate } from './validate.ts';
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
  // The same enums repeated in other schemas.
  const x = ['$defs', 'expected_result', 'properties'];
  assert.deepEqual(def('expected.schema.json', [...x, 'status', 'enum']), [...T.STATUSES]);
  assert.deepEqual(def('expected.schema.json', [...x, 'reason', 'enum']), [...T.REASONS, null]);
  const j = (...p: string[]) => def('jev.schema.json', ['$defs', ...p]);
  assert.deepEqual(j('parse_request', 'properties', 'ops', 'items', 'enum'), [...T.EDIT_OPS]);
  assert.deepEqual(j('parse', 'properties', 'op', 'properties', 'choice', 'enum'), [...T.EDIT_OPS]);
  assert.deepEqual(j('vote_request', 'properties', 'discipline', 'enum'), [...T.DISCIPLINES]);
  assert.deepEqual(j('vote', 'properties', 'discipline', 'enum'), [...T.DISCIPLINES]);
  assert.deepEqual(
    def('phone.schema.json', ['$defs', 'to_app', 'oneOf', '2', 'properties', 'vote', 'enum']), [...T.VOTES],
  );
});

test('building reference checks catch broken graphs', () => {
  const base: T.Building = {
    levels: [{ id: 'L1', elevation: 0 }],
    nodes: [{ id: 'a', name: 'A', level: 'L1', type: 'room', box: { x: 0, y: 0, width: 1, depth: 1 }, is_exit: true }],
    edges: [],
    members: [
      { id: 'f', kind: 'foundation', level: 'L1', supported_by: [] },
      { id: 'c', kind: 'column', level: 'L1', supported_by: ['f'] },
    ],
    tokens: [{ id: 'load', discipline: 'structure', start: 'c', goal: 'f', size: { width: 0, height: 0, length: 0 }, rule: 'downward' }],
  };
  assert.deepEqual(checkBuildingRefs(base), []);
  const cycle = structuredClone(base);
  cycle.members = [
    { id: 'f', kind: 'foundation', level: 'L1', supported_by: [] },
    { id: 'c', kind: 'column', level: 'L1', supported_by: ['b'] },
    { id: 'b', kind: 'beam', level: 'L1', supported_by: ['c'] },
  ];
  assert.ok(checkBuildingRefs(cycle).some((e) => e.startsWith('support cycle')));
  const badGoal = structuredClone(base);
  badGoal.tokens[0]!.goal = 'c';
  assert.ok(checkBuildingRefs(badGoal).some((e) => e.includes('must be a foundation')));
  const loop = structuredClone(base);
  loop.edges = [{ id: 'e', name: 'E', from: 'a', to: 'a', kind: 'door', clear_width: 1, clear_height: 2, step_height: 0 }];
  assert.ok(checkBuildingRefs(loop).some((e) => e.includes('same node')));
});

test('validator rejects bad data', () => {
  assert.notDeepEqual(validate('edits.schema.json', [{ op: 'explode', target: null, value: null, source: 'button' }]), []);
  assert.notDeepEqual(validate('edits.schema.json', [{ op: 'widen', target: 'd', value: 2 }]), []);
  assert.notDeepEqual(validate('solver-output.schema.json', [{ ...X.exampleResultPass, extra: 1 }]), []);
  assert.notDeepEqual(validate('jev.schema.json#/$defs/vote', { ...X.exampleJevVote, confidence: 1.5 }), []);
  assert.notDeepEqual(validate('phone.schema.json#/$defs/to_app', { type: 'vote', token: 't' }), []);
  assert.notDeepEqual(validate('solver-output.schema.json', [{ ...X.exampleResultFail, needed: Number.NaN }]), []);
});
