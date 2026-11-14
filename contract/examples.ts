// Typed sample of every contract format. `npm run typecheck` checks them against types.ts;
// contract.test.ts checks them against the JSON Schemas. Together they keep the two in step.
import type {
  AppToPhone, Edit, JevParse, JevParseRequest, JevVote, JevVoteRequest, PhoneToApp, SolverResult,
} from './types.ts';

export const exampleResultFail: SolverResult = {
  token: 'chiller',
  status: 'fail',
  path: ['plant', 'corridor'],
  blocked_at: 'door-north',
  reason: 'too_narrow',
  needed: 1.6,
  available: 0.9,
};

export const exampleResultPass: SolverResult = {
  token: 'chiller',
  status: 'pass',
  path: ['plant', 'corridor', 'street', 'truck'],
  blocked_at: null,
  reason: null,
  needed: null,
  available: null,
};

export const exampleResultPeople: SolverResult = {
  token: 'people', status: 'fail', path: ['room', 'corridor'], blocked_at: 'corridor',
  reason: 'smoke_first', needed: 4, available: 3, time: 3,
};

export const exampleEdits: Edit[] = [
  { op: 'widen', target: 'door-north', value: 2.0, source: 'button' },
  { op: 'add_transfer_beam', target: 'beam-b2', value: null, source: 'text' },
  { op: 'reset', target: null, value: null, source: 'button' },
];

export const exampleJevParseRequest: JevParseRequest = {
  text: 'widen the north door to 2 metres',
  ops: ['widen', 'add_transfer_beam', 'add_ramp', 'close_door', 'reset'],
  targets: [{ id: 'door-north', name: 'North door' }, { id: 'beam-b2', name: 'Beam B2' }],
  value_range: { min: 0, max: 5 },
};

export const exampleJevParse: JevParse = {
  op: { choice: 'widen', confidence: 0.94 },
  target: { choice: 'door-north', confidence: 0.88 },
  value: { score: 2.0, confidence: 0.9 },
};

export const exampleJevVoteRequest: JevVoteRequest = {
  discipline: 'mep',
  edit: { op: 'widen', target: 'door-north', value: 2.0, source: 'text' },
  before: exampleResultFail,
  after: exampleResultPass,
};

export const exampleJevVote: JevVote = { token: 'chiller', discipline: 'mep', vote: 'accept', confidence: 0.91 };

export const examplePhoneToApp: PhoneToApp[] = [
  { type: 'join', token: 'wheelchair' },
  { type: 'escape', token: 'wheelchair' },
  { type: 'vote', token: 'wheelchair', vote: 'object' },
];

export const exampleAppToPhone: AppToPhone = { type: 'result', result: exampleResultFail };
