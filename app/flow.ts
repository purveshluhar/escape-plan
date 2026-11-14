// The 12-sheet flow (design/flow.md): which screen shows, what each card says, and which fixes
// an object can take. Pure, so Node tests can walk it. main.ts draws it. Owner: P3.
import type { Building, Edit, Id, SolverResult, Token } from '../contract/types.ts';
import { DISCIPLINE_STYLE } from '../design/tokens.ts';
import type { View } from '../design/tokens.ts';
import { placeName } from './scoreboard.ts';
import type { DemoButton } from './state.ts';

// Sheet numbers from design/flow.md. Sheet 09 (loop) is `proposal` for the newly blocked object.
// Sheet 06 (Jev solving) waits for P1's Jev client; until then a fix comes from sheet 11.
export type Screen =
  | 'start' // 01
  | 'select' // 02
  | 'exits' // 03
  | 'ready' // 04
  | 'clash' // 05
  | 'proposal' // 07 and 09
  | 'result' // 08: the object escaped, maybe with a conflict
  | 'complete' // 10
  | 'fallback' // 11
  | 'reset'; // 12

export const SHEET: Record<Screen, string> = {
  start: '01', select: '02', exits: '03', ready: '04', clash: '05',
  proposal: '07', result: '08', complete: '10', fallback: '11', reset: '12',
};

export function viewFor(screen: Screen): View {
  switch (screen) {
    case 'start':
    case 'select':
      return 'shaded';
    case 'exits':
    case 'ready':
    case 'complete':
      return 'xray';
    default:
      return 'floors';
  }
}

export type Badge = 'READY' | 'SELECT' | 'BLOCKED' | 'EDITING' | 'CONFLICT' | 'ESCAPED' | 'COMPLETE';

export function badgeFor(screen: Screen, conflict: boolean): Badge {
  switch (screen) {
    case 'start':
    case 'ready':
      return 'READY';
    case 'select':
    case 'exits':
      return 'SELECT';
    case 'clash':
      return 'BLOCKED';
    case 'proposal':
    case 'fallback':
      return 'EDITING';
    case 'result':
      return conflict ? 'CONFLICT' : 'ESCAPED';
    case 'complete':
      return 'COMPLETE';
    case 'reset':
      return conflict ? 'CONFLICT' : 'EDITING';
  }
}

function metres(v: number): string {
  return `${Number(v.toFixed(2))}`;
}

// What the object card in sheet 02 says: what it is, its size, where it starts.
export interface ObjectFacts {
  id: Id;
  name: string; // CHILLER
  glyph: string;
  color: string;
  glyphInk: string;
  line: string; // "MEP · 1.6 × 2.0 × 2.4 m · Mechanical level plant"
  where: string; // "Mechanical level plant"
}

const DISCIPLINE_NAME: Record<string, string> = {
  mep: 'MEP', logistics: 'Facade', accessibility: 'Access', structure: 'Structure',
  life_safety: 'Life safety', fire: 'Fire', plumbing: 'Plumbing', electrical: 'Electrical',
};

export function objectFacts(building: Building, token: Token): ObjectFacts {
  const style = DISCIPLINE_STYLE[token.discipline];
  const where = placeName(building, token.start);
  const { width, height, length } = token.size;
  const size = width + height + length > 0 ? `${metres(width)} × ${metres(height)} × ${metres(length)} m` : '';
  const line = [DISCIPLINE_NAME[token.discipline] ?? token.discipline, size, where].filter(Boolean).join(' · ');
  return {
    id: token.id, name: style.label.toUpperCase(), glyph: style.glyph, color: style.color,
    glyphInk: style.glyphInk, line, where,
  };
}

// Where an object may leave (sheet 03). Today each token has one goal in the data; a null goal
// means any exit node (or, for the load, the ground).
export interface ExitOption {
  id: Id;
  name: string;
  note: string;
}

export function exitsFor(building: Building, token: Token): ExitOption[] {
  if (token.rule === 'downward') {
    return building.members
      .filter((m) => m.kind === 'foundation')
      .map((m) => ({ id: m.id, name: `Foundation ${m.id.toUpperCase()}`, note: 'Ground, through the columns' }));
  }
  const nodes = token.goal === null
    ? building.nodes.filter((n) => n.is_exit)
    : building.nodes.filter((n) => n.id === token.goal);
  return nodes.map((n) => ({ id: n.id, name: n.name, note: `Level ${n.level.replace(/^L/, '')}` }));
}

// The demo fixes that can help one object (sheet 11): demo buttons whose target matters to it and
// that are not applied yet. `targets` comes from relevantTargets() in answers.ts.
export function fixesFor(buttons: DemoButton[], targets: Set<Id>, applied: readonly Edit[]): DemoButton[] {
  const done = (e: Edit): boolean => applied.some((a) => a.op === e.op && a.target === e.target && a.value === e.value);
  return buttons.filter((b) => b.edit.target !== null && targets.has(b.edit.target) && !done(b.edit));
}

// Tokens that passed before and fail now: the CONFLICT! moment, and the warning on a proposal.
export function newlyBlocked(before: readonly SolverResult[] | null, after: readonly SolverResult[]): SolverResult[] {
  if (!before) return [];
  return after.filter((r) => r.status === 'fail' && before.find((b) => b.token === r.token)?.status === 'pass');
}

export function escapedCount(results: readonly SolverResult[] | null): number {
  return results ? results.filter((r) => r.status === 'pass').length : 0;
}

// Where ESCAPE! leads for the selected object.
export function afterRun(results: readonly SolverResult[], selected: Id | null): Screen {
  if (results.length > 0 && results.every((r) => r.status === 'pass')) return 'complete';
  const mine = results.find((r) => r.token === selected);
  return mine && mine.status === 'fail' ? 'clash' : 'result';
}

// The next object to pick after one escapes: the first that still fails, else null.
export function nextBlocked(results: readonly SolverResult[]): Id | null {
  return results.find((r) => r.status === 'fail')?.token ?? null;
}
