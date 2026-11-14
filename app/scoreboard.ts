// Scoreboard rows: one per token, from solver results. Pure, so it is easy to test. Owner: P3.
import type { Building, SolverResult } from '../contract/types.ts';
import { DISCIPLINE_STYLE } from '../design/tokens.ts';

export interface ScoreRow {
  token: string;
  label: string;
  glyph: string;
  color: string;
  status: 'pass' | 'fail';
  detail: string;
}

export function scoreRows(building: Building, results: SolverResult[]): ScoreRow[] {
  return results.map((r) => {
    const token = building.tokens.find((t) => t.id === r.token);
    const style = token ? DISCIPLINE_STYLE[token.discipline] : { label: r.token, glyph: '?', color: '#ffffff' };
    const detail = r.status === 'pass'
      ? 'escaped'
      : `${r.reason ?? 'blocked'}${r.blocked_at ? ` at ${r.blocked_at}` : ''}`;
    return { token: r.token, label: style.label, glyph: style.glyph, color: style.color, status: r.status, detail };
  });
}

export function levelComplete(results: SolverResult[]): boolean {
  return results.length > 0 && results.every((r) => r.status === 'pass');
}
