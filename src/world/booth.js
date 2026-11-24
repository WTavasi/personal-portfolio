import * as THREE from 'three';
import { Kit, lambert } from './kit.js';

// The Booth: the control room high on the left wall, above the upper gallery, as in a real hall's
// sound and lighting booth. A small room juts out of the wall with a glass front facing the stage.
// Inside, two engineers sit at a long desk with a mixing console and monitors, lit by their
// screens: one wears headphones, the other points at something on stage. Racks with status lights
// and acoustic panels line the back wall.
//
// The booth is dim inside, so its lighting is painted into the colours (cool on what faces the
// screens) instead of adding lights, which would cost every surface in the hall.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const BOOTH = {
  glassX: -11.45, // the glass front, facing +x (into the hall)
  backX: -12.97, // the hall's wall
  floorY: 8.95,
  roofY: 10.95,
  z: -12.5, // centre along the wall
  width: 3.8, // along z
  sill: 9.4, // bottom of the glass
  head: 10.6, // top of the glass
};

const C = {
  shell: 0x45261a,
  trim: 0x6b3520,
  inside: 0x2c2327,
  acoustic: 0x3d3236,
  desk: 0x3a2e27,
  console: 0x34343a,
  monitorBack: 0x131214,
  rack: 0x111012,
  chair: 0x1c1a1d,
  // Skin and clothes lit by blue-white screens: a touch cooler than in the hall.
  skinA: 0x6f4b3e,
  skinB: 0xa47a66,
  shirtA: 0x2a3446,
  shirtB: 0x4a2c34,
  hairA: 0x141012,
  hairB: 0x2a1d18,
  headset: 0x0e0e10,
};

export function buildBooth(scene) {
  const k = new Kit(); // lit by the hall
  const glow = new Kit(); // unlit: screens, status lights, the lamp
  const { glassX: gx, backX: bx, floorY: fy, roofY: ry, z: cz, width: w, sill, head } = BOOTH;
  const depth = gx - bx;
  const mx = (gx + bx) / 2;
  const z0 = cz - w / 2;
  const z1 = cz + w / 2;

  /* ---------- the room ---------- */
  k.box(depth + 0.1, 0.12, w + 0.1, C.shell, mx, fy - 0.06, cz); // floor (its underside is seen from the stalls)
  k.box(depth + 0.2, 0.14, w + 0.2, C.shell, mx, ry + 0.07, cz); // roof
  for (const z of [z0, z1]) k.box(depth, ry - fy, 0.1, C.shell, mx, (fy + ry) / 2, z); // ends
  k.box(0.12, sill - fy, w, C.trim, gx, (fy + sill) / 2, cz); // below the glass
  k.box(0.12, ry - head, w, C.trim, gx, (head + ry) / 2, cz); // above the glass
  k.box(0.14, 0.05, w + 0.02, C.trim, gx + 0.02, sill + 0.01, cz); // the sill
  for (const z of [cz - w / 6, cz + w / 6]) k.box(0.08, head - sill, 0.06, C.trim, gx, (sill + head) / 2, z); // mullions
  k.box(0.04, ry - fy, w - 0.1, C.inside, bx + 0.03, (fy + ry) / 2, cz); // back wall
  for (const z of [z0 + 0.05, z1 - 0.05]) k.box(depth - 0.1, ry - fy, 0.02, C.inside, mx, (fy + ry) / 2, z + (z < cz ? 0.06 : -0.06));
  k.box(depth - 0.1, 0.02, w - 0.1, C.inside, mx, ry - 0.02, cz); // ceiling

  // Acoustic panels on the back wall.
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 5; i++) {
      k.box(0.03, 0.42, 0.56, C.acoustic, bx + 0.07, 10.05 + row * 0.5, z0 + 0.95 + i * 0.62);
    }
  }

  // Equipment racks at each end of the back wall, with status lights.
  for (const z of [z0 + 0.4, z1 - 0.4]) {
    k.box(0.45, 1.3, 0.5, C.rack, bx + 0.28, fy + 0.65, z);
    for (let i = 0; i < 6; i++) {
      const y = fy + 0.2 + i * 0.19;
      k.box(0.02, 0.12, 0.44, 0x1e1c1f, bx + 0.51, y, z);
      glow.box(0.02, 0.025, 0.025, [0x3fe07a, 0xffb347, 0x3fe07a, 0xff5a4f, 0x3fe07a, 0x6fb7ff][i], bx + 0.53, y + 0.02, z + 0.15);
      glow.box(0.02, 0.012, 0.18, 0x3a8f5a, bx + 0.53, y - 0.02, z - 0.08);
    }
  }

  /* ---------- the desk, the console and the screens ---------- */
  const deskTop = fy + 0.74;
  const deskX = gx - 0.42;
  k.box(0.7, 0.05, w - 0.3, C.desk, deskX, deskTop, cz);
  k.box(0.05, deskTop - fy, w - 0.3, C.desk, gx - 0.1, (fy + deskTop) / 2, cz); // modesty panel
  // The mixing console: a long sloped surface, rising toward the glass.
  const conZ = cz + 0.35;
  k.box(0.5, 0.06, 1.7, C.console, deskX - 0.05, deskTop + 0.07, conZ, 0, 0, 0.2);
  for (let i = 0; i < 16; i++) {
    const z = conZ - 0.78 + i * 0.104;
    for (let j = 0; j < 3; j++) glow.box(0.012, 0.012, 0.03, j === 2 ? 0xffd27a : 0xe9e6df, deskX - 0.2 + j * 0.12, deskTop + 0.07 + 0.024 + j * 0.024, z);
    glow.box(0.01, 0.07, 0.012, i % 5 === 0 ? 0xffb347 : 0x3fe07a, deskX + 0.17, deskTop + 0.16, z); // level meters
  }
  // Monitors: their screens face the engineers, so from the hall you see their backs and the
  // blue light they throw.
  const screens = [];
  for (const [z, sw] of [[cz - 1.25, 0.6], [cz - 0.45, 0.62], [cz + 1.15, 0.55]]) {
    const y = deskTop + 0.3;
    k.box(0.04, 0.36, sw, C.monitorBack, deskX + 0.12, y, z);
    k.box(0.05, 0.22, 0.05, C.monitorBack, deskX + 0.14, deskTop + 0.1, z);
    glow.box(0.01, 0.32, sw - 0.05, 0x8cc4f0, deskX + 0.095, y, z);
    screens.push([deskX + 0.02, y, z]);
  }
  // A desk lamp at the far end.
  k.bar(V(deskX, deskTop, z1 - 0.35), V(deskX - 0.1, deskTop + 0.32, z1 - 0.4), 0.02, 0x2a2a2c);
  glow.cyl(0.03, 0.07, 0.08, 10, 0xffd59a, deskX - 0.1, deskTop + 0.34, z1 - 0.42);

  /* ---------- the engineers ---------- */
  // Seated, facing the glass (+x). `reach` is where the right hand goes.
  function engineer({ z, skin, shirt, hair, headset = false, reach }) {
    const x = deskX - 0.62;
    const seat = fy + 0.48;
    k.box(0.44, 0.06, 0.44, C.chair, x - 0.02, seat - 0.03, z); // chair seat
    k.box(0.06, 0.55, 0.42, C.chair, x - 0.24, seat + 0.27, z); // chair back
    k.bar(V(x - 0.02, fy, z), V(x - 0.02, seat - 0.05, z), 0.05, C.chair);
    k.box(0.34, 0.14, 0.36, shirt, x + 0.12, seat + 0.07, z); // lap
    k.box(0.24, 0.52, 0.4, shirt, x - 0.06, seat + 0.32, z, 0, 0, -0.12); // torso, leaning in
    const neck = V(x - 0.02, seat + 0.6, z);
    k.bar(neck, V(x, seat + 0.68, z), 0.08, skin);
    const headC = V(x + 0.01, seat + 0.8, z);
    k.add(new THREE.SphereGeometry(0.11, 12, 10), skin, new THREE.Matrix4().makeTranslation(headC.x, headC.y, headC.z));
    k.add(new THREE.SphereGeometry(0.115, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, new THREE.Matrix4().makeTranslation(headC.x - 0.01, headC.y + 0.01, headC.z));
    if (headset) {
      k.add(new THREE.TorusGeometry(0.125, 0.012, 6, 16, Math.PI), C.headset, new THREE.Matrix4().compose(headC, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), V(1, 1, 1)));
      for (const s of [-1, 1]) k.cyl(0.05, 0.05, 0.04, 10, C.headset, headC.x, headC.y - 0.01, headC.z + s * 0.12, Math.PI / 2, 0, 0);
    }
    // Arms: the left hand rests on the console; the right goes where `reach` says.
    for (const [s, hand] of [[-1, V(deskX - 0.14, deskTop + 0.12, z - 0.18)], [1, reach]]) {
      const shoulder = V(x - 0.02, seat + 0.52, z + s * 0.22);
      const elbow = V((shoulder.x + hand.x) / 2 - 0.04, Math.min(shoulder.y, hand.y) - 0.08, (shoulder.z + hand.z) / 2 + s * 0.04);
      k.bar(shoulder, elbow, 0.08, shirt);
      k.bar(elbow, hand, 0.065, shirt);
      k.add(new THREE.SphereGeometry(0.04, 8, 6), skin, new THREE.Matrix4().makeTranslation(hand.x, hand.y, hand.z));
    }
  }
  engineer({ z: cz - 0.85, skin: C.skinA, shirt: C.shirtA, hair: C.hairA, headset: true, reach: V(deskX - 0.1, deskTop + 0.13, cz - 0.55) });
  // The second points through the glass at something on stage.
  engineer({ z: cz + 0.75, skin: C.skinB, shirt: C.shirtB, hair: C.hairB, reach: V(gx - 0.18, deskTop + 0.5, cz + 0.55) });

  scene.add(new THREE.Mesh(k.geometry(), lambert()));
  scene.add(new THREE.Mesh(glow.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true })));

  // The glass: faintly tinted, so the room reads as behind a window.
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.1, head - sill),
    new THREE.MeshBasicMaterial({ color: 0xbcd6e6, transparent: true, opacity: 0.1, depthWrite: false }),
  );
  glass.position.set(gx + 0.03, (sill + head) / 2, cz);
  glass.rotation.y = Math.PI / 2;
  scene.add(glass);

  return {
    // Glows for the hall's sprite layers: the screens' blue light, and the lamp.
    glows: [...screens.map(([x, y, z]) => [x, y, z, 0x7fb6e8]), [deskX - 0.1, deskTop + 0.3, z1 - 0.42, 0xffd59a]],
  };
}
