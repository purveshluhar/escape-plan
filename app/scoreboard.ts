// Scoreboard rows: one per token, from solver results. Pure, so it is easy to test. Owner: P3.
import type { Building, Reason, SolverResult } from '../contract/types.ts';
import { DISCIPLINE_STYLE } from '../design/tokens.ts';

export interface ScoreRow {
  token: string;
  label: string;
  glyph: string;
  color: string;
  status: 'pass' | 'fail';
  detail: string; // "escaped", or "too narrow at Plant shaft"
  numbers: string; // "needs 1.6 m, has 1.2 m", or "" when the solver gives no numbers
}

// Plain words for every reason code. Record<Reason, ...> makes the typecheck fail if the
// contract adds a reason and this list does not.
export const REASON_TEXT: Record<Reason, string> = {
  too_narrow: 'too narrow',
  too_low: 'too low',
  cannot_turn: 'cannot turn',
  step: 'step in the way',
  no_support: 'no support',
  smoke_first: 'smoke got there first',
  uphill: 'runs uphill',
  crosses_beam: 'crosses a beam',
  no_supply: 'no supply',
  no_route: 'no route out',
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

function amount(r: SolverResult, v: number): string {
  // Smoke and people race in time steps; every other rule measures metres.
  return r.reason === 'smoke_first' ? `${v} steps` : `${Number(v.toFixed(2))} m`;
}

export function numbersText(r: SolverResult): string {
  if (r.status === 'pass' || r.needed === null || r.available === null) return '';
  return `needs ${amount(r, r.needed)}, has ${amount(r, r.available)}`;
}

export function scoreRows(building: Building, results: SolverResult[]): ScoreRow[] {
  return results.map((r) => {
    const token = building.tokens.find((t) => t.id === r.token);
    const style = token ? DISCIPLINE_STYLE[token.discipline] : { label: r.token, glyph: '?', color: '#ffffff' };
    const why = r.reason ? REASON_TEXT[r.reason] : 'blocked';
    const detail = r.status === 'pass'
      ? 'escaped'
      : `${why}${r.blocked_at ? ` at ${placeName(building, r.blocked_at)}` : ''}`;
    return {
      token: r.token, label: style.label, glyph: style.glyph, color: style.color,
      status: r.status, detail, numbers: numbersText(r),
    };
  });
}

export function levelComplete(results: SolverResult[]): boolean {
  return results.length > 0 && results.every((r) => r.status === 'pass');
}
