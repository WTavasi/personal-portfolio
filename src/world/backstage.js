import * as THREE from 'three';
import { Kit } from './kit.js';

// Backstage, behind the stage door on the right: Services. The door stands open onto a working
// passage that runs behind the panelling, under the side gallery: a bare floor with a tape line,
// black drapes at the far end, a work light, a ladder and a flight case, and along the wall a
// poster for each service, like a theatre's corridor of past shows. Not walkable; it only has to
// look like it leads somewhere.

export const BACKSTAGE = {
  x0: 11.36, // the back of the panelling
  x1: 12.86, // the passage's far wall
  z0: -16.8, // its two ends
  z1: -8.4,
  top: 3.4, // under the gallery floor
  door: { z: -10.4, w: 1.45, h: 2.5 },
};

// Backstage is behind the panelling, where the hall's lights do not reach, so it is lit by its
// own work light: these colours are drawn unlit, already as the work light shows them.
const C = {
  floor: 0x5c534b,
  wall: 0x544b45,
  drape: 0x17151a,
  ladder: 0xb9b6ae,
  case: 0x26262a,
  caseEdge: 0xc9c7c0,
  tape: 0xd8c25a,
  frame: 0x5a3020,
};

// A poster for a service: a colour block, the service in large type, its line underneath, and
// which kind of work it is, drawn once onto a small canvas.
const POSTER_COLOURS = { engineering: ['#1f3a4d', '#e3b552'], music: ['#5a1f2b', '#f3ecdf'] };
function posterTexture(kind, title, line) {
  const W = 360;
  const H = 520;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const [bg, ink] = POSTER_COLOURS[kind];
  g.fillStyle = '#efe6d2';
  g.fillRect(0, 0, W, H);
  g.fillStyle = bg;
  g.fillRect(18, 18, W - 36, H - 36);
  g.fillStyle = ink;
  g.font = '700 22px "Space Mono", ui-monospace, monospace';
  g.fillText(kind === 'engineering' ? 'ENGINEERING' : 'MUSIC', 40, 66);
  g.fillRect(40, 82, 60, 4);
  // The title, wrapped onto as many lines as it needs.
  g.font = '600 46px "Fraunces Variable", Georgia, serif';
  const wrap = (text, x, y, max, lh) => {
    const words = text.split(' ');
    let row = '';
    for (const w of words) {
      const next = row ? `${row} ${w}` : w;
      if (g.measureText(next).width > max && row) {
        g.fillText(row, x, y);
        y += lh;
        row = w;
      } else row = next;
    }
    g.fillText(row, x, y);
    return y + lh;
  };
  const after = wrap(title, 40, 170, W - 80, 52);
  g.globalAlpha = 0.85;
  g.font = '400 24px "Figtree Variable", system-ui, sans-serif';
  wrap(line, 40, after + 20, W - 80, 32);
  g.globalAlpha = 1;
  g.font = '700 20px "Space Mono", ui-monospace, monospace';
  g.fillText('NOW BOOKING', 40, H - 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildBackstage(scene, services) {
  const k = new Kit(); // drawn unlit (see C)
  const glow = new Kit();
  const { x0, x1, z0, z1, top, door } = BACKSTAGE;
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  const len = z1 - z0;

  // The passage: floor, far wall, ceiling, and the ends.
  k.box(x1 - x0, 0.04, len, C.floor, mx, 0.02, mz);
  k.box(0.04, top, len, C.wall, x1 + 0.02, top / 2, mz);
  k.box(x1 - x0 + 0.1, 0.04, len, C.wall, mx, top, mz);
  k.box(x1 - x0, top, 0.05, C.wall, mx, top / 2, z1);
  // The near wall (the back of the hall's panelling), with the stage door through it.
  const d0 = door.z - door.w / 2;
  const d1 = door.z + door.w / 2;
  k.box(0.04, top, d0 - z0, C.wall, x0 - 0.02, top / 2, (z0 + d0) / 2);
  k.box(0.04, top, z1 - d1, C.wall, x0 - 0.02, top / 2, (d1 + z1) / 2);
  k.box(0.04, top - door.h, door.w, C.wall, x0 - 0.02, (top + door.h) / 2, door.z);
  // A tape line down the floor.
  glow.box(0.05, 0.005, len - 0.4, C.tape, x0 + 0.3, 0.045, mz);

  // Black drapes at the far end, hung in folds.
  for (let i = 0; i < 9; i++) {
    const x = x0 + 0.08 + i * ((x1 - x0 - 0.16) / 8);
    k.box(0.2, top - 0.05, 0.06, C.drape, x, (top - 0.05) / 2, z0 + 0.2 + (i % 2) * 0.08, 0, i % 2 ? 0.5 : -0.5);
  }

  // A work light on a bar, the brightest thing back here.
  const lightZ = z0 + 2.6;
  k.box(x1 - x0, 0.05, 0.05, 0x2a2a2a, mx, top - 0.25, lightZ);
  k.box(0.18, 0.16, 0.2, 0x1a1a1a, mx + 0.2, top - 0.4, lightZ);
  glow.box(0.02, 0.12, 0.14, 0xfff1d0, mx + 0.1, top - 0.42, lightZ);

  // A ladder against the far wall by the drapes, and a flight case on the floor.
  const lz = z0 + 1.1;
  for (const dz of [-0.22, 0.22]) k.bar(new THREE.Vector3(x1 - 0.5, 0, lz + dz), new THREE.Vector3(x1 - 0.06, 2.6, lz + dz), 0.05, C.ladder);
  for (let i = 1; i < 9; i++) {
    const t = i / 9;
    k.box(0.04, 0.03, 0.44, C.ladder, x1 - 0.5 + 0.44 * t, 2.6 * t, lz);
  }
  const cz = z0 + 3.5;
  k.box(0.7, 0.62, 0.55, C.case, x0 + 0.55, 0.33, cz);
  for (const y of [0.04, 0.62]) k.box(0.72, 0.03, 0.57, C.caseEdge, x0 + 0.55, y, cz);
  for (const dz of [-0.28, 0.28]) k.box(0.72, 0.6, 0.02, C.caseEdge, x0 + 0.55, 0.33, cz + dz);

  scene.add(new THREE.Mesh(k.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true })));
  scene.add(new THREE.Mesh(glow.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true })));

  // The posters, one per service, framed along the far wall from opposite the door onward.
  const list = [...services.engineering.map((s) => ['engineering', ...s]), ...services.music.map((s) => ['music', ...s])];
  const first = z1 - 0.6;
  const span = first - (z0 + 3.1);
  const gap = span / Math.max(1, list.length - 1);
  const frames = new Kit();
  const geo = new THREE.PlaneGeometry(0.5, 0.72);
  list.forEach(([kind, title, line], i) => {
    const z = first - i * gap;
    const y = i % 2 ? 1.62 : 1.58;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: posterTexture(kind, title, line), color: 0xd8d2c8 }));
    mesh.position.set(x1 - 0.03, y, z); // just in front of its frame
    mesh.rotation.y = -Math.PI / 2;
    scene.add(mesh);
    frames.box(0.02, 0.78, 0.56, C.frame, x1 - 0.005, y, z);
  });
  scene.add(new THREE.Mesh(frames.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true })));

  return {
    glows: [
      [mx + 0.1, top - 0.5, lightZ, 0xfff1d0],
      [x0 + 0.2, 1.6, door.z, 0xffe2b0],
    ],
  };
}
