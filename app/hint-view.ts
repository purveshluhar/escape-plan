// Draws the Hint panel into #hint: one Hint button per question that is a No, and the fix the rules
// found (or why none was found). textContent only, never innerHTML. Owner: P3.
import type { HintModel } from './hint.ts';

export interface HintView {
  asks: { name: string; onHint: () => void }[]; // one per No answer; empty hides the panel
  shown: { name: string; model: HintModel; onApply: () => void; onClose: () => void } | null;
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

export function renderHint(el: HTMLElement, v: HintView): void {
  el.classList.toggle('on', v.asks.length > 0);
  if (v.asks.length === 0) return el.replaceChildren();
  const many = v.asks.length > 1;
  const m = v.shown?.model ?? null;
  el.replaceChildren(
    h('div', { class: 'hbtns' }, ...v.asks.map((a) => button(many ? `Hint for ${a.name}` : 'Hint', 'fixbtn', a.onHint,
      { 'aria-label': `Hint for ${a.name}` }))),
    ...(v.shown && m ? [h('div', { class: 'hbody' },
      h('div', { class: 'hhead' }, h('b', {}, v.shown.name), h('span', { class: 'htried num' }, m.tried)),
      m.found
        ? h('div', { class: 'hfix' },
          h('div', { class: 'hlabel' }, m.fixLabel),
          m.then && h('div', { class: 'hthen' }, m.then),
          ...m.breaks.map((b) => h('div', { class: 'hbreak' }, `But it breaks: ${b}`)),
          h('div', { class: 'hact' },
            button('Apply this fix', 'fixbtn', v.shown.onApply),
            button('Close', 'fixbtn ghost', v.shown.onClose)))
        : h('div', { class: 'hfix' },
          h('div', { class: 'hnote' }, m.note),
          h('div', { class: 'hact' }, button('Close', 'fixbtn ghost', v.shown.onClose))))] : []),
  );
}

// The panel sits above the "who decided" strip. The strip's height changes after it is drawn (fonts,
// a wrapped line), so follow its size instead of reading it once. Call once at start-up.
export function stackAbove(hint: HTMLElement, strip: HTMLElement): void {
  const gap = 12;
  new ResizeObserver(() => hint.style.setProperty('--strip-h', strip.offsetHeight > 0 ? `${strip.offsetHeight + gap}px` : '0px')).observe(strip);
}
