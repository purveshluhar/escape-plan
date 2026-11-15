import assert from 'node:assert/strict';
import { test } from 'node:test';
import { luminance } from '../design/tokens.ts';
import { BUILDING, buildingColors, calmColor, roofOrFacade, surfaceColor } from './backdrop.ts';

// Colours come from the Cityweft descriptor on each GLB mesh (mesh extras). Field names and values:
// https://cityweft.gitbook.io/docs/basics/metadata-descriptors.md

const hsl = (hex: string): { s: number; l: number } => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { s, l };
};

test('a Cityweft colour is softened into the pale daylight band, whatever it was', () => {
  for (const rgb of [0x000000, 0xffffff, 0x006400, 0xff0000, 0x0000ff, 0xbbbbbb, 0x8a8a8a]) {
    const { s, l } = hsl(calmColor(rgb));
    // tolerances: one 8-bit step (saturation at lightness 0.9 moves about 0.02 per step)
    assert.ok(l >= 0.86 - 0.004 && l <= 0.95 + 0.004, `${rgb.toString(16)} lightness ${l}`);
    assert.ok(s <= 0.22 + 0.02, `${rgb.toString(16)} saturation ${s}`);
  }
});

test('softening keeps order (darker in, darker out) and keeps the hue family', () => {
  assert.ok(luminance(calmColor(0x000000)) < luminance(calmColor(0x808080)));
  assert.ok(luminance(calmColor(0x808080)) < luminance(calmColor(0xffffff)));
  const green = calmColor(0x006400);
  const n = parseInt(green.slice(1), 16);
  assert.ok(((n >> 8) & 255) > ((n >> 16) & 255) && ((n >> 8) & 255) > (n & 255), `green roof stays greenish: ${green}`);
  assert.equal(calmColor(0xbbbbbb), calmColor(0xbbbbbb)); // pure
});

test('nothing in the backdrop is darker than 1.25:1 against the plain building tone', () => {
  // low contrast keeps the tower and the figures the focus
  for (const rgb of [0x000000, 0x003366, 0x660000]) {
    const ratio = (luminance(BUILDING) + 0.05) / (luminance(calmColor(rgb)) + 0.05);
    assert.ok(ratio <= 1.25, `${rgb.toString(16)}: ${ratio.toFixed(2)}`);
  }
});

test('facade and roof use the Cityweft colours when the descriptor has them', () => {
  const c = buildingColors({ buildingFacadeColor: 0xf3eed8, buildingRoofColor: 0x006400, buildingFacadeMaterial: 'brick' });
  assert.equal(c.facade, calmColor(0xf3eed8));
  assert.equal(c.roof, calmColor(0x006400));
});

test('without colours, the facade and roof materials pick the tint', () => {
  const brick = buildingColors({ buildingFacadeMaterial: 'brick', buildingRoofMaterial: 'metal' });
  const glass = buildingColors({ buildingFacadeMaterial: 'glass', buildingRoofMaterial: 'tiles' });
  assert.notEqual(brick.facade, glass.facade);
  assert.notEqual(brick.roof, glass.roof);
  assert.notEqual(brick.facade, BUILDING);
});

test("a 'default' roof material, or none, takes the facade colour", () => {
  const c = buildingColors({ buildingFacadeMaterial: 'glass', buildingRoofMaterial: 'default' });
  assert.equal(c.roof, c.facade);
});

test('with only a building type (the premium tier), homes read warm and work places read cool', () => {
  const home = buildingColors({ buildingType: 'apartments' });
  const office = buildingColors({ buildingType: 'office' });
  assert.equal(home.facade, buildingColors({ buildingType: 'residential' }).facade);
  assert.equal(office.facade, buildingColors({ buildingType: 'commercial' }).facade);
  assert.notEqual(home.facade, office.facade);
  const warm = parseInt(home.facade.slice(1), 16);
  const cool = parseInt(office.facade.slice(1), 16);
  assert.ok(((warm >> 16) & 255) > (warm & 255), `home is warm: ${home.facade}`);
  assert.ok((cool & 255) > ((cool >> 16) & 255), `office is cool: ${office.facade}`);
});

test('no descriptor, an empty one, or junk values: the plain building tone, never a throw', () => {
  for (const d of [undefined, null, {}, { buildingFacadeColor: 'red', buildingRoofColor: -1, buildingType: null }, { buildingFacadeColor: 2 ** 25 }, 'x', 7]) {
    const c = buildingColors(d);
    assert.equal(c.facade, BUILDING, JSON.stringify(d));
    assert.equal(c.roof, BUILDING, JSON.stringify(d));
  }
});

test('the ground: roads a touch deeper than sidewalks, hedges green, the rest by layer name', () => {
  const road = surfaceColor({ type: 'path', pathType: 'roadway' }, 'path_12');
  const crossing = surfaceColor({ type: 'roadwayIntersection' }, 'roadwayIntersection_3');
  const footway = surfaceColor({ type: 'path', pathType: 'footway' }, 'path_13');
  const pavement = surfaceColor({ type: 'pavement' }, 'pavement_2');
  assert.equal(road, crossing);
  assert.equal(footway, pavement);
  assert.ok(luminance(road) < luminance(footway));
  const hedge = surfaceColor({ type: 'wall', wallType: 'hedge' }, 'wall_4');
  const n = parseInt(hedge.slice(1), 16);
  assert.ok(((n >> 8) & 255) > ((n >> 16) & 255), `hedge is greenish: ${hedge}`);
  assert.equal(surfaceColor({ type: 'grass' }, 'grass_3'), '#d6e3d0');
  assert.equal(surfaceColor(undefined, 'water_1'), '#c8d9e8');
});

test('each vertex takes the roof colour when its face looks up, else the facade colour', () => {
  const out = roofOrFacade([1, 0, 0.2], [0.1, 0.2, 0.3], [0.7, 0.8, 0.9]); // normal y per vertex
  assert.deepEqual([...out].map((v) => Math.round(v * 10) / 10), [0.7, 0.8, 0.9, 0.1, 0.2, 0.3, 0.1, 0.2, 0.3]);
  assert.equal(out.length, 9);
});
