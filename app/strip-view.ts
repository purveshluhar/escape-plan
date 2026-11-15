// Draws the "who decided" strip from strip.ts into #strip. textContent only, never innerHTML.
// Owner: P3.
import type { Building } from '../contract/types.ts';
import { JEV_ACCEPT_CONFIDENCE } from '../contract/types.ts';
import type { Reading } from './parse-client.ts';
import { stripModel } from './strip.ts';
import type { AnswerLine } from './strip.ts';

export interface StripView {
  pending: string | null; // a sentence still being read
  reading: Reading | null;
  answers: AnswerLine[] | null; // null: none to show (nothing placed)
  checking: boolean; // the route animation is still playing
  solveMs: number | null;
  suggestions: { label: string; onPick: () => void }[];
  onCancel: () => void;
  onClose: () => void;
}

type Child = Node | string | null | undefined | false;
function h(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}
function button(label: string, cls: string, onClick: () => void, attrs: Record<string, string> = {}): HTMLElement {
  const b = h('button', { type: 'button', class: cls, ...attrs }, label);
  b.addEventListener('click', onClick);
  return b;
}

const solveText = (ms: number | null): string => ms === null ? '' : ms < 1 ? ', under 1 ms' : `, ${Math.round(ms)} ms`;

export function renderStrip(el: HTMLElement, building: Building, v: StripView): void {
  const typed = v.pending ?? v.reading?.text ?? null;
  el.classList.toggle('on', typed !== null);
  if (typed === null) return el.replaceChildren();
  const m = v.reading && v.pending === null ? stripModel(v.reading, building) : null;
  el.classList.toggle('unsure', m !== null && !m.sure);

  const read = m
    ? h('div', { class: `box read${m.sure ? '' : ' amber'}` },
      h('div', { class: 'bh' }, h('span', { class: 'step' }, '1'), `Read: ${m.reader}`),
      h('div', { class: 'srcline' }, m.source),
      ...m.rows.map((r) => {
        const pct = String(Math.round(r.confidence * 100));
        const low = r.confidence < JEV_ACCEPT_CONFIDENCE;
        return h('div', { class: `part${low ? ' low' : ''}` },
          h('span', { class: 'pn' }, r.name),
          h('span', { class: 'pv' }, r.text),
          h('span', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: `width:${pct}%` })),
          h('span', { class: 'pc num' }, r.confidence.toFixed(2)));
      }),
      h('div', { class: 'verdict' }, m.verdict),
      !m.sure && h('div', { class: 'dym' }, 'Did you mean'),
      !m.sure && h('div', { class: 'opts' },
        ...v.suggestions.map((s) => button(s.label, 'fixbtn', s.onPick)),
        button('Cancel', 'fixbtn ghost', v.onCancel)))
    : h('div', { class: 'box read' },
      h('div', { class: 'bh' }, h('span', { class: 'step' }, '1'), 'Read'),
      h('div', { class: 'srcline' }, 'Reading the sentence...'));

  const lines = !m ? [h('div', { class: 'quiet' }, 'Waiting for the reading.')]
    : !m.sure ? [h('div', { class: 'quiet' }, 'Nothing was changed, so nothing was checked again.')]
    : v.answers === null ? [h('div', { class: 'quiet' }, 'The building was checked again. Pick a question to see an answer.')]
    : v.checking ? [h('div', { class: 'quiet' }, 'Checking...')]
    : v.answers.map((a) => h('div', { class: 'ans' },
      h('span', { class: 'an' }, a.name),
      h('b', { class: `word ${a.answer === 'Yes' ? 'yes' : 'no'}` }, a.answer),
      a.detail && h('span', { class: 'ad num' }, a.detail)));
  const decided = h('div', { class: 'box decided' },
    h('div', { class: 'bh' }, h('span', { class: 'step' }, '2'), `Decided: building rules${m?.sure ? solveText(v.solveMs) : ''}`),
    ...lines);

  el.replaceChildren(
    h('div', { class: 'shead' },
      h('div', { class: 'typed' }, 'You typed: ', h('b', {}, `"${typed}"`)),
      button('Close', 'tool', v.onClose, { 'aria-label': 'Close who decided' })),
    h('div', { class: 'boxes' }, read, h('span', { class: 'arrow', 'aria-hidden': 'true' }, '->'), decided),
    h('div', { class: 'caps' },
      h('span', {}, 'Reads your words. It can say "not sure".'),
      h('span', {}, 'Plain rules decide. Same answer every time.')),
  );
}
