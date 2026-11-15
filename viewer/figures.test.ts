import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Building, Discipline } from '../contract/types.ts';
import { DISCIPLINE_STYLE } from '../design/tokens.ts';
import {
  disposeTree, figureKind, FIGURE_SHARED, loadFigureModels, makeFigure, MIN_PIXELS, WHEELCHAIR_MIN_PIXELS,
} from './figures.ts';

const building = JSON.parse(readFileSync(new URL('../data/building.json', import.meta.url), 'utf8')) as Building;

test('every token in data/building.json gets its own figure, looked up by id and discipline', () => {
  const kinds = Object.fromEntries(building.tokens.map((t) => [t.id, figureKind(t.id, t.discipline)]));
  assert.deepEqual(kinds, {
    chiller: 'chiller', glass: 'glass', wheelchair: 'wheelchair', load: 'load', sofa: 'sofa', people: 'people',
  });
});

test('later disciplines: smoke has its cloud, water and power keep the plain block', () => {
  assert.equal(figureKind('smoke', 'fire'), 'smoke');
  assert.equal(figureKind('water', 'plumbing'), 'block');
  assert.equal(figureKind('power', 'electrical'), 'block');
  // The sofa is a logistics token like the glass panel, so it goes by id.
  assert.equal(figureKind('sofa', 'logistics'), 'sofa');
  assert.equal(figureKind('crate', 'logistics'), 'glass');
});

test('before the models load, model figures use the shape fallback; the rest are code-built', () => {
  for (const t of building.tokens) {
    const f = makeFigure(t.id, t.discipline);
    const expected = ['wheelchair', 'sofa', 'people'].includes(f.kind) ? 'fallback' : 'built';
    assert.equal(f.source, expected, t.id);
    assert.ok(f.size > 0, t.id);
    assert.equal(f.color, DISCIPLINE_STYLE[t.discipline].color, t.id);
    assert.equal(`#${f.ring.color.getHexString()}`, DISCIPLINE_STYLE[t.discipline].color, t.id);
  }
});

test('a model that fails to load leaves its figure on the fallback, without throwing', async () => {
  const ok = await loadFigureModels(async () => {
    throw new Error('404');
  });
  assert.equal(ok, false);
  const f = makeFigure('wheelchair', 'accessibility');
  assert.equal(f.source, 'fallback');
  f.setMotion('moving');
  f.tick(0.016);
  f.setHeading(1);
  f.dispose();
});

test('the wheelchair is drawn at 80 px at least, every other figure at 64 px', () => {
  const disciplines: Discipline[] = ['mep', 'logistics', 'structure', 'life_safety', 'fire'];
  assert.equal(makeFigure('wheelchair', 'accessibility').minPixels, WHEELCHAIR_MIN_PIXELS);
  assert.equal(WHEELCHAIR_MIN_PIXELS, 80);
  for (const d of disciplines) assert.equal(makeFigure(d, d).minPixels, MIN_PIXELS);
  assert.equal(MIN_PIXELS, 64);
});

// Stand-in model data in Kenney units (a character is 0.67 tall; the sofa's origin is a corner).
function fakeModel(url: string): GLTF {
  const scene = new THREE.Group();
  const sofa = url.includes('loungeSofa');
  const geo = sofa ? new THREE.BoxGeometry(0.98, 0.46, 0.41).translate(0.49, 0.23, -0.205) : new THREE.BoxGeometry(0.4, 0.67, 0.3).translate(0, 0.335, 0);
  scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ name: sofa ? 'carpet' : 'colormap' })));
  return { scene, animations: [] } as unknown as GLTF;
}

test('loaded models stand in real metres: people 1.7 m tall, the sofa 2.2 m long and centred', async () => {
  assert.equal(await loadFigureModels(async (url) => fakeModel(url)), true);
  const height = (f: ReturnType<typeof makeFigure>): number => new THREE.Box3().setFromObject(f.object.children[0]!).getSize(new THREE.Vector3()).y;
  const people = makeFigure('people', 'life_safety');
  const chair = makeFigure('wheelchair', 'accessibility');
  const sofa = makeFigure('sofa', 'logistics');
  for (const f of [people, chair, sofa]) assert.equal(f.source, 'model', f.kind);
  assert.ok(Math.abs(height(people) - 1.7) < 0.01, `people ${height(people)}`);
  assert.ok(Math.abs(height(chair) - 1.3) < 0.01, `wheelchair ${height(chair)}`);
  assert.ok(Math.abs(sofa.size - 2.2) < 0.01, `sofa ${sofa.size}`);
  const c = new THREE.Box3().setFromObject(sofa.object.children[0]!).getCenter(new THREE.Vector3());
  assert.ok(Math.abs(c.x) < 0.01 && Math.abs(c.z) < 0.01, `sofa centre ${c.x}, ${c.z}`);
  assert.equal(chair.minPixels, WHEELCHAIR_MIN_PIXELS);
  // Freeing a model figure keeps the model data every other figure shares.
  let freed = 0;
  sofa.object.traverse((o) => {
    if (o instanceof THREE.Mesh && FIGURE_SHARED.has(o.geometry)) o.geometry.addEventListener('dispose', () => freed++);
  });
  sofa.dispose();
  disposeTree(sofa.object, new Set());
  assert.equal(freed, 0);
});

test('disposeTree frees what a figure owns, never the shared model data, and frees bone textures', () => {
  const sharedGeo = new THREE.BoxGeometry();
  const sharedMat = new THREE.MeshLambertMaterial();
  FIGURE_SHARED.add(sharedGeo).add(sharedMat);
  const ownGeo = new THREE.BoxGeometry();
  const ownMat = new THREE.MeshBasicMaterial();
  const freed: string[] = [];
  sharedGeo.addEventListener('dispose', () => freed.push('sharedGeo'));
  sharedMat.addEventListener('dispose', () => freed.push('sharedMat'));
  ownGeo.addEventListener('dispose', () => freed.push('ownGeo'));
  ownMat.addEventListener('dispose', () => freed.push('ownMat'));
  const bone = new THREE.Bone();
  const skinned = new THREE.SkinnedMesh(sharedGeo, sharedMat);
  skinned.add(bone);
  skinned.bind(new THREE.Skeleton([bone]));
  let skeletonFreed = false;
  skinned.skeleton.dispose = () => { skeletonFreed = true; };
  const root = new THREE.Group();
  root.add(new THREE.Mesh(ownGeo, ownMat), skinned);
  disposeTree(root, new Set());
  assert.deepEqual(freed.sort(), ['ownGeo', 'ownMat']);
  assert.equal(skeletonFreed, true);
  FIGURE_SHARED.delete(sharedGeo);
  FIGURE_SHARED.delete(sharedMat);
});
