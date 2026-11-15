// Low-poly token figures built from three.js shapes: a wheelchair, a sofa and a small group of
// people, in the discipline colour, standing on a white disc. No model files. Owner: P2.
// Units are metres; each figure stands on y = 0, centred on x = z = 0.
import * as THREE from 'three';
import type { Discipline, Id } from '../contract/types.ts';
import { DISCIPLINE_STYLE } from '../design/tokens.ts';

export interface Figure {
  object: THREE.Group;
  size: number; // metres: the figure's largest side, for scaling it to the screen
  ring: THREE.MeshBasicMaterial; // the disc's rim; the viewer recolours it for the selected token
  color: string; // the discipline colour the rim goes back to
}

const DARK = '#1f2533'; // tyres and seat cushions: a dark neutral so the colour reads on the frame

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

function wheelchair(body: THREE.Material, dark: THREE.Material): THREE.Object3D[] {
  const wheel = new THREE.TorusGeometry(0.3, 0.05, 6, 18).rotateY(Math.PI / 2);
  const caster = new THREE.SphereGeometry(0.07, 8, 6);
  const tube = new THREE.CylinderGeometry(0.025, 0.025, 1, 6);
  const parts: THREE.Object3D[] = [
    mesh(wheel, dark, -0.32, 0.32, -0.05), mesh(wheel, dark, 0.32, 0.32, -0.05),
    mesh(caster, dark, -0.24, 0.07, 0.38), mesh(caster, dark, 0.24, 0.07, 0.38),
    mesh(new THREE.BoxGeometry(0.56, 0.08, 0.5), body, 0, 0.52, 0.05), // seat
    mesh(new THREE.BoxGeometry(0.56, 0.52, 0.07), body, 0, 0.84, -0.22), // back
    mesh(new THREE.BoxGeometry(0.44, 0.04, 0.16), body, 0, 0.14, 0.46), // footrest
  ];
  for (const x of [-0.25, 0.25]) {
    const leg = mesh(tube, body, x, 0.33, 0.36);
    leg.scale.y = 0.4;
    leg.rotation.x = -0.35;
    parts.push(leg);
  }
  return parts;
}

function sofa(body: THREE.Material, dark: THREE.Material): THREE.Object3D[] {
  return [
    mesh(new THREE.BoxGeometry(2.1, 0.36, 0.9), body, 0, 0.26, 0), // base
    mesh(new THREE.BoxGeometry(2.1, 0.52, 0.22), body, 0, 0.66, -0.34), // back
    mesh(new THREE.BoxGeometry(0.22, 0.32, 0.9), body, -0.94, 0.6, 0), // arms
    mesh(new THREE.BoxGeometry(0.22, 0.32, 0.9), body, 0.94, 0.6, 0),
    mesh(new THREE.BoxGeometry(0.8, 0.12, 0.62), dark, -0.42, 0.5, 0.08), // cushions
    mesh(new THREE.BoxGeometry(0.8, 0.12, 0.62), dark, 0.42, 0.5, 0.08),
    ...[-0.9, 0.9].flatMap((x) => [-0.32, 0.32].map((z) => mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), dark, x, 0.04, z))),
  ];
}

function people(body: THREE.Material, dark: THREE.Material): THREE.Object3D[] {
  const torso = new THREE.CapsuleGeometry(0.22, 0.7, 3, 8);
  const head = new THREE.SphereGeometry(0.19, 10, 8);
  const spots: [number, number, number][] = [[0, 0, -0.25], [-0.42, 0, 0.2], [0.42, 0, 0.2]];
  return spots.flatMap(([x, , z], i) => {
    const s = i === 0 ? 1 : 0.88; // one adult and two shorter people
    const group = new THREE.Group();
    group.add(mesh(torso, body, 0, 0.6, 0), mesh(head, dark, 0, 1.38, 0));
    group.position.set(x, 0, z);
    group.scale.setScalar(s);
    return [group];
  });
}

// A plain block for a discipline with no figure of its own yet (chiller, glass, load and later).
function block(body: THREE.Material): THREE.Object3D[] {
  return [mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), body, 0, 0.45, 0)];
}

const SHAPES: Partial<Record<Discipline, (body: THREE.Material, dark: THREE.Material) => THREE.Object3D[]>> = {
  accessibility: wheelchair,
  life_safety: people,
};

// The figure for a token. The sofa is a logistics token like the glass panel, so it goes by id.
export function makeFigure(token: Id, discipline: Discipline): Figure {
  const color = DISCIPLINE_STYLE[discipline].color;
  const body = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: DARK });
  const shape = token === 'sofa' ? sofa : SHAPES[discipline] ?? ((m: THREE.Material) => block(m));
  const object = new THREE.Group();
  object.add(...shape(body, dark));

  const box = new THREE.Box3().setFromObject(object);
  const span = box.getSize(new THREE.Vector3());
  const radius = Math.max(span.x, span.z) / 2 + 0.25;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.92 }));
  disc.position.y = 0.01;
  const ring = new THREE.MeshBasicMaterial({ color });
  const rim = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.09, 28).rotateX(-Math.PI / 2), ring);
  rim.position.y = 0.02;
  object.add(disc, rim);
  return { object, size: Math.max(span.x, span.y, span.z), ring, color };
}

// Light for the figures: the route scene is otherwise unlit, and flat colour hides their shape.
export function figureLights(): THREE.Object3D[] {
  const sun = new THREE.DirectionalLight('#ffffff', 1.6);
  sun.position.set(-40, 100, 60);
  return [new THREE.HemisphereLight('#ffffff', '#8a93a6', 1.9), sun];
}
