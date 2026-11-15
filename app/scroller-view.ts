// Draws the floor scroller (scroller.ts) as a glass rail on the right edge: a vertical slider over the
// drawn levels, with the open level's name beside the thumb. Drag the thumb, turn the wheel over the
// rail, or use the keys when it has focus. textContent only, never innerHTML. Owner: P3.
import type { Id } from '../contract/types.ts';
import { createScroller, thumbFraction, wheelPixels } from './scroller.ts';
import type { Scroller, Stop } from './scroller.ts';

export interface ScrollerView {
  // The levels to list, lowest first; an empty list hides the rail. Starts on the lowest.
  setStops(stops: readonly Stop[]): void;
  // The viewer's open floor changed: move the thumb (no pick).
  follow(level: Id | null): void;
  // Pixels the rail keeps clear on the right, for the fix sheet and the edit box.
  setInset(pixels: number): void;
}

const THUMB = 22; // px, the thumb's height; the track's usable run is this much shorter

const CSS = `
.floors{position:fixed;right:calc(16px + var(--rail-inset,0px));top:96px;height:clamp(240px,calc(100vh - 520px),520px);width:76px;
  border-radius:26px;padding:12px 6px;display:none;flex-direction:column;align-items:center;gap:8px;
  transition:right .5s var(--soft)}
.floors.on{display:flex}
.floors .fl-end{font:600 12px/1 var(--font);color:var(--muted);letter-spacing:.02em;white-space:nowrap}
.floors .fl-track{position:relative;flex:1;width:44px;cursor:grab;touch-action:none;border-radius:14px;user-select:none;-webkit-user-select:none}
.floors .fl-track:active{cursor:grabbing}
.floors .fl-line{position:absolute;left:50%;top:${THUMB / 2}px;bottom:${THUMB / 2}px;width:4px;margin-left:-2px;border-radius:2px;background:rgba(20,22,28,.28)}
.floors .fl-thumb{position:absolute;left:50%;width:30px;height:${THUMB}px;margin-left:-15px;border-radius:999px;background:var(--esc);
  box-shadow:0 0 0 2px rgba(255,255,255,.9),0 2px 6px rgba(30,40,60,.3)}
.floors .fl-name{position:absolute;right:calc(100% + 14px);top:50%;transform:translateY(-50%);white-space:nowrap;
  padding:6px 11px;border-radius:999px;background:rgba(250,251,253,.97);border:1px solid rgba(20,22,28,.14);
  box-shadow:0 2px 8px rgba(30,40,60,.18);font:700 14px/1 var(--font);color:var(--ink);pointer-events:none}
/* Under 1560 px the open Answers panel (560 px, centred) reaches the rail's column: the rail waits until it closes. */
@media (max-width:1560px){#scorePanel.open ~ .floors{visibility:hidden}}
@media (prefers-reduced-motion:reduce){.floors{transition:none}}
`;

export function mountScroller(host: HTMLElement, onPick: (level: Id) => void): ScrollerView {
  if (!document.getElementById('floors-style')) {
    const style = document.createElement('style');
    style.id = 'floors-style';
    style.textContent = CSS;
    document.head.append(style);
  }
  const el = (cls: string, tag = 'div'): HTMLElement => Object.assign(document.createElement(tag), { className: cls });
  const rail = el('floors glass');
  rail.id = 'floors';
  rail.setAttribute('role', 'group');
  rail.setAttribute('aria-label', 'Floors');
  const topEnd = el('fl-end');
  const bottomEnd = el('fl-end');
  const track = el('fl-track');
  track.tabIndex = 0;
  track.setAttribute('role', 'slider');
  track.setAttribute('aria-orientation', 'vertical');
  track.setAttribute('aria-label', 'Floor');
  const thumb = el('fl-thumb');
  const name = el('fl-name');
  thumb.append(name);
  track.append(el('fl-line'), thumb);
  topEnd.setAttribute('aria-hidden', 'true');
  bottomEnd.setAttribute('aria-hidden', 'true');
  rail.append(topEnd, track, bottomEnd);
  host.append(rail);

  let scroller: Scroller = createScroller([], onPick);
  let stops: readonly Stop[] = [];

  const draw = (): void => {
    const a = scroller.aria();
    track.setAttribute('aria-valuemin', String(a.min));
    track.setAttribute('aria-valuemax', String(a.max));
    track.setAttribute('aria-valuenow', String(a.now));
    track.setAttribute('aria-valuetext', a.text);
    name.textContent = a.text;
    // The thumb names its floor; an end label with the same name would say it twice.
    bottomEnd.style.visibility = scroller.count() > 0 && scroller.index() === 0 ? 'hidden' : '';
    topEnd.style.visibility = scroller.count() > 0 && scroller.index() === scroller.count() - 1 ? 'hidden' : '';
    // A share of the track less the thumb, so a resize needs no redraw.
    thumb.style.bottom = `calc(${thumbFraction(scroller.index(), scroller.count())} * (100% - ${THUMB}px))`;
  };
  // The usable run of the track on screen: the thumb's centre travels it.
  const runOf = (): { top: number; height: number } => {
    const r = track.getBoundingClientRect();
    return { top: r.top + THUMB / 2, height: Math.max(1, r.height - THUMB) };
  };

  track.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (scroller.key(e.key)) {
      e.preventDefault();
      draw();
    }
    // The page's own keys (arrows move the selected question, Space is Show me, digits ask, R undoes)
    // are not the slider's: only Tab and Escape still leave it.
    if (e.key !== 'Tab' && e.key !== 'Escape') e.stopPropagation();
  });
  rail.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return; // a pinch or Ctrl+wheel is the browser's zoom
    e.preventDefault();
    scroller.wheel(wheelPixels(e.deltaY, e.deltaMode));
    draw();
  }, { passive: false });
  // One pointer at a time. `grab` keeps the thumb under the finger: a press on the thumb moves nothing
  // until the pointer does, and the thumb keeps the spot it was held at.
  let active: number | null = null;
  let grab = 0;
  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || active !== null) return;
    active = e.pointerId;
    track.setPointerCapture(e.pointerId);
    track.focus({ preventScroll: true });
    const t = thumb.getBoundingClientRect();
    const middle = (t.top + t.bottom) / 2;
    grab = e.clientY >= t.top && e.clientY <= t.bottom ? e.clientY - middle : 0;
    scroller.press(e.clientY - grab, runOf());
    draw();
  });
  track.addEventListener('pointermove', (e) => {
    if (e.pointerId !== active) return;
    scroller.press(e.clientY - grab, runOf());
    draw();
  });
  // Fires on pointerup and pointercancel too, and when the rail hides mid-drag.
  track.addEventListener('lostpointercapture', (e) => {
    if (e.pointerId !== active) return;
    active = null;
    scroller.release();
  });

  return {
    setStops(next) {
      stops = next;
      scroller = createScroller(next, onPick);
      rail.classList.toggle('on', next.length > 0);
      topEnd.textContent = next[next.length - 1]?.name ?? '';
      bottomEnd.textContent = next[0]?.name ?? '';
      draw();
    },
    follow(level) {
      scroller.follow(level);
      if (stops.length > 0) draw();
    },
    setInset(pixels) {
      rail.style.setProperty('--rail-inset', `${pixels}px`);
    },
  };
}
