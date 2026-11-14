import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nodeBoxes, STOREY_HEIGHT } from './layout.ts';
import type { Building } from '../contract/types.ts';

test('one box per node, sitting on its level', () => {
  const b = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;
  const boxes = nodeBoxes(b);
  assert.equal(boxes.length, b.nodes.length);
  const plant = boxes.find((x) => x.id === 'plant');
  assert.deepEqual(plant?.center, [3, 4 + STOREY_HEIGHT / 2, 2.5]);
});
