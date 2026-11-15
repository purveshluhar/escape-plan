// Zoomed in past REVEAL_ZOOM the facade fades out, the city dims and the floors above the level at
// the middle of the view are cut away, with a label per floor. These are the pure parts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Building } from '../contract/types.ts';
import { EASE_GLASS, MOTION } from '../design/tokens.ts';
import { drawnLevels } from '../data/typical-floors.ts';
import { dropTarget } from './drop.ts';
import {
  focusHeight, belowCut, cutLevel, dropCeiling, FOCUS_GAIN_MAX, easeGlass, fadeAt, floorName, floorTagRect, keepFloorTags, planExtent,
  retarget, revealed, REVEAL_MS, REVEAL_ZOOM, viewDirection, zoomFactor, DEFAULT_VIEW, facadeOpen, routesShown,
} from './layout.ts';
import type { Fade, Vec3 } from './layout.ts';

const real = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;

test('reveal: the framed view and a double-click reset keep the facade; three wheel notches in open it', () => {
  assert.equal(revealed(1), false); // default view and double-click reset (zoom = 1)
  assert.equal(revealed(30), false); // zoomed out to the city
  assert.equal(revealed(REVEAL_ZOOM), false); // exactly at the threshold: still closed
  assert.equal(revealed(REVEAL_ZOOM - 1e-6), true);
  let zoom = 1;
  for (let i = 0; i < 2; i++) zoom = zoomFactor(zoom, -100); // two notches of a mouse wheel
  assert.equal(revealed(zoom), false);
  zoom = zoomFactor(zoom, -100); // the third
  assert.equal(revealed(zoom), true);
});

test('with answers on the model the framed view opens too, so routes run on the floors, not over the facade', () => {
  const parked = { token: 'sofa', status: 'pass' as const, path: [], blocked_at: null, reason: null, needed: null, available: null };
  const stuck = { ...parked, status: 'fail' as const, path: ['office'], blocked_at: 'office-door', reason: 'too_narrow' as const };
  const out = { ...parked, path: ['lobby', 'street'] };
  assert.equal(routesShown([parked]), false); // a question waiting for Show me: no route yet
  assert.equal(routesShown([parked, stuck]), true); // stuck in its start room still draws a route to the door
  assert.equal(routesShown([out]), true);
  assert.equal(facadeOpen(1, true, false), false); // framed, nothing run: the tower stands closed
  assert.equal(facadeOpen(1, true, true), true); // framed, answers shown: the cutaway
  assert.equal(facadeOpen(0.5, true, false), true); // zoomed in opens as before
  assert.equal(facadeOpen(1.2, true, true), false); // zoomed out to the city: closed
  assert.equal(facadeOpen(0.5, false, true), false); // no real floors loaded: nothing to open to
});

// Reference cubic-bezier: bisect the x curve, then read y. Slow and plain, so it checks the fast one.
function bezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  const at = (p1: number, p2: number, s: number): number => 3 * (1 - s) ** 2 * s * p1 + 3 * (1 - s) * s * s * p2 + s ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (at(x1, x2, mid) < x) lo = mid;
    else hi = mid;
  }
  return at(y1, y2, (lo + hi) / 2);
}

test('easeGlass follows the EASE_GLASS curve in design/tokens.ts', () => {
  const [x1, y1, x2, y2] = EASE_GLASS.match(/-?[\d.]+/g)!.map(Number) as [number, number, number, number];
  assert.equal(easeGlass(0), 0);
  assert.equal(easeGlass(1), 1);
  assert.equal(easeGlass(-1), 0); // clamped
  assert.equal(easeGlass(2), 1);
  let last = 0;
  for (let t = 0.05; t < 1; t += 0.05) {
    const v = easeGlass(t);
    assert.ok(Math.abs(v - bezier(x1, y1, x2, y2, t)) < 1e-4, `t=${t}`);
    assert.ok(v >= last, 'never runs backwards');
    last = v;
  }
});

test('fade: eases in over REVEAL_MS, reverses from where it is without a jump, and is instant for reduced motion', () => {
  assert.equal(REVEAL_MS, 2 * MOTION.quickMs);
  const closed: Fade = { from: 0, to: 0, start: 0 };
  assert.equal(fadeAt(closed, 5000), 0);
  const opening = retarget(closed, 1, 1000, false);
  assert.equal(fadeAt(opening, 1000), 0);
  assert.ok(Math.abs(fadeAt(opening, 1000 + REVEAL_MS / 2) - easeGlass(0.5)) < 1e-9);
  assert.equal(fadeAt(opening, 1000 + REVEAL_MS), 1);
  assert.equal(fadeAt(opening, 1000 + 10 * REVEAL_MS), 1);
  assert.equal(retarget(opening, 1, 1100, false), opening, 'the same target does not restart the fade');

  const mid = 1000 + REVEAL_MS / 4;
  const closing = retarget(opening, 0, mid, false);
  assert.ok(Math.abs(fadeAt(closing, mid) - fadeAt(opening, mid)) < 1e-9, 'no jump when it turns round');
  assert.equal(fadeAt(closing, mid + REVEAL_MS), 0);

  const reduced = retarget(closed, 1, 1000, true);
  assert.equal(fadeAt(reduced, 1000), 1);
  assert.equal(fadeAt(retarget(reduced, 0, 1001, true), 1001), 0);
});

test('focusHeight: orbiting never moves the floor in the middle; panning up the screen climbs the tower', () => {
  const centreY = 8.84; // the framed slice's centre height
  for (let az = 0; az < 2 * Math.PI; az += Math.PI / 6) {
    for (const el of [0.1, DEFAULT_VIEW.elevation, 1.05, 1.5]) {
      assert.equal(focusHeight(centreY, { azimuth: az, elevation: el }, { x: 0, y: 0 }), centreY);
      assert.equal(focusHeight(centreY, { azimuth: az, elevation: el }, { x: 40, y: 0 }), centreY); // sideways pan
    }
  }
  // Against the geometry: the camera ray through the middle of a panned view, where it passes
  // closest to the vertical line through the framed centre.
  const centre: Vec3 = [14.25, centreY, 18.7];
  for (const view of [DEFAULT_VIEW, { azimuth: 1.1, elevation: 0.7 }, { azimuth: 4, elevation: 1.0 }]) {
    for (const pan of [{ x: 0, y: 30 }, { x: -12, y: 7 }, { x: 5, y: -20 }]) {
      const back = viewDirection(view.azimuth, view.elevation);
      const up: Vec3 = [-Math.sin(view.elevation) * Math.sin(view.azimuth), Math.cos(view.elevation), -Math.sin(view.elevation) * Math.cos(view.azimuth)];
      const right: Vec3 = [Math.cos(view.azimuth), 0, -Math.sin(view.azimuth)];
      const o = [0, 1, 2].map((i) => centre[i]! + back[i]! * 1500 + up[i]! * pan.y + right[i]! * pan.x);
      const d = back.map((v) => -v);
      const t = -((o[0]! - centre[0]) * d[0]! + (o[2]! - centre[2]) * d[2]!) / (d[0]! ** 2 + d[2]! ** 2);
      assert.ok(Math.abs(focusHeight(centreY, view, pan) - (o[1]! + d[1]! * t)) < 1e-6, JSON.stringify({ view, pan }));
    }
  }
  assert.ok(focusHeight(centreY, DEFAULT_VIEW, { x: 0, y: 30 }) > centreY);
  // Looking steeply down the gain is capped: a 3 m pan at the steepest view climbs at most 6 m, not 42.
  assert.equal(FOCUS_GAIN_MAX, 2);
  assert.ok(Math.abs(focusHeight(centreY, { azimuth: 0.3, elevation: 1.5 }, { x: 0, y: 3 }) - (centreY + 6)) < 1e-9);
});

test('cutLevel: the level nearest the focus height is the top one drawn', () => {
  const levels = [{ id: 'L1', elevation: 0 }, { id: 'L2', elevation: 9.45 }, { id: 'L3', elevation: 14.17 }, { id: 'T04', elevation: 28.35 }];
  assert.equal(cutLevel(levels, 8.8), 9.45);
  assert.equal(cutLevel(levels, 12), 14.17);
  assert.equal(cutLevel(levels, -5), 0);
  assert.equal(cutLevel(levels, 1000), 28.35);
  assert.equal(cutLevel([], 3), Infinity);
  assert.equal(cutLevel(levels, NaN), Infinity); // no view yet: nothing is cut
});

test('floorName: every level of the real tower reads "Level <n>", once each', () => {
  assert.equal(floorName('L1'), 'Level 1');
  assert.equal(floorName('L2'), 'Level 2');
  assert.equal(floorName('T04'), 'Level 4');
  assert.equal(floorName('T10'), 'Level 10');
  assert.equal(floorName('roof'), 'roof'); // an id with no number is shown as it is
  const names = real.levels.map((l) => floorName(l.id));
  for (const n of names) assert.match(n, /^Level \d+$/);
  assert.equal(new Set(names).size, names.length);
});

test('belowCut: a drop never lands on a floor that is cut away', () => {
  const cut = real.levels.find((l) => l.id === 'L2')!.elevation;
  const low = belowCut(real, cut);
  assert.ok(low.levels.every((l) => l.elevation <= cut));
  const kept = new Set(low.levels.map((l) => l.id));
  assert.ok(low.nodes.every((n) => kept.has(n.level)));
  assert.ok(low.nodes.some((n) => n.level === 'L2'));
  assert.equal(low.edges, real.edges);
  // A ray straight down onto a room high in the tower lands there on the whole building, and on a
  // floor left standing once cut.
  const high = real.nodes.find((n) => n.id === 'T85-u1')!;
  const ray = { origin: [high.box.x + high.box.width / 2, 1000, high.box.y + high.box.depth / 2] as Vec3, dir: [0, -1, 0] as Vec3 };
  const whole = dropTarget(real, ray);
  const cutDrop = dropTarget(low, ray);
  assert.equal(whole?.node, 'T85-u1');
  assert.ok(cutDrop && kept.has(cutDrop.level), `landed on ${cutDrop?.level}`);
});

test('planExtent: the rooms of the real tower span its 28.5 m footprint', () => {
  const e = planExtent(real);
  assert.equal(e.minX, 0);
  assert.equal(e.maxX, 28.5);
  assert.equal(e.minZ, 0);
  assert.ok(e.maxZ > 27 && e.maxZ <= 28.5);
  assert.deepEqual(planExtent({ ...real, nodes: [] }), { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }); // no rooms: no NaN
});

test('only levels with a drawn floor are cut to and labelled; the default view opens level 2 at any orbit', () => {
  const ids = drawnLevels(real);
  assert.ok(ids.includes('L2'), 'the slice floor with the real plan');
  assert.ok(!ids.includes('L1') && !ids.includes('L3'), 'nothing is drawn at the lobby or the plant level');
  assert.equal(ids.filter((id) => /^T\d\d$/.test(id)).length, real.levels.filter((l) => /^T\d\d$/.test(l.id)).length);
  const drawn = real.levels.filter((l) => ids.includes(l.id));
  // The framed slice: its rooms reach 3.5 m over L3 (14.17 m), so the frame centre is about 8.8 m up.
  const l3 = real.levels.find((l) => l.id === 'L3')!.elevation;
  const centreY = (0 + l3 + 3.5) / 2;
  const l2 = real.levels.find((l) => l.id === 'L2')!.elevation;
  for (let az = 0; az < 2 * Math.PI; az += Math.PI / 8) {
    for (const el of [0.1, DEFAULT_VIEW.elevation, 1.05, 1.5]) {
      assert.equal(cutLevel(drawn, focusHeight(centreY, { azimuth: az, elevation: el }, { x: 0, y: 0 })), l2);
    }
  }
  // Panning up the screen moves the open floor up the tower, one drawn level at a time.
  const t04 = real.levels.find((l) => l.id === 'T04')!.elevation;
  assert.equal(cutLevel(drawn, focusHeight(centreY, DEFAULT_VIEW, { x: 0, y: 16 })), t04);
});

test('floor tags sit left of their anchor and never overlap other text or each other', () => {
  const r = floorTagRect({ x: 300, y: 200 }, 'Level 10');
  assert.ok(r.right < 300, 'a gap between the tag and the plate corner');
  assert.equal(r.shift, 0);
  // Zoomed in close the corner leaves the screen: the label slides right onto the plate and stays.
  const edge = floorTagRect({ x: 20, y: 200 }, 'Level 10', 80);
  assert.equal(edge.left, 8);
  assert.equal(edge.right - edge.left, 80);
  assert.ok(edge.shift > 0);
  assert.ok(r.left < r.right && r.top < 200 && r.bottom > 200);

  const a = floorTagRect({ x: 300, y: 200 }, 'Level 2');
  const b = floorTagRect({ x: 300, y: 210 }, 'Level 3'); // 10 px apart: clashes with a
  const c = floorTagRect({ x: 300, y: 300 }, 'Level 4');
  const d = floorTagRect({ x: 300, y: 400 }, 'Level 5');
  const exit = { left: 250, right: 320, top: 290, bottom: 310 }; // an exit name over c
  const kept = keepFloorTags([
    { rect: a, free: true }, { rect: b, free: true }, { rect: c, free: true }, { rect: d, free: false },
  ], [exit]);
  assert.deepEqual(kept, [true, false, false, false]); // d is under a panel
});

test('while open the plant level under the next drawn floor still takes a drop (the chiller and load start there)', () => {
  const ids = drawnLevels(real);
  const drawn = real.levels.filter((l) => ids.includes(l.id));
  const l2 = real.levels.find((l) => l.id === 'L2')!.elevation;
  const t04 = real.levels.find((l) => l.id === 'T04')!.elevation;
  const ceiling = dropCeiling(drawn, l2);
  assert.ok(ceiling < t04 && ceiling > real.levels.find((l) => l.id === 'L3')!.elevation);
  assert.equal(dropCeiling(drawn, Infinity), Infinity);
  const open = belowCut(real, ceiling);
  assert.ok(open.nodes.some((n) => n.id === 'plant'));
  assert.ok(open.nodes.every((n) => !/^T\d\d$/.test(n.level)), 'no hidden tower floor takes a drop');
  // Aimed at the plant from straight above: lands on the plant, closed or open.
  const plant = real.nodes.find((n) => n.id === 'plant')!;
  const ray = { origin: [plant.box.x + plant.box.width / 2, 20, plant.box.y + plant.box.depth / 2] as Vec3, dir: [0, -1, 0] as Vec3 };
  assert.equal(dropTarget(open, ray)?.node, 'plant');
});
