// Hand-made solver results for the example data/building.json, one set per expected case id.
// Only for viewer/dev.html, so the viewer can be seen before the solver rules land. Status,
// blocked_at and reason follow data/expected.json; paths and numbers are made up to look right.
// The main app never shows these.
import type { SolverResult } from '../contract/types.ts';

const chillerFail: SolverResult = {
  token: 'chiller', status: 'fail', path: ['plant'], blocked_at: 'plant-shaft',
  reason: 'too_narrow', needed: 1.6, available: 1.2,
};
const chillerPass: SolverResult = {
  token: 'chiller', status: 'pass', path: ['plant', 'corridor', 'street', 'truck'],
  blocked_at: null, reason: null, needed: null, available: null,
};
const glassFail: SolverResult = {
  token: 'glass', status: 'fail', path: ['street', 'corridor'], blocked_at: 'lobby-door',
  reason: 'cannot_turn', needed: 4.0, available: 3.81,
};
const glassPass: SolverResult = {
  token: 'glass', status: 'pass', path: ['street', 'corridor', 'lobby'],
  blocked_at: null, reason: null, needed: null, available: null,
};
const wheelchairFail: SolverResult = {
  token: 'wheelchair', status: 'fail', path: ['terrace'], blocked_at: 'terrace-door',
  reason: 'step', needed: 0, available: 0.15,
};
const wheelchairPass: SolverResult = {
  token: 'wheelchair', status: 'pass', path: ['terrace', 'lobby', 'corridor', 'street'],
  blocked_at: null, reason: null, needed: null, available: null,
};
const loadPass: SolverResult = {
  token: 'load', status: 'pass', path: ['beam-b2', 'c1', 'f1'],
  blocked_at: null, reason: null, needed: null, available: null,
};
const loadFail: SolverResult = {
  token: 'load', status: 'fail', path: ['beam-b2'], blocked_at: 'beam-b2',
  reason: 'no_support', needed: null, available: null,
};

export const FIXTURES: Record<string, SolverResult[]> = {
  base: [chillerFail, glassFail, wheelchairFail, loadPass],
  'widen-shaft': [chillerPass, glassFail, wheelchairFail, loadFail],
  'widen-shaft-and-transfer-beam': [chillerPass, glassFail, wheelchairFail, loadPass],
  'full-demo': [chillerPass, glassPass, wheelchairPass, loadPass],
};
