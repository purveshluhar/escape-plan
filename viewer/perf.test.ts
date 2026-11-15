import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perfEnabled, perfLine, percentile } from './perf.ts';

test('the perf overlay is on only with ?perf in the address', () => {
  assert.equal(perfEnabled('?perf'), true);
  assert.equal(perfEnabled('?a=1&perf=1'), true);
  assert.equal(perfEnabled(''), false);
  assert.equal(perfEnabled('?performance'), false);
});

test('percentiles of frame times', () => {
  assert.equal(percentile([], 0.5), 0);
  assert.equal(percentile([5, 1, 3], 0.5), 3);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95), 10);
});

test('the overlay line names frame time, fps, script time and the GPU work', () => {
  const line = perfLine({ frames: [16, 17, 16, 40], script: [1, 2, 1, 3], calls: 182, triangles: 187_000 });
  assert.equal(line, 'frame p50 17.0 ms, p95 40.0 ms (45 fps) | script p50 2.0 ms | 182 draw calls, 187k triangles');
});
