import * as THREE from 'three';
import { Kit, lambert } from './kit.js';
import { DESK } from '../lib/board.js';

// The desk under the notice board, where visitors leave a note (design document, section 7). A
// writing desk on the stage, scattered with sheet music, a stack of scores, a pad of blank cards
// and a pen; at its end a small record shelf with a turntable on top, and records leaning against
// a leg. The visitors' cards themselves are page elements laid on the top (world/index.js), so
// they can be read, moved and stacked.

const STAGE = 1.0;
const C = {
  top: 0x7a4a2a,
  edge: 0x5c3520,
  leg: 0x3d2416,
  paper: 0xf0e6cf,
  score: [0x2f3b4a, 0x6b2a2e, 0x3a4a33, 0x4a3b2a],
  pad: 0xfbf7ef,
  pen: 0x1a1a1c,
  shelf: 0x8a5a32,
  records: [0x1d1a1c, 0xc23b2e, 0x2e5d8c, 0xe3b552, 0x2f6b46, 0x7a3b8c, 0xd9d2c4, 0x111111],
  deck: 0x1f1f22,
};

// Staff lines and notes on a page, drawn once and shared by every loose sheet.
function sheetTexture() {
  const W = 256;
  const H = 340;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#f1e7cf';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#4a4036';
  g.fillStyle = '#2a241e';
  g.lineWidth = 1;
  for (let s = 0; s < 6; s++) {
    const y0 = 38 + s * 50;
    for (let l = 0; l < 5; l++) {
      g.beginPath();
      g.moveTo(18, y0 + l * 6);
      g.lineTo(W - 18, y0 + l * 6);
      g.stroke();
    }
    for (let n = 0; n < 9; n++) {
      const x = 40 + n * 22 + (n % 3) * 2;
      const y = y0 + ((n * 7 + s * 3) % 9) * 3;
      g.beginPath();
      g.ellipse(x, y, 4, 3, -0.4, 0, Math.PI * 2);
      g.fill();
      g.fillRect(x + 3, y - 16, 1.2, 16);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildDesk(scene) {
  const k = new Kit();
  const { x, y, z, length: L, depth: D } = DESK;
  const T = 0.05; // the top's thickness

  /* ---------- the desk ---------- */
  k.box(D, T, L, C.top, x, y - T / 2, z);
  k.box(D + 0.02, 0.02, L + 0.02, C.edge, x, y - T - 0.01, z);
  for (const dx of [-D / 2 + 0.06, D / 2 - 0.3]) {
    for (const dz of [-L / 2 + 0.06, L / 2 - 0.06]) k.box(0.05, y - T - STAGE, 0.05, C.leg, x + dx, (y - T + STAGE) / 2, z + dz);
  }
  k.box(0.03, 0.12, L - 0.16, C.edge, x - D / 2 + 0.06, y - T - 0.07, z); // apron
  k.box(0.32, 0.12, 0.5, C.edge, x - D / 2 + 0.2, y - T - 0.08, z + 0.35); // a drawer
  k.box(0.02, 0.025, 0.1, 0xc9a24b, x - D / 2 + 0.035, y - T - 0.08, z + 0.35); // its handle

  /* ---------- on the desk ---------- */
  // A stack of bound scores at the far end, and the pad and pen at the near end.
  const sz = z - L / 2 + 0.2;
  for (let i = 0; i < 4; i++) k.box(0.3, 0.022, 0.22, C.score[i], x + 0.08 + (i % 2) * 0.012, y + 0.011 + i * 0.022, sz + (i % 2 ? 0.01 : -0.008), 0, (i - 1.5) * 0.06);
  const pz = z + L / 2 - 0.2;
  k.box(0.13, 0.012, 0.2, C.pad, x - 0.04, y + 0.006, pz, 0, 0.08);
  k.box(0.006, 0.006, 0.15, C.pen, x - 0.04 + 0.09, y + 0.014, pz, 0, -0.35);
  scene.add(new THREE.Mesh(k.geometry(), lambert()));

  // Loose sheet music across the top, under where the cards lie.
  const sheet = new THREE.MeshLambertMaterial({ map: sheetTexture() });
  const sheetGeo = new THREE.PlaneGeometry(0.21, 0.28);
  [
    [-0.05, -0.36, 0.35],
    [0.1, -0.05, -0.25],
    [-0.12, 0.2, 0.15],
    [0.12, 0.38, -0.4],
  ].forEach(([dx, du, turn], i) => {
    const m = new THREE.Mesh(sheetGeo, sheet);
    m.rotation.set(-Math.PI / 2, 0, turn);
    m.position.set(x + dx, y + 0.002 + i * 0.0006, z + du);
    scene.add(m);
  });

  /* ---------- the record shelf ---------- */
  const r = new Kit();
  const shz = z - L / 2 - 0.42; // just past the desk's far end
  const shx = x + 0.08;
  const H = 0.95;
  for (const dz of [-0.28, 0.28]) r.box(0.42, H, 0.03, C.shelf, shx, STAGE + 0.15 + H / 2, shz + dz);
  for (const h of [0.15, 0.55, 0.95, 1.1]) r.box(0.42, 0.03, 0.59, C.shelf, shx, STAGE + h, shz);
  for (const [dx, dz] of [[-0.17, -0.25], [0.17, -0.25], [-0.17, 0.25], [0.17, 0.25]]) {
    r.box(0.035, 0.15, 0.035, C.shelf, shx + dx, STAGE + 0.075, shz + dz);
  }
  // Records on the two shelves, leaning a little.
  for (const [h, n] of [[0.17, 16], [0.57, 14]]) {
    for (let i = 0; i < n; i++) {
      const col = C.records[(i * 5 + n) % C.records.length];
      r.box(0.32, 0.31, 0.012, col, shx, STAGE + h + 0.155, shz - 0.24 + i * 0.03, 0.08, 0, 0);
    }
  }
  // The turntable on top.
  r.box(0.36, 0.06, 0.44, C.deck, shx, STAGE + 1.145, shz);
  r.cyl(0.15, 0.15, 0.012, 24, 0x111111, shx, STAGE + 1.181, shz - 0.03);
  r.cyl(0.05, 0.05, 0.014, 16, 0xc23b2e, shx, STAGE + 1.183, shz - 0.03);
  r.box(0.012, 0.012, 0.2, 0xb8b8b4, shx + 0.12, STAGE + 1.19, shz + 0.08, 0, 0.5);
  // Records leaning against the desk's leg.
  for (let i = 0; i < 4; i++) {
    r.box(0.012, 0.31, 0.31, C.records[(i * 3 + 1) % C.records.length], x - D / 2 + 0.12 + i * 0.014, STAGE + 0.155, z - L / 2 + 0.3, 0, 0, -0.18);
  }
  scene.add(new THREE.Mesh(r.geometry(), lambert()));

  return { glows: [] };
}
