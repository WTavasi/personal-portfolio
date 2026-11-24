import * as THREE from 'three';
import { Kit } from './kit.js';

// Backstage, behind the stage door on the right: Services. The door stands open onto a long
// corridor that runs away from the stage, out past the hall's wall, in the hall's own warm wood:
// maple panelling with a mahogany band, crimson carpet with brass threshold strips, warm ceiling
// lights, doors along both sides (one ajar, lit), a bay of flight cases, and double doors under a
// lit sign at the far end. It is only seen through the doorway, so it only has to look like it
// leads somewhere.
//
// The hall's lights do not reach in here, so its colours are drawn unlit, as its own lamps show
// them. The lamps come up when Services is chosen and go down when the visitor leaves
// (setLit, from the hall).

export const BACKSTAGE = {
  floor: 1.0, // stage level
  height: 2.3, // floor to ceiling
  x0: 11.3, // the doorway (the back of the hall's panelling)
  x1: 20.5, // the double doors at the far end
  z: -10.4, // the corridor's centre line
  half: 0.9, // half its width
  door: { z: -10.4, w: 1.45, h: 2.2 }, // the stage door, from the stage floor
};

// The hall's palette (maple, mahogany, walnut, crimson), as the corridor's warm lamps show it.
const C = {
  wall: 0xc9925a,
  wallFar: 0xb37e4a,
  band: 0x6b3520,
  skirting: 0x45261a,
  ceiling: 0x7a4e2e,
  carpet: 0x6e2026,
  strip: 0xc99a48,
  light: 0xffe2b0,
  door: 0x8a4a2a,
  frame: 0x5a2f1c,
  handle: 0xc99a48,
  glass: 0xffd9a8,
  sign: 0x3fae6a,
  caseRed: 0x7e2328,
  caseBlack: 0x232326,
  caseEdge: 0xc2c0b8,
};

export function buildBackstage(scene) {
  const k = new Kit();
  const { floor: f, height: h, x1, z, half } = BACKSTAGE;
  // Everything starts a little behind the hall's panelling, so nothing shows through it.
  const x0 = BACKSTAGE.x0 + 0.04;
  const top = f + h;
  const len = x1 - x0;
  const mx = (x0 + x1) / 2;
  const zL = z - half; // the left wall, as you look down the corridor
  const zR = z + half;

  // Floor, ceiling and the far end.
  k.box(len, 0.04, half * 2, C.carpet, mx, f + 0.02, z);
  k.box(len, 0.04, half * 2 + 0.1, C.ceiling, mx, top, z);
  for (let x = x0 + 1.6; x < x1 - 0.5; x += 2.6) k.box(0.05, 0.006, half * 2, C.strip, x, f + 0.043, z);

  // The walls, with a skirting board and a maroon band at shoulder height. The right wall has an
  // opening into a bay of flight cases.
  const bay = [15.2, 17.2]; // along x
  const wall = (z0, from, to, colour = C.wall) => {
    const w = to - from;
    const m = (from + to) / 2;
    k.box(w, h, 0.06, colour, m, f + h / 2, z0);
    k.box(w, 0.1, 0.07, C.skirting, m, f + 0.05, z0 + (z0 < z ? 0.01 : -0.01));
    k.box(w, 0.12, 0.07, C.band, m, f + 1.25, z0 + (z0 < z ? 0.01 : -0.01));
  };
  wall(zL, x0, x1);
  wall(zR, x0, bay[0]);
  wall(zR, bay[1], x1);
  k.box(bay[1] - bay[0], h - 2.25, 0.06, C.wall, (bay[0] + bay[1]) / 2, f + 2.25 + (h - 2.25) / 2, zR); // over the opening

  // The bay: a short room off to the right with flight cases on castors.
  const bz = zR + 1.0;
  k.box(bay[1] - bay[0], 0.04, 2.0, C.carpet, (bay[0] + bay[1]) / 2, f + 0.02, bz);
  k.box(bay[1] - bay[0], h, 0.06, C.wallFar, (bay[0] + bay[1]) / 2, f + h / 2, zR + 2.0);
  for (const x of bay) k.box(0.06, h, 2.0, C.wallFar, x, f + h / 2, bz);
  k.box(bay[1] - bay[0], 0.04, 2.0, C.ceiling, (bay[0] + bay[1]) / 2, top, bz);
  const flightCase = (cx, cy, cz, w, hh, d, colour) => {
    k.box(w, hh, d, colour, cx, cy + hh / 2 + 0.06, cz);
    for (const dy of [0.02, hh - 0.02]) k.box(w + 0.02, 0.03, d + 0.02, C.caseEdge, cx, cy + 0.06 + dy, cz);
    for (const dx of [-w / 2, w / 2]) for (const dz of [-d / 2, d / 2]) k.box(0.03, hh, 0.03, C.caseEdge, cx + dx, cy + hh / 2 + 0.06, cz + dz);
    for (const dx of [-w / 2 + 0.06, w / 2 - 0.06]) k.box(0.05, 0.06, 0.05, 0x222222, cx + dx, cy + 0.03, cz + d / 2 - 0.06);
  };
  flightCase(bay[0] + 0.5, f, zR + 1.45, 0.8, 1.1, 0.7, C.caseRed);
  flightCase(bay[0] + 0.5, f + 1.16, zR + 1.45, 0.7, 0.5, 0.6, C.caseBlack);
  flightCase(bay[1] - 0.55, f, zR + 1.5, 0.75, 0.8, 0.65, C.caseBlack);
  flightCase(bay[1] - 0.6, f, zR + 0.6, 0.6, 0.55, 0.55, C.caseRed);
  // And one in the corridor, by the stage door, as if just wheeled out.
  flightCase(x0 + 1.4, f, zL + 0.45, 0.6, 0.7, 0.55, C.caseBlack);

  // Doors along both sides: frames, leaves and handles. One on the left stands ajar, lit inside.
  const sideDoor = (x, side, ajar = false) => {
    const zw = side < 0 ? zL : zR;
    const off = side < 0 ? 0.04 : -0.04;
    for (const dx of [-0.48, 0.48]) k.box(0.06, 2.1, 0.05, C.frame, x + dx, f + 1.05, zw + off);
    k.box(1.02, 0.06, 0.05, C.frame, x, f + 2.13, zw + off);
    if (ajar) {
      k.box(0.92, 2.04, 0.02, 0xffd59a, x, f + 1.03, zw + off * 0.3); // light from the room behind
      k.box(0.04, 2.04, 0.9, C.door, x - 0.46 + 0.02, f + 1.03, zw + off * 12);
    } else {
      k.box(0.9, 2.04, 0.04, C.door, x, f + 1.03, zw + off);
      k.box(0.12, 0.03, 0.03, C.handle, x + 0.32, f + 1.0, zw + off * 2);
    }
  };
  sideDoor(13.6, -1);
  sideDoor(13.6, 1);
  sideDoor(18.4, -1, true);
  sideDoor(18.9, 1);

  // The double doors at the far end, with small windows, and a lit sign above them.
  for (const dz of [-0.36, 0.36]) {
    k.box(0.05, 2.1, 0.7, C.door, x1 - 0.03, f + 1.05, z + dz);
    k.box(0.06, 0.34, 0.16, C.glass, x1 - 0.06, f + 1.55, z + dz);
    k.box(0.04, 0.03, 0.14, C.handle, x1 - 0.07, f + 1.0, z + dz * 0.2);
  }
  k.box(0.06, 2.2, 0.06, C.frame, x1 - 0.04, f + 1.1, z);
  k.box(0.06, h, half * 2, C.wallFar, x1 + 0.02, f + h / 2, z);
  k.box(0.04, 0.14, 0.5, C.sign, x1 - 0.06, f + 2.22, z);

  // Ceiling lights down the middle.
  const lights = [];
  for (let x = x0 + 1.2; x < x1 - 0.4; x += 2.3) {
    k.box(0.5, 0.03, 0.3, C.light, x, top - 0.03, z);
    lights.push([x, top - 0.12, z, 0xffd9a8]);
  }

  const mesh = new THREE.Mesh(k.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true }));
  scene.add(mesh);

  return {
    mesh,
    // The lamps' glows, brought up and down with the lights (see the hall).
    lamps: [...lights, [x1 - 0.1, f + 2.22, z, 0x5fdc8a], [18.4, f + 1.3, zL + 0.2, 0xffd59a]],
  };
}
