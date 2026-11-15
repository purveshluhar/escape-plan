import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lMax } from '../solver/corner-turn.ts';
import {
  bindTurn, bodyPose, contacts, cornerFrame, fitLength, longestLine, toPlan, worstTurn,
} from './corner.ts';
import type { Corner } from './corner.ts';

const deg = (r: number): number => (r * 180) / Math.PI;
const near = (a: number, b: number, eps: number, what: string): void =>
  assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} is not within ${eps} of ${b}`);

// Lobby door in data/building.json: corner_a 1.2 m, corner_b 1.5 m. Sofa 0.9 x 2.2 m. Glass 0.05 x 4 m.
const sofa: Corner = { a: 1.2, b: 1.5, w: 0.9, length: 2.2 };
const glass: Corner = { a: 1.2, b: 1.5, w: 0.05, length: 4 };
const widened = (c: Corner): Corner => ({ ...c, a: 1.6, b: 1.6 }); // the "Widen lobby door to 1.6 m" fix

// Inside the L: leg A is y in [0, a] for x <= b, leg B is x in [0, b] for y <= a.
const inside = ([x, y]: [number, number], c: Corner): boolean => {
  const e = 1e-6;
  return (x <= c.b + e && y >= -e && y <= c.a + e) || (x >= -e && x <= c.b + e && y <= c.a + e);
};

test('the tightest angle and its length are the solver\'s own L_max', () => {
  for (const c of [sofa, glass, widened(sofa), widened(glass)]) {
    const worst = worstTurn(c);
    near(worst.length, lMax(c.a, c.b, c.w), 1e-9, 'longest that fits');
  }
  // The solver measures t from the leg after the turn (50.9 deg); as a turn from leg A that is 39.1 deg.
  near(deg(worstTurn(sofa).u), 39.1, 0.05, 'sofa tightest turn');
  near(worstTurn(sofa).length, 1.9967, 1e-4, 'sofa L_max');
});

test('the sofa jams at about 23 deg of turn at the lobby door; the glass at about 30 deg', () => {
  near(deg(bindTurn(sofa)!), 22.9, 0.05, 'sofa bind');
  near(deg(bindTurn(glass)!), 30.3, 0.05, 'glass bind');
  near(fitLength(sofa, bindTurn(sofa)!), sofa.length, 0.01, 'at the bind it just fits');
});

test('after the widen fix nothing binds, and the pose stays inside the corner at every angle', () => {
  for (const c of [widened(sofa), widened(glass)]) {
    assert.equal(bindTurn(c), null);
    for (let i = 0; i <= 900; i++) {
      const pose = bodyPose(c, ((i / 10) * Math.PI) / 180);
      for (const p of pose.corners) assert.ok(inside(p, c), `${i / 10} deg: ${p}`);
    }
  }
});

test('without the fix the sofa cannot reach the tightest angle without leaving the corner', () => {
  const pose = bodyPose(sofa, worstTurn(sofa).u);
  assert.ok(pose.corners.some((p) => !inside(p, sofa)));
});

test('at the bind the three contacts sit on the outer wall of A, the inner corner and the outer wall of B', () => {
  const [outerA, inner, outerB] = contacts(sofa, bindTurn(sofa)!);
  near(outerA![1], sofa.a, 0.02, 'outer wall A');
  assert.deepEqual(inner, [0, 0]);
  near(outerB![0], sofa.b, 0.02, 'outer wall B');
});

test('the longest-that-fits line runs wall to wall and is L_max long', () => {
  const line = longestLine(sofa);
  near(line.length, lMax(sofa.a, sofa.b, sofa.w), 1e-9, 'length');
  near(Math.hypot(line.to[0] - line.from[0], line.to[1] - line.from[1]), line.length, 1e-9, 'drawn length');
  near(line.from[1], sofa.a, 1e-9, 'starts on outer wall A');
  near(line.to[0], sofa.b, 1e-9, 'ends on outer wall B');
});

test('the corner frame puts the sofa at the door at 0 deg and turns its axis from the way in to the way out', () => {
  const door: [number, number] = [10, 20];
  const frame = cornerFrame(door, [0, 1], [1, 0], sofa); // comes in along +z, leaves along +x
  const at0 = toPlan(frame, bodyPose(sofa, 0).centre);
  near(at0[0], door[0], 1e-9, 'x');
  near(at0[1], door[1], 1e-9, 'z');
  const ax0 = bodyPose(sofa, 0).axis, ax90 = bodyPose(sofa, Math.PI / 2).axis;
  const dir = (v: [number, number]): [number, number] => {
    const p = toPlan(frame, v), o = toPlan(frame, [0, 0]);
    return [p[0] - o[0], p[1] - o[1]];
  };
  assert.deepEqual(dir(ax0).map((v) => Math.round(v * 1e9) / 1e9 || 0), [0, 1]);
  assert.deepEqual(dir(ax90).map((v) => Math.round(v * 1e9) / 1e9 || 0), [1, 0]);
});
