// Loads the fetched Cityweft block (git-ignored data/cityweft/) for the viewer's backdrop. Browser
// only; the placement math is in backdrop.ts. Resolves to null when the block is not on this
// machine (a fresh clone, or a build: neither has data/cityweft/); the game then has no ground
// under the tower. Owner: P3.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CUT_HEIGHT, backdropMatrix, coversPoint, layerColor, metaToBlock } from './backdrop.ts';

const BASE = '/data/cityweft/';
const CUT = [new THREE.Plane(new THREE.Vector3(0, -1, 0), CUT_HEIGHT)]; // keeps y <= CUT_HEIGHT

// Move the cut (viewer metres above the ground); every block material shares this plane.
export function setCutHeight(height: number): void {
  CUT[0]!.constant = height;
}

interface Meta {
  local: { target: { x: number; z: number } };
}

async function readMeta(): Promise<Meta | null> {
  try {
    const res = await fetch(`${BASE}meta.json`);
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    const meta = (await res.json()) as Meta;
    return meta?.local?.target ? meta : null;
  } catch {
    return null;
  }
}

export async function loadBackdrop(): Promise<THREE.Object3D | null> {
  const meta = await readMeta();
  if (!meta) return null;
  const gltf = await new GLTFLoader().loadAsync(`${BASE}block.glb`);
  const block = gltf.scene;
  block.updateMatrixWorld(true);
  const target = metaToBlock(meta.local.target);

  // The real 432 Park Avenue: the building whose footprint covers the target. Our own model stands
  // in its place, so it is cut, and its footprint centre and base anchor the whole block.
  let tower: { mesh: THREE.Object3D; box: THREE.Box3 } | null = null;
  const mats = new Map<string, THREE.Material>();
  block.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const name = o.name || o.parent?.name || '';
    if (/buildings/i.test(name)) {
      const box = new THREE.Box3().setFromObject(o);
      const covers = coversPoint({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z }, target);
      if (covers && (!tower || box.max.y > tower.box.max.y)) tower = { mesh: o, box };
    }
    const color = layerColor(name);
    let mat = mats.get(color);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, clippingPlanes: CUT });
      mats.set(color, mat);
    }
    o.material = mat;
  });

  const found = tower as { mesh: THREE.Object3D; box: THREE.Box3 } | null;
  const anchor = found
    ? { x: (found.box.min.x + found.box.max.x) / 2, z: (found.box.min.z + found.box.max.z) / 2 }
    : target;
  const groundY = found ? found.box.min.y : 0;
  found?.mesh.removeFromParent();

  const placed = new THREE.Group();
  placed.name = 'cityweft-backdrop';
  placed.matrixAutoUpdate = false;
  placed.matrix.fromArray(backdropMatrix(anchor, groundY));
  placed.add(block);
  placed.userData = { removedTower: found?.mesh.name ?? null, anchor, groundY };
  return placed;
}
