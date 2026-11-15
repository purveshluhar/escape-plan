// Answers rows: one per token, from solver results, in the words of design/copy.md. Pure, so it
// is easy to test. Owner: P3. (File and export names stay for the code; the screen says Answers.)
import type { Building, Reason, SolverResult } from '../contract/types.ts';
import { DISCIPLINE_STYLE } from '../design/tokens.ts';
import { tokenName } from '../viewer/labels.ts';
import { questionOf, yesLine } from './questions.ts';

export interface ScoreRow {
  token: string;
  label: string;
  glyph: string;
  color: string;
  status: 'pass' | 'fail';
  detail: string; // the yes line, or "Chiller is stuck at Plant shaft: too narrow, needs 1.6 m, has 1.2 m"
  numbers: string; // "needs 1.6 m, has 1.2 m", or "" when the solver gives no numbers
}

// Plain words for every reason code. Record<Reason, ...> makes the typecheck fail if the
// contract adds a reason and this list does not.
export const REASON_TEXT: Record<Reason, string> = {
  too_narrow: 'too narrow',
  too_low: 'too low',
  cannot_turn: 'cannot turn the corner',
  step: 'step in the way',
  no_support: 'nothing holds it up',
  smoke_first: 'smoke gets there first',
  uphill: 'runs uphill',
  crosses_beam: 'crosses a beam',
  no_supply: 'no power reaches it',
  no_route: 'no way through',
};

// The name people see for an edge, node or member id. Members have no name: "beam-b2" -> "beam B2".
export function placeName(building: Building, id: string): string {
  const named = building.edges.find((e) => e.id === id) ?? building.nodes.find((n) => n.id === id);
  if (named) return named.name;
  if (building.members.some((m) => m.id === id)) {
    const parts = id.split(/[-_]/);
    const last = parts.pop() ?? id;
    return [...parts, last.toUpperCase()].join(' ');
  }
  return id;
}

// Metres with at least one decimal, so a measurement reads as one: 2 -> "2.0 m", 1.17 -> "1.17 m".
export function metres(v: number): string {
  const s = (Math.abs(v) < 0.005 ? 0 : v).toFixed(2); // no "-0.0 m"
  return `${s.endsWith('0') ? s.slice(0, -1) : s} m`;
}

function amount(r: SolverResult, v: number): string {
  // People and smoke count time steps; every other rule measures metres.
  return r.reason === 'smoke_first' ? `${v} step${v === 1 ? '' : 's'}` : metres(v);
}

export function numbersText(r: SolverResult): string {
  if (r.status === 'pass') return '';
  if (r.reason === 'no_support') return 'no path down to a foundation';
  if (r.reason === 'step' && r.available !== null) return `${metres(r.available)} high, needs level`;
  if (r.needed === null || r.available === null) return '';
  // A corner turn is about length, not door width; the smoke answer counts both arrivals. Plain
  // "needs, has" there read as a contradiction (a 1.6 m door fix after "has 2.0 m"; No at "needs 1, has 1").
  if (r.reason === 'cannot_turn') return `${metres(r.needed)} long, longest that fits ${metres(r.available)}`;
  if (r.reason === 'smoke_first') return r.needed === r.available
    ? `both at step ${r.needed}, a tie goes to the smoke`
    : `people at step ${r.needed}, smoke at step ${r.available}`;
  return `needs ${amount(r, r.needed)}, has ${amount(r, r.available)}`;
}

// The one no line used wherever a single line fits: "People are stuck at Office door: too
// narrow, needs 0.6 m, has 0.5 m". The verb agrees with the name (questions.ts `plural`).
export function stuckLine(building: Building, r: SolverResult): string {
  const verb = questionOf(r.token)?.plural ? 'are' : 'is';
  const where = r.blocked_at ? ` at ${placeName(building, r.blocked_at)}` : '';
  const why = REASON_TEXT[r.reason ?? 'no_route'];
  const nums = numbersText(r);
  return `${questionOf(r.token)?.subject ?? tokenName(r.token)} ${verb} stuck${where}: ${why}${nums ? `, ${nums}` : ''}`;
}

export function scoreRows(building: Building, results: SolverResult[]): ScoreRow[] {
  return results.map((r) => {
    const token = building.tokens.find((t) => t.id === r.token);
    const style = token ? DISCIPLINE_STYLE[token.discipline] : { label: r.token, glyph: '?', color: '#ffffff' };
    return {
      token: r.token, label: style.label, glyph: style.glyph, color: style.color,
      status: r.status, detail: r.status === 'pass' ? yesLine(r.token) : stuckLine(building, r), numbers: numbersText(r),
    };
  });
}

// True when every answer is yes (the screen says "Yes to all"; the name stays for the code).
export function levelComplete(results: SolverResult[]): boolean {
  return results.length > 0 && results.every((r) => r.status === 'pass');
}
