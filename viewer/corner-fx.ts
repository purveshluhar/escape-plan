// The corner diagram for a sofa or glass panel turning at an edge with corner_a and corner_b
// (design/motion.md 2.2): ghosts of the two corridor legs, and for a jam the three contact points and
// a dashed line with the longest thing that fits. Two draw calls at most. Owner: P2.
// It is a diagram of the edge's two numbers, not the real plan. Built in metres around the door
// point; the viewer scales it with the figure, so the figure and the walls always match.
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ACCENT, FAIL, MOTION, TEXT_MUTED } from '../design/tokens.ts';
import { bindTurn, contacts, cornerFrame, longestLine, toPlan } from './corner.ts';
import type { Frame, P2 } from './corner.ts';
import type { CornerAt } from './timeline.ts';

const LEG = 3; // metres of each corridor leg drawn behind and ahead of the corner
const WALL = 0.06; // ghost wall thickness
// The walls are drawn as low kerbs, not full height: from the default camera a full-height ghost
// covers the object it explains.
const KERB = 0.35;
const WALL_OPACITY = 0.55;
const DASH = 0.14, GAP = 0.1, DASH_RADIUS = 0.035;
const DOT = 0.1; // contact dot radius

export interface CornerFx {
  object: THREE.Group; // place at the door point, at the figure's base; scale with the figure
  frame: Frame;
  bind: number | null; // the turn where the object binds, radians; null when it turns the corner
  // ghost: 0 to 1 opacity of the walls. pulse: seconds since the contacts appeared, or null to hide
  // them (Infinity: steady). line: whether the longest-that-fits line and its label show.
  show(ghost: number, pulse: number | null, line: boolean): void;
  dispose(): void;
}

export function makeCornerFx(at: CornerAt, objectHeight: number, reduced: boolean): CornerFx {
  const c = at.corner;
  const frame = cornerFrame(at.door, at.inDir, at.outDir, c);
  const local = (p: P2): P2 => {
    const q = toPlan(frame, p);
    return [q[0] - at.door[0], q[1] - at.door[1]];
  };
  const object = new THREE.Group();
  const owned: { dispose(): void }[] = [];

  // Ghost walls: outer and inner wall of each leg, merged into one mesh.
  const walls: [P2, P2][] = [
    [[-LEG, c.a], [c.b, c.a]], [[-LEG, 0], [0, 0]], // leg A: outer, inner
    [[c.b, c.a], [c.b, -LEG]], [[0, 0], [0, -LEG]], // leg B: outer, inner
  ];
  const parts = walls.map(([p, q]) => {
    const [a, b] = [local(p), local(q)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return new THREE.BoxGeometry(len, KERB, WALL)
      .rotateY(Math.atan2(-(b[1] - a[1]), b[0] - a[0]))
      .translate((a[0] + b[0]) / 2, KERB / 2, (a[1] + b[1]) / 2);
  });
  const wallGeo = mergeGeometries(parts)!;
  for (const g of parts) g.dispose();
  const wallMat = new THREE.MeshBasicMaterial({ color: TEXT_MUTED, transparent: true, opacity: 0, depthWrite: false });
  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  wallMesh.renderOrder = 1;
  object.add(wallMesh);
  owned.push(wallGeo, wallMat);

  const bind = bindTurn(c);
  // The jam's marks, one instanced mesh (one draw call): three red contact dots, then the dashes of
  // the longest-that-fits line in the accent colour. Drawn over the object, so it never hides them.
  let marks: THREE.InstancedMesh | null = null;
  let label: CSS2DObject | null = null;
  const m = new THREE.Matrix4();
  const still = new THREE.Quaternion();
  const size = new THREE.Vector3();
  const dotAt: THREE.Vector3[] = [];
  if (bind !== null) {
    const top = objectHeight + 0.08; // over the object, so the marks read against it
    for (const p of contacts(c, bind)) {
      const [x, z] = local(p);
      dotAt.push(new THREE.Vector3(x, top, z));
    }
    const line = longestLine(c);
    const [a, b] = [local(line.from), local(line.to)];
    const dir = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]);
    const len = dir.length();
    dir.normalize();
    const n = Math.max(1, Math.floor((len + GAP) / (DASH + GAP)));
    const geo = new THREE.SphereGeometry(1, 10, 6); // unit sphere: dots scale to DOT, dashes stretch along the line
    const mat = new THREE.MeshBasicMaterial({ depthTest: false });
    marks = new THREE.InstancedMesh(geo, mat, 3 + n);
    marks.renderOrder = 3;
    const red = new THREE.Color(FAIL), accent = new THREE.Color(ACCENT);
    for (let i = 0; i < 3; i++) marks.setColorAt(i, red);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    const step = n > 1 ? (len - DASH) / (n - 1) : 0;
    for (let i = 0; i < n; i++) {
      const s = DASH / 2 + i * step;
      m.compose(new THREE.Vector3(a[0] + dir.x * s, top, a[1] + dir.z * s), q, new THREE.Vector3(DASH / 2, DASH_RADIUS, DASH_RADIUS));
      marks.setMatrixAt(3 + i, m);
      marks.setColorAt(3 + i, accent);
    }
    owned.push(geo, mat);
    object.add(marks);

    const el = document.createElement('div');
    el.className = 'ep-fits';
    el.append(document.createElement('span'));
    el.firstElementChild!.textContent = `Longest that fits: ${line.length.toFixed(1)} m`;
    label = new CSS2DObject(el);
    label.position.set((a[0] + b[0]) / 2, top, (a[1] + b[1]) / 2);
    object.add(label);
  }

  function show(ghost: number, pulse: number | null, line: boolean): void {
    wallMat.opacity = WALL_OPACITY * Math.min(1, Math.max(0, ghost));
    wallMesh.visible = ghost > 0;
    if (marks) {
      marks.visible = pulse !== null || line;
      // Two pulses at contactPulseHz, then steady; hidden (scale 0) until the object binds.
      const f = MOTION.contactPulseHz;
      const grow = pulse === null || reduced || pulse >= 2 / f ? 0 : Math.max(0, Math.sin(2 * Math.PI * f * pulse));
      size.setScalar(pulse === null ? 0 : DOT * (1 + 0.6 * grow));
      dotAt.forEach((p, i) => marks!.setMatrixAt(i, m.compose(p, still, size)));
      marks.instanceMatrix.needsUpdate = true;
    }
    if (label) label.visible = line;
  }
  show(0, null, false);

  return {
    object, frame, bind, show,
    dispose() {
      label?.element.remove();
      for (const o of owned) o.dispose();
    },
  };
}
