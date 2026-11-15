// Loads the real 432 Park for the viewer: the demo slice's apartment level, every apartment level of
// the whole tower with the plan it was given, and the facade from the package's Lightweight model.
// Browser only; the placement math is in typical-floors.ts. Resolves to null when the package is not
// on this machine, so the game keeps the plain building. Owner: P5.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Building } from '../contract/types.ts';
import { TOWER_CENTRE } from '../app/backdrop.ts';
import { TOWER_FLOORS } from './tower-floors.ts';
import {
  FACADE_URL, TYPICAL_FLOORS_URL, TYPICAL_PLAN_NODE, floorPlacement, isInterior, looksLikeGlb, towerFloors, towerSlabs,
} from './typical-floors.ts';

export interface TypicalFloor {
  object: THREE.Object3D;
  // Put the floors on the levels of this building (call again after each edit).
  place(b: Building): void;
}

// The outside of the tower from the package's complete Lightweight model, or null without it. Only
// the exterior is kept; the interior comes from our own floor plans.
async function loadFacade(): Promise<THREE.Object3D | null> {
  const res = await fetch(FACADE_URL);
  if (!res.ok) return null;
  const bytes = await res.arrayBuffer();
  if (!looksLikeGlb(bytes)) return null;
  const { scene } = await new GLTFLoader().parseAsync(bytes, '');
  const drop: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (isInterior(o.name)) drop.push(o);
  });
  for (const o of drop) o.removeFromParent();
  const facade = new THREE.Group();
  facade.name = 'facade';
  facade.add(scene);
  facade.position.set(TOWER_CENTRE.x, 0, TOWER_CENTRE.z); // the package centres the tower on the origin
  return facade;
}

export async function loadTypicalFloor(): Promise<TypicalFloor | null> {
  const res = await fetch(TYPICAL_FLOORS_URL);
  if (!res.ok) return null;
  const bytes = await res.arrayBuffer();
  if (!looksLikeGlb(bytes)) return null;
  const gltf = await new GLTFLoader().parseAsync(bytes, '');

  // The GLB lays four plans side by side. Each is a template: at the origin, with no window glass
  // (it would hide the rooms from the isometric camera). Floors are clones that share geometry.
  const templates = new Map<string, THREE.Object3D>();
  gltf.scene.traverse((o) => {
    if (/^Typical_\d_Apartment_Plan$/.test(o.name)) templates.set(o.name, o);
  });
  for (const [name, plan] of templates) {
    plan.position.set(0, 0, 0);
    plan.getObjectByName(`${name}_Windows`)?.removeFromParent();
  }
  const slice = templates.get(TYPICAL_PLAN_NODE);
  if (!slice) return null;

  // Stand-in for levels with no plan: the plan's own slab and fixed core, nothing else.
  const shell = slice.clone(true);
  for (const child of [...shell.children]) {
    if (!child.name.endsWith('_Slab') && !child.name.endsWith('_Core')) child.removeFromParent();
  }

  const object = new THREE.Group();
  object.name = 'typical-floors';
  const sliceFloor = new THREE.Group();
  sliceFloor.add(slice.clone(true));
  const tower = new THREE.Group();
  object.add(sliceFloor, tower);
  try {
    const facade = await loadFacade();
    if (facade) object.add(facade);
  } catch (err) {
    console.warn('Facade not loaded:', err); // the floors still show without it
  }

  return {
    object,
    place(b) {
      const { position, rotationY } = floorPlacement(b);
      sliceFloor.position.set(...position);
      sliceFloor.rotation.y = rotationY;

      tower.clear();
      for (const f of towerFloors(TOWER_FLOORS, b)) {
        const plan = templates.get(f.node);
        if (!plan) continue;
        const floor = new THREE.Group();
        floor.add(plan.clone(true));
        floor.position.set(...f.position);
        floor.rotation.y = f.rotationY;
        tower.add(floor);
      }
      for (const f of towerSlabs(TOWER_FLOORS, b)) {
        const floor = new THREE.Group();
        floor.add(shell.clone(true));
        floor.position.set(...f.position);
        tower.add(floor);
      }
    },
  };
}
