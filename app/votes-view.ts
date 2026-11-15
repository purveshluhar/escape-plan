// Draws the review panel from votes.ts into #votes: one bubble per discipline. textContent only,
// never innerHTML. A bubble never changes an answer; a vote that disagrees with the rules is marked.
// Owner: P3.
import type { Building } from '../contract/types.ts';
import { panelModel } from './votes.ts';
import type { PanelReading } from './votes.ts';

type Child = Node | string | null | undefined | false;
function h(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}

export function renderVotes(el: HTMLElement, building: Building, r: PanelReading | null, onClose: () => void): void {
  el.classList.toggle('on', r !== null);
  if (r === null) return el.replaceChildren();
  const m = panelModel(r, building);
  const close = h('button', { type: 'button', class: 'tool', 'aria-label': 'Close review panel' }, 'Close');
  close.addEventListener('click', onClose);
  el.replaceChildren(
    h('div', { class: 'vhead' }, h('span', { class: 'vt' }, m.title), close),
    h('div', { class: 'srcline' }, m.source),
    ...m.bubbles.map((b) => h('div', { class: `vb ${b.vote.toLowerCase()}${b.clash ? ' clash' : ''}` },
      h('div', { class: 'vtop' },
        h('span', { class: 'vd' }, b.discipline, h('span', { class: 'vw' }, b.who)),
        h('b', { class: 'vv' }, b.vote, !b.sure && h('span', { class: 'vns' }, ', not sure')),
        h('span', { class: `vc num${b.sure ? '' : ' low'}` }, b.confidence)),
      h('div', { class: 'vr' }, b.reason),
      b.rules && h('div', { class: 'vrules' }, b.rules))),
    h('div', { class: `vsum${m.bubbles.some((b) => b.clash) ? ' clash' : ''}` }, m.summary),
  );
}
