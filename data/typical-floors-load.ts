// Loads the real 432 Park for the viewer: the demo slice's apartment level, every apartment level of
// the whole tower with the plan it was given, and the facade from the package's Lightweight model.
// Browser only; the placement math is in typical-floors.ts. Resolves to null when the package is not
// on this machine, so the game keeps the plain building. Owner: P5.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Building } from '../contract/types.ts';
import { fadeMaterials } from '../viewer/fade.ts';
import { TOWER_CENTRE } from '../app/backdrop.ts';
import { TOWER_FLOORS } from './tower-floors.ts';
import {
  FACADE_URL, TYPICAL_FLOORS_URL, TYPICAL_PLAN_NODE, cutWallScale, floorPlacement, isCutWall, isInterior, looksLikeGlb, plantBandElevations,
  towerFloors, towerSlabs, windowModuleAt,
} from './typical-floors.ts';

// An open mechanical band (typical-floors.ts plantBandElevations): the window module's glass is left
// out, and its openings get louvres, slate slats in front of a dark plant space, in the glass's place.
const LOUVRE_SLAT = new THREE.MeshLambertMaterial({ color: '#5b6574' });
const LOUVRE_BACK = new THREE.MeshBasicMaterial({ color: '#2a313b' });
const WINDOW_HALF = 14.0; // the glass plane, metres from the tower centre (the grid's face is at 14.25)
const OPENING = { bottom: 0.66, top: 3.71 }; // the window opening within its 4.72 m module
const SLAT = new THREE.BoxGeometry(2 * WINDOW_HALF - 0.5, 0.12, 0.22); // short of the corners, where the faces meet
const BACK = new THREE.PlaneGeometry(2 * WINDOW_HALF, OPENING.top - OPENING.bottom);
// A lid at the top of the band, in the slab's grey: looking down through the glass above, the far
// side's louvres would show through the empty tower; the lid stands in for the floor above.
const LID = new THREE.PlaneGeometry(2 * WINDOW_HALF, 2 * WINDOW_HALF);
const LOUVRE_LID = new THREE.MeshLambertMaterial({ color: '#d9dde3' });

function louvreBand(elevation: number): THREE.Object3D {
  const band = new THREE.Group();
  band.name = 'plant-louvres';
  for (let side = 0; side < 4; side++) {
    const face = new THREE.Group();
    face.rotation.y = (side * Math.PI) / 2;
    for (let y = OPENING.bottom + 0.15; y < OPENING.top; y += 0.38) {
      const s = new THREE.Mesh(SLAT, LOUVRE_SLAT);
      s.position.set(0, y, WINDOW_HALF - 0.05);
      s.rotation.x = 0.5; // the outer edge tilted down, as louvres are
      face.add(s);
    }
    const dark = new THREE.Mesh(BACK, LOUVRE_BACK);
    dark.position.set(0, (OPENING.bottom + OPENING.top) / 2, WINDOW_HALF - 0.6);
    face.add(dark);
    band.add(face);
  }
  const lid = new THREE.Mesh(LID, LOUVRE_LID);
  lid.rotation.x = -Math.PI / 2;
  lid.position.y = OPENING.top + 0.2;
  band.add(lid);
  band.position.y = elevation;
  return band;
}

export interface TypicalFloor {
  object: THREE.Object3D;
  // Put the floors on the levels of this building (call again after each edit).
  place(b: Building): void;
  // Open the outside (the viewer's onReveal): the facade fades out by `amount` (0 = solid, 1 = gone),
  // and while it is open at all, the floors above elevation `cut` are hidden so the plan at `cut` shows,
  // its walls cut low (typical-floors.ts CUT_WALL_HEIGHT).
  reveal(amount: number, cut: number): void;
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
  let facade: THREE.Object3D | null = null;
  try {
    facade = await loadFacade();
    if (facade) object.add(facade);
  } catch (err) {
    console.warn('Facade not loaded:', err); // the floors still show without it
  }

  // The walls of each floor that are cut low when it is the open one, with their full height. The
  // plans are z up inside their node (the node turns them y up), standing on z = 0.
  const walls = new Map<THREE.Object3D, { mesh: THREE.Object3D; height: number }[]>();
  const wallsOf = (floor: THREE.Object3D): { mesh: THREE.Object3D; height: number }[] => {
    let list = walls.get(floor);
    if (!list) {
      list = [];
      floor.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || !isCutWall(o.name)) return;
        const g = o.geometry as THREE.BufferGeometry;
        if (!g.boundingBox) g.computeBoundingBox();
        list!.push({ mesh: o, height: g.boundingBox!.max.z }); // the scale is about the floor (z = 0), so the top is the height
      });
      walls.set(floor, list);
    }
    return list;
  };

  let open = { amount: 0, cut: Infinity };
  const showFloors = (): void => {
    for (const floor of [sliceFloor, ...tower.children]) {
      floor.visible = open.amount <= 0 || floor.position.y <= open.cut + 1e-6;
      // Only the open floor is cut low; the floors under it and every floor while the facade is shut
      // keep their full walls.
      const isOpen = open.amount > 0 && Math.abs(floor.position.y - open.cut) < 1e-3;
      for (const w of wallsOf(floor)) w.mesh.scale.z = isOpen ? cutWallScale(w.height, open.amount) : 1;
    }
  };

  return {
    object,
    place(b) {
      const { position, rotationY } = floorPlacement(b);
      sliceFloor.position.set(...position);
      sliceFloor.rotation.y = rotationY;

      tower.clear();
      for (const k of [...walls.keys()]) if (k !== sliceFloor) walls.delete(k);
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
      showFloors(); // an edit while the facade is open keeps the cut

      if (facade) {
        const bands = plantBandElevations(b);
        const bare = new Set(bands.map(windowModuleAt));
        facade.traverse((o) => {
          if (/^Windows_Module_\d{3}$/.test(o.name)) o.visible = !bare.has(o.name);
        });
        for (const old of facade.children.filter((o) => o.name === 'plant-louvres')) facade.remove(old);
        // The facade group sits at the tower centre, so the band is drawn about its origin.
        for (const e of bands) facade.add(louvreBand(e));
        fadeMaterials(facade, 1 - open.amount); // new louvres take the facade's fade now
      }
    },
    reveal(amount, cut) {
      open = { amount, cut };
      showFloors();
      if (!facade) return;
      facade.visible = amount < 1;
      fadeMaterials(facade, 1 - amount);
    },
  };
}
