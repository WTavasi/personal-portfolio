import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The concert hall, built from primitives in code: no model files, no licences to check, and a
// small download. Units are metres. The stage is toward -z, the audience toward +z, and the
// camera sits above the back of the stalls looking at the stage.
//
// Performance rules this file follows:
// - Everything that never moves is merged into a handful of meshes (one draw call each).
// - Repeated objects (seats, chairs, stands, organ pipes) are instanced.
// - Colours live in vertex colours, so most of the hall shares one cheap Lambert material.
// - Lamps are unlit materials plus additive sprites, instead of real lights or a bloom pass.

export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

const STAGE_TOP = 1.0;
const CONDUCTOR = new THREE.Vector3(0, STAGE_TOP, -6.4);
const WALL_X = 13;
const BACK_Z = -23.5;
const REAR_Z = 18;
const CEILING = 17;
const STALLS_CENTRE_Z = -24; // the stalls rows are arcs around this point

// Palette (sRGB). The hall is warm wood with crimson seats.
const COL = {
  maple: 0xd6a067,
  mapleDeep: 0xa86d3c,
  mahogany: 0x6b3520,
  walnut: 0x45261a,
  dark: 0x221510,
  stageSide: 0x3a2214,
  crimson: 0xa31d2e,
  crimsonBack: 0x7a1624,
  carpet: 0x3e1a17,
  redCarpet: 0x8c1a27,
  chair: 0x1d1a1c,
  chairSeat: 0x2c2729,
  stand: 0x151415,
  paper: 0xefe6d2,
  brass: 0xc99a48,
  copper: 0xa8653a,
  drumHead: 0xe8dfcc,
  pipe: 0xd9d0c0,
  acrylic: 0x8e8070, // unlit, so this reads as softly lit acrylic
  truss: 0x1a1819,
  pianoBlack: 0x0d0c0e,
  ivory: 0xf1ece0,
};

/* ------------------------------------------------------------------ helpers */

const colorCache = new Map();
function linear(hex) {
  if (!colorCache.has(hex)) colorCache.set(hex, new THREE.Color(hex)); // stored as linear
  return colorCache.get(hex);
}

// Paint a geometry with one colour, or with {top, side, bottom} chosen by face direction.
function paint(geo, color) {
  const nor = geo.attributes.normal;
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let hex = color;
    if (typeof color === 'object') {
      const ny = nor.getY(i);
      hex = ny > 0.5 ? color.top : ny < -0.5 ? color.bottom ?? color.side : color.side;
    }
    const c = linear(hex);
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

function prep(geo, color, matrix, keepUv) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (matrix) g.applyMatrix4(matrix);
  for (const name of Object.keys(g.attributes)) {
    if (name === 'position' || name === 'normal' || (keepUv && name === 'uv')) continue;
    g.deleteAttribute(name);
  }
  g.clearGroups();
  paint(g, color);
  return g;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// A bag of parts that becomes one geometry (one draw call).
class Kit {
  constructor(keepUv = false) {
    this.parts = [];
    this.keepUv = keepUv;
  }
  add(geo, color, matrix) {
    this.parts.push(prep(geo, color, matrix, this.keepUv));
    return this;
  }
  box(w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, M(x, y, z, rx, ry, rz));
  }
  cyl(r0, r1, h, seg, color, x, y, z, rx = 0, ry = 0, rz = 0) {
    return this.add(new THREE.CylinderGeometry(r0, r1, h, seg), color, M(x, y, z, rx, ry, rz));
  }
  // A thin square bar from point a to point b (legs, struts, poles).
  bar(a, b, t, color) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    return this.add(new THREE.BoxGeometry(t, len, t), color, new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
  }
  geometry() {
    return mergeGeometries(this.parts, false);
  }
}

// Floor-plan shapes use (x, -z). slab() extrudes one upward between two heights.
function slab(shape, y0, y1, curveSegments = 40) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

function sector(cx, cy, r0, r1, a0, a1) {
  const s = new THREE.Shape();
  s.moveTo(cx + r1 * Math.cos(a0), cy + r1 * Math.sin(a0));
  s.absarc(cx, cy, r1, a0, a1, false);
  s.lineTo(cx + r0 * Math.cos(a1), cy + r0 * Math.sin(a1));
  s.absarc(cx, cy, r0, a1, a0, true);
  return s;
}

const lambert = (o = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, ...o });

function canvasTexture(size, draw, repeatable = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeatable) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Seeded random so the hall looks the same on every visit.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// Vertical wood panelling, one tile = 2.4 m square (four 0.6 m panels).
const PANEL_TILE = 2.4;
function panelTexture() {
  return canvasTexture(256, (g, s) => {
    const w = s / 4;
    for (let i = 0; i < 4; i++) {
      const v = 0.93 + rand() * 0.12;
      g.fillStyle = `rgb(${Math.round(255 * v)},${Math.round(236 * v)},${Math.round(214 * v)})`;
      g.fillRect(i * w, 0, w, s);
      g.globalAlpha = 0.07;
      g.fillStyle = '#5a3a1e';
      for (let k = 0; k < 9; k++) g.fillRect(i * w + rand() * w, 0, 1 + rand() * 2, s);
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(60,34,16,0.55)';
      g.fillRect(i * w, 0, 2, s);
    }
    g.fillStyle = 'rgba(60,34,16,0.45)';
    g.fillRect(0, 0, s, 2);
  });
}

// Stage floor planks, one tile = 4 m square, planks 0.2 m wide running across the stage.
function plankTexture() {
  return canvasTexture(256, (g, s) => {
    const h = s / 20;
    for (let i = 0; i < 20; i++) {
      let x = -rand() * s;
      while (x < s) {
        const len = s * (0.35 + rand() * 0.5);
        const v = 0.86 + rand() * 0.16;
        g.fillStyle = `rgb(${Math.round(196 * v)},${Math.round(136 * v)},${Math.round(84 * v)})`;
        g.fillRect(x, i * h, len, h);
        g.fillStyle = 'rgba(50,28,12,0.6)';
        g.fillRect(x, i * h, 1, h);
        x += len;
      }
      g.fillStyle = 'rgba(50,28,12,0.5)';
      g.fillRect(0, i * h, s, 1);
    }
  });
}

function glowTexture() {
  return canvasTexture(
    64,
    (g, s) => {
      const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.25, 'rgba(255,255,255,0.45)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, s, s);
    },
    false,
  );
}

function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.6, '#4a4a4a');
  grad.addColorStop(1, '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

// A soft light shaft from `from` to `to`.
function shaft(from, to, radius, opacity, tex) {
  const length = from.distanceTo(to);
  const geo = new THREE.ConeGeometry(radius, length, 20, 1, true);
  geo.translate(0, -length / 2, 0);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd9a6,
    transparent: true,
    opacity,
    alphaMap: tex,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(from);
  mesh.lookAt(to);
  return { mesh, mat, base: opacity };
}

// Instanced mesh from a list of matrices (and optional per-instance tints).
function instances(geo, mat, matrices, tints) {
  const m = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((mx, i) => m.setMatrixAt(i, mx));
  if (tints) tints.forEach((c, i) => m.setColorAt(i, c));
  m.instanceMatrix.needsUpdate = true;
  return m;
}

const o3 = new THREE.Object3D();
function facing(x, y, z, tx, tz) {
  o3.position.set(x, y, z);
  o3.lookAt(tx, y, tz);
  o3.updateMatrix();
  return o3.matrix.clone();
}

/* ------------------------------------------------------------- object kits */

// A theatre seat: side standard with armrest, cushion, reclined back. Faces +z.
// Each seat carries its own left standard; row ends get an extra one.
function seatKit() {
  const k = new Kit();
  k.box(0.05, 0.64, 0.54, COL.walnut, -0.28, 0.32, -0.02);
  k.box(0.07, 0.04, 0.46, COL.mahogany, -0.28, 0.66, 0.0);
  k.box(0.49, 0.11, 0.46, COL.crimson, 0, 0.45, 0.05);
  k.box(0.5, 0.58, 0.08, COL.crimson, 0, 0.8, -0.2, -0.16);
  k.box(0.5, 0.54, 0.02, COL.crimsonBack, 0, 0.79, -0.255, -0.16);
  k.box(0.52, 0.05, 0.12, COL.mahogany, 0, 1.09, -0.25, -0.16);
  return k.geometry();
}
function standardKit() {
  const k = new Kit();
  k.box(0.05, 0.64, 0.54, COL.walnut, -0.28, 0.32, -0.02);
  k.box(0.07, 0.04, 0.46, COL.mahogany, -0.28, 0.66, 0.0);
  return k.geometry();
}

// An orchestra chair: four legs, padded seat, small back. Faces +z.
function chairKit() {
  const k = new Kit();
  for (const sx of [-1, 1]) {
    k.box(0.03, 0.9, 0.03, COL.chair, sx * 0.19, 0.45, -0.19, 0.06);
    k.box(0.03, 0.45, 0.03, COL.chair, sx * 0.19, 0.225, 0.18);
  }
  k.box(0.44, 0.05, 0.42, COL.chairSeat, 0, 0.47, 0);
  k.box(0.42, 0.24, 0.025, COL.chair, 0, 0.78, -0.22, -0.1);
  return k.geometry();
}

// A music stand: tripod, pole, tilted desk with a sheet of music. The desk faces +z.
function standKit() {
  const k = new Kit();
  const top = new THREE.Vector3(0, 0.36, 0);
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
    k.bar(top, new THREE.Vector3(Math.cos(a) * 0.27, 0, Math.sin(a) * 0.27), 0.018, COL.stand);
  }
  k.box(0.02, 0.78, 0.02, COL.stand, 0, 0.72, 0);
  k.box(0.5, 0.34, 0.012, COL.stand, 0, 1.2, 0, -0.38);
  k.box(0.5, 0.03, 0.06, COL.stand, 0, 1.04, 0.07);
  k.box(0.44, 0.29, 0.004, COL.paper, 0, 1.21, 0.012, -0.38);
  return k.geometry();
}

/* ------------------------------------------------------------------- build */

export async function buildHall(scene, step) {
  seed = 7;
  const fx = { shafts: [] };
  const hall = new Kit(); // everything static and untextured
  const lamps = new Kit(); // unlit, pulses on the beat
  const steady = new Kit(); // unlit, steady (exit signs, reflector undersides)
  const glowBig = []; // [x, y, z, hex]
  const glowSmall = [];
  const panels = new Kit(true);

  const wallMat = lambert({ map: panelTexture() });

  // A textured wall rectangle; UVs are scaled so the panelling keeps its real size.
  function panel(w, h, matrix, tint) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / PANEL_TILE, (uv.getY(i) * h) / PANEL_TILE);
    panels.add(g, tint, matrix);
  }

  /* ---------- Shell ---------- */
  await step('Raising the walls');
  const hallLen = REAR_Z - BACK_Z;
  const midZ = (REAR_Z + BACK_Z) / 2;
  for (const s of [-1, 1]) {
    panel(hallLen, CEILING, M(s * WALL_X, CEILING / 2, midZ, 0, -s * Math.PI / 2), COL.mapleDeep);
    hall.box(0.08, 1.1, hallLen, COL.mahogany, s * (WALL_X - 0.04), 0.55, midZ); // dado
  }
  panel(WALL_X * 2, CEILING, M(0, CEILING / 2, BACK_Z), 0x7a4a2c);
  hall.box(WALL_X * 2, 0.3, hallLen, COL.dark, 0, CEILING + 0.15, midZ); // ceiling
  hall.box(WALL_X * 2, 0.04, REAR_Z + 6, COL.carpet, 0, -0.02, (REAR_Z - 6) / 2); // stalls floor

  // Stepped ceiling over the audience, each step lined with downlights
  const soffits = [
    [15.6, 13.5, 9],
    [15.0, 7.5, 6],
    [14.4, 1.5, 6],
    [13.8, -3.8, 4.6],
  ];
  for (const [y, z, d] of soffits) {
    hall.box(WALL_X * 2, 0.5, d, COL.mapleDeep, 0, y, z);
    for (const dz of [-d / 4, d / 4]) {
      for (let x = -10.5; x <= 10.51; x += 3) {
        lamps.cyl(0.13, 0.13, 0.04, 8, 0xfff0d6, x, y - 0.27, z + dz);
        glowBig.push([x, y - 0.35, z + dz, 0xffd9a8]);
      }
    }
  }

  // Side galleries on two levels, with lamps on the parapets
  const galleryLevels = [3.6, 7.0];
  const galleryZ = [-16.2, 14.8];
  const gLen = galleryZ[1] - galleryZ[0];
  const gMid = (galleryZ[0] + galleryZ[1]) / 2;
  for (const s of [-1, 1]) {
    for (const y of galleryLevels) {
      hall.box(2.65, 0.36, gLen, { top: COL.carpet, side: COL.walnut, bottom: COL.mapleDeep }, s * 11.68, y - 0.18, gMid);
      hall.box(1.1, 0.35, gLen, { top: COL.carpet, side: COL.walnut }, s * 12.45, y + 0.175, gMid);
      hall.box(0.14, 1.0, gLen, COL.mapleDeep, s * 10.42, y + 0.5, gMid);
      hall.box(0.24, 0.06, gLen + 0.1, COL.maple, s * 10.42, y + 1.03, gMid);
      for (const end of galleryZ) hall.box(2.65, 1.0, 0.14, COL.mahogany, s * 11.68, y + 0.5, end);
      for (let z = galleryZ[0] + 1.5; z < galleryZ[1]; z += 3) {
        lamps.box(0.04, 0.14, 0.1, 0xffcf8a, s * 10.33, y + 0.62, z);
        glowSmall.push([s * 10.25, y + 0.62, z, 0xffc681]);
      }
    }
  }

  // Doors with exit signs beside the stage and beside the choir
  for (const s of [-1, 1]) {
    for (const [y, z] of [[1.15, -4.4]]) {
      hall.box(0.06, 2.3, 1.4, COL.dark, s * (WALL_X - 0.03), y, z);
      hall.box(0.07, 0.08, 1.56, COL.mahogany, s * (WALL_X - 0.04), y + 1.19, z);
      steady.box(0.05, 0.2, 0.46, 0x2fd36a, s * (WALL_X - 0.08), y + 1.45, z);
      glowSmall.push([s * (WALL_X - 0.2), y + 1.45, z, 0x3be27a]);
    }
  }

  /* ---------- Audience ---------- */
  await step('Seating the audience');
  const seatMx = [];
  const endMx = [];
  const seatTint = [];
  const tint = () => new THREE.Color(1, 1, 1).multiplyScalar(0.9 + rand() * 0.14);

  // Add a run of seats; `positions` are seat centres in order along the run.
  function seatRun(positions, faceAt) {
    const mats = positions.map(([x, y, z]) => {
      const f = faceAt(x, y, z);
      return facing(x, y, z, f[0], f[1]);
    });
    mats.forEach((m) => {
      seatMx.push(m);
      seatTint.push(tint());
    });
    if (!mats.length) return;
    // The missing standard is on whichever end has no neighbour on its local +x side.
    const probe = new THREE.Vector3(0.56, 0, 0).applyMatrix4(mats[0]);
    const firstHasNeighbour = mats.length > 1 && probe.distanceTo(new THREE.Vector3().setFromMatrixPosition(mats[1])) < 0.2;
    const endSeat = firstHasNeighbour ? mats[mats.length - 1] : mats[0];
    endMx.push(endSeat.clone().multiply(new THREE.Matrix4().makeTranslation(0.56, 0, 0)));
  }

  const stageFrontZ = (x) => -28.2 + Math.sqrt(529 - x * x);
  const SEAT = 0.56;
  for (let r = 0; r < 16; r++) {
    const R = 20 + 0.95 * r;
    const y = 0.14 * r + 0.012 * r * r;
    if (y > 0) {
      const phiMax = Math.asin((WALL_X - 0.05) / (R + 0.475));
      hall.add(
        slab(sector(0, -STALLS_CENTRE_Z, R - 0.475, R + 0.475, -Math.PI / 2 - phiMax, -Math.PI / 2 + phiMax), 0, y, 48),
        { top: COL.carpet, side: COL.walnut },
      );
    }
    const sMax = R * Math.asin(11.85 / R);
    for (const [a, b] of [
      [-sMax, -4.84],
      [-3.64, 3.64],
      [4.84, sMax],
    ]) {
      const n = Math.floor((b - a) / SEAT + 1e-6);
      const start = (a + b) / 2 - ((n - 1) / 2) * SEAT;
      const run = [];
      for (let k = 0; k < n; k++) {
        const phi = (start + k * SEAT) / R;
        const x = R * Math.sin(phi);
        const z = STALLS_CENTRE_Z + R * Math.cos(phi);
        if (z < -5.6) continue;
        if (Math.abs(x) <= 11.3 && z < stageFrontZ(Math.min(Math.abs(x), 11)) + 0.9) continue;
        run.push([x, y, z]);
      }
      seatRun(run, () => [0, STALLS_CENTRE_Z]);
    }
    // Aisle step lights
    for (const sgn of [-1, 1]) {
      const phi = (sgn * 4.24) / R;
      const x = R * Math.sin(phi);
      const z = STALLS_CENTRE_Z + R * Math.cos(phi) - 0.42;
      if (z < -5) continue;
      lamps.box(0.14, 0.04, 0.05, 0xffb35c, x, y + 0.02, z);
      glowSmall.push([x, y + 0.06, z, 0xffa44f]);
    }
  }

  // Gallery seats, angled toward the stage
  const ang = THREE.MathUtils.degToRad(22);
  for (const s of [-1, 1]) {
    for (const gy of galleryLevels) {
      for (const [x, y] of [
        [s * 10.98, gy],
        [s * 12.2, gy + 0.35],
      ]) {
        const run = [];
        for (let z = galleryZ[0] + 0.55; z < galleryZ[1] - 0.4; z += 0.62) run.push([x, y, z]);
        seatRun(run, (px, py, pz) => {
          const a = THREE.MathUtils.clamp(Math.atan2(pz + 9, Math.abs(px)), -ang, ang);
          return [px - s * Math.cos(a), pz - Math.sin(a)];
        });
      }
    }
  }

  // Choir terrace behind the orchestra: six rising rows, red-carpeted stairs at each side
  const choirRows = 6;
  for (let j = 0; j < choirRows; j++) {
    const z = -17.45 - 0.85 * j;
    const y = STAGE_TOP + 0.5 + 0.42 * j;
    hall.box(20.4, y, 0.85, { top: COL.carpet, side: COL.mahogany }, 0, y / 2, z);
    for (const s of [-1, 1]) hall.box(1.3, y - 0.21, 0.85, COL.redCarpet, s * 10.85, (y - 0.21) / 2, z + 0.2);
    const run = [];
    for (let x = -9.8; x <= 9.81; x += SEAT) run.push([x, y, z]);
    seatRun(run, (px, py, pz) => [px, pz + 5]);
  }
  hall.box(20.4, 1.35, 0.12, COL.mahogany, 0, STAGE_TOP + 0.675, -16.97); // choir front
  hall.box(20.6, 0.06, 0.2, COL.maple, 0, STAGE_TOP + 1.38, -16.97);
  for (const s of [-1, 1]) hall.box(0.6, 5.2, 6.2, COL.mahogany, s * 11.8, 2.6, -20); // choir side walls

  const seatMat = lambert();
  const seats = instances(seatKit(), seatMat, seatMx, seatTint);
  const ends = instances(standardKit(), seatMat, endMx);
  scene.add(seats, ends);
  fx.seatCount = seatMx.length;

  /* ---------- Stage ---------- */
  await step('Laying the stage');
  const plank = plankTexture();
  plank.repeat.set(1 / 4, 1 / 4);
  const stageKit = new Kit(true);
  const aL = Math.atan2(8 - 28.2, -11);
  const aR = Math.atan2(8 - 28.2, 11);
  const stageShape = new THREE.Shape();
  stageShape.moveTo(-11, 17);
  stageShape.lineTo(-11, 8);
  stageShape.absarc(0, 28.2, 23, aL, aR, false);
  stageShape.lineTo(11, 17);
  stageShape.lineTo(-11, 17);
  stageKit.add(slab(stageShape, 0, STAGE_TOP, 48), { top: 0xffffff, side: COL.stageSide });
  // Orchestra risers: three semicircular steps around the conductor
  const riserH = 0.22;
  const riserR = [5.0, 6.8, 8.6];
  const cy = -CONDUCTOR.z;
  riserR.forEach((r0, i) => {
    const a0 = THREE.MathUtils.degToRad(15);
    const a1 = THREE.MathUtils.degToRad(165);
    stageKit.add(slab(sector(0, cy, r0, 10.6, a0, a1), STAGE_TOP, STAGE_TOP + riserH * (i + 1), 40), {
      top: 0xf2e6d8,
      side: COL.stageSide,
    });
  });
  const stage = new THREE.Mesh(stageKit.geometry(), lambert({ map: plank }));
  stage.receiveShadow = true;
  scene.add(stage);
  const levelY = (lv) => STAGE_TOP + riserH * lv;

  // Panelling under the galleries, beside the stage
  for (const sx of [-1, 1]) {
    const len = 8.6;
    panel(len, 3.24, M(sx * 11.3, 1.62, -12.6, 0, (-sx * Math.PI) / 2), COL.maple);
  }

  // Organ above the choir: case, shelf, and towers of pipes
  hall.box(16, 10, 0.5, COL.walnut, 0, 10.6, BACK_Z + 0.3);
  hall.box(16.4, 0.6, 1.4, COL.mahogany, 0, 5.55, BACK_Z + 0.8);
  hall.box(16.4, 0.4, 1.0, COL.mahogany, 0, 15.6, BACK_Z + 0.6);
  for (const x of [-8.1, 8.1]) hall.box(0.5, 10.4, 1.0, COL.mahogany, x, 10.6, BACK_Z + 0.6);
  const pipeMx = [];
  for (let k = -18; k <= 18; k++) {
    const t = Math.abs(k) / 19;
    const towers = [0, 7, 14].includes(Math.abs(k)) ? 1.2 : 0;
    const h = 3.2 + 5.6 * Math.pow(Math.cos((t * Math.PI) / 2), 1.2) + towers;
    pipeMx.push(M(k * 0.42, 5.85 + h / 2, BACK_Z + 0.95 + (k % 2 ? 0.3 : 0), 0, 0, 0, 1, h, 1));
  }
  for (let k = -12; k <= 12; k++) {
    const h = 2.4 + 2.0 * Math.cos((k / 13) * (Math.PI / 2));
    pipeMx.push(M(k * 0.6 + 0.21, 12.3 + h / 2, BACK_Z + 0.75, 0, 0, 0, 0.7, h, 0.7));
  }
  const pipes = instances(
    new THREE.CylinderGeometry(0.17, 0.17, 1, 8, 1, true),
    new THREE.MeshPhongMaterial({ color: COL.pipe, specular: 0x8a7f6a, shininess: 50, flatShading: true, side: THREE.DoubleSide }),
    pipeMx,
  );
  scene.add(pipes);

  /* ---------- Chairs, stands, podium, instruments ---------- */
  await step('Setting chairs and stands');
  const chairMx = [];
  const standMx = [];
  const C = CONDUCTOR;
  const onArc = (r, phi) => [C.x + r * Math.sin(phi), C.z - r * Math.cos(phi)];
  const ARCS = [
    // radius, riser level, spans in degrees, strings share a stand between two players
    { r: 2.4, lv: 0, spans: [[-74, -16], [16, 74]], pair: true },
    { r: 3.55, lv: 0, spans: [[-62, -11], [11, 76]], pair: true }, // the piano takes the front left
    { r: 4.55, lv: 0, spans: [[-66, -8], [8, 77]], pair: true },
    { r: 5.9, lv: 1, spans: [[-72, 72]], pair: false },
    { r: 7.7, lv: 2, spans: [[-66, 66]], pair: false },
    { r: 9.55, lv: 3, spans: [[-46, 10]], pair: false },
  ];
  for (const arc of ARCS) {
    const y = levelY(arc.lv);
    for (const [d0, d1] of arc.spans) {
      const p0 = THREE.MathUtils.degToRad(d0);
      const p1 = THREE.MathUtils.degToRad(d1);
      const n = Math.max(1, Math.round((arc.r * (p1 - p0)) / 0.84));
      const phis = Array.from({ length: n }, (_, k) => p0 + ((k + 0.5) * (p1 - p0)) / n);
      for (const phi of phis) {
        const [x, z] = onArc(arc.r, phi);
        chairMx.push(facing(x, y, z, C.x, C.z));
      }
      const standPhis = arc.pair
        ? phis.reduce((acc, p, k) => (k % 2 === 0 ? [...acc, k + 1 < n ? (p + phis[k + 1]) / 2 : p] : acc), [])
        : phis;
      for (const phi of standPhis) {
        const [x, z] = onArc(arc.r - 0.66, phi);
        const [cx2, cz2] = onArc(arc.r, phi);
        standMx.push(facing(x, y, z, cx2, cz2));
      }
    }
  }
  const chairs = instances(chairKit(), lambert(), chairMx);
  const stands = instances(standKit(), lambert(), standMx);
  chairs.castShadow = stands.castShadow = true;
  scene.add(chairs, stands);
  fx.chairCount = chairMx.length;

  // Props on stage that cast shadows: podium, harp, timpani
  const props = new Kit();
  props.box(1.1, 0.24, 1.1, COL.walnut, C.x, STAGE_TOP + 0.12, C.z);
  props.box(1.0, 0.03, 1.0, COL.redCarpet, C.x, STAGE_TOP + 0.255, C.z);
  for (const sx of [-0.5, 0.5]) props.box(0.04, 0.95, 0.04, COL.brass, C.x + sx, STAGE_TOP + 0.7, C.z + 0.5);
  props.box(1.04, 0.045, 0.045, COL.brass, C.x, STAGE_TOP + 1.18, C.z + 0.5);
  props.box(0.03, 1.0, 0.03, COL.stand, C.x, STAGE_TOP + 0.75, C.z - 0.48);
  props.box(0.92, 0.56, 0.03, COL.stand, C.x, STAGE_TOP + 1.3, C.z - 0.5, -0.42);
  // Harp, back left
  {
    const [hx, hz] = onArc(8.2, THREE.MathUtils.degToRad(-60));
    const base = new THREE.Vector3(hx, levelY(2), hz);
    const along = new THREE.Vector3(Math.cos(0.6), 0, -Math.sin(0.6));
    const p = (a, h) => base.clone().addScaledVector(along, a).setY(base.y + h);
    props.box(0.4, 0.12, 0.4, COL.brass, base.x, base.y + 0.06, base.z);
    props.bar(p(0, 0.1), p(0, 1.85), 0.07, COL.brass);
    props.bar(p(0.08, 0.15), p(0.95, 1.6), 0.16, COL.mapleDeep);
    props.bar(p(0, 1.85), p(0.5, 1.95), 0.07, COL.brass);
    props.bar(p(0.5, 1.95), p(0.95, 1.6), 0.07, COL.brass);
  }
  // Timpani, back right on the top riser
  for (const deg of [18, 26, 34, 42]) {
    const [tx, tz] = onArc(9.55, THREE.MathUtils.degToRad(deg));
    const y = levelY(3);
    const r = deg % 16 === 2 ? 0.36 : 0.4;
    props.add(new THREE.SphereGeometry(r, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), COL.copper, M(tx, y + 0.78, tz));
    props.cyl(r + 0.01, r + 0.01, 0.03, 12, COL.drumHead, tx, y + 0.79, tz);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      props.bar(new THREE.Vector3(tx, y + 0.5, tz), new THREE.Vector3(tx + Math.cos(a) * 0.3, y, tz + Math.sin(a) * 0.3), 0.03, COL.stand);
    }
  }
  const propMesh = new THREE.Mesh(props.geometry(), lambert());
  propMesh.castShadow = propMesh.receiveShadow = true;
  scene.add(propMesh);

  // The conductor's score: the one object that will later turn into the boss
  const scoreMat = new THREE.MeshLambertMaterial({ color: COL.paper, emissive: 0x7a5c30, emissiveIntensity: 0.5 });
  const score = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.5, 0.01), scoreMat);
  score.position.set(C.x, STAGE_TOP + 1.31, C.z - 0.475);
  score.rotation.x = -0.42;
  scene.add(score);
  fx.scoreMat = scoreMat;

  // Grand piano at the front left, in concerto position, lid open toward the audience
  {
    const pk = new Kit();
    const outline = new THREE.Shape();
    outline.moveTo(0, 0);
    outline.lineTo(1.48, 0);
    outline.lineTo(1.48, 0.5);
    outline.bezierCurveTo(1.48, 1.05, 0.95, 1.05, 0.85, 1.45);
    outline.bezierCurveTo(0.75, 1.9, 0.45, 2.15, 0.15, 2.12);
    outline.lineTo(0, 2.05);
    outline.lineTo(0, 0);
    pk.add(slab(outline, 0.66, 0.98, 16), COL.pianoBlack);
    const lid = slab(outline, 0, 0.03, 16);
    pk.add(lid, COL.pianoBlack, new THREE.Matrix4().makeTranslation(0, 0.98, 0).multiply(new THREE.Matrix4().makeRotationZ(0.52)));
    pk.bar(new THREE.Vector3(1.2, 0.98, -0.9), new THREE.Vector3(1.05, 1.63, -0.9), 0.025, COL.pianoBlack);
    for (const [lx, lz] of [
      [0.18, -0.2],
      [1.3, -0.25],
      [0.2, -1.85],
    ]) {
      pk.box(0.1, 0.66, 0.1, COL.pianoBlack, lx, 0.33, lz);
    }
    pk.box(1.44, 0.07, 0.18, COL.ivory, 0.74, 0.74, 0.08);
    pk.box(1.36, 0.025, 0.09, COL.pianoBlack, 0.74, 0.79, 0.04);
    pk.box(1.48, 0.12, 0.06, COL.pianoBlack, 0.74, 0.7, 0.2);
    pk.box(0.82, 0.26, 0.02, COL.pianoBlack, 0.74, 1.12, -0.3, -0.3);
    pk.box(0.9, 0.07, 0.38, COL.pianoBlack, 0.74, 0.5, 0.75);
    for (const [bx, bz] of [
      [0.36, 0.6],
      [1.12, 0.6],
      [0.36, 0.9],
      [1.12, 0.9],
    ]) {
      pk.box(0.05, 0.47, 0.05, COL.pianoBlack, bx, 0.235, bz);
    }
    const piano = new THREE.Mesh(
      pk.geometry(),
      new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x6a6a6a, shininess: 90, flatShading: true }),
    );
    piano.castShadow = true;
    piano.position.set(-5.45, STAGE_TOP, -7.55);
    piano.rotation.y = -Math.PI / 2 + 0.18;
    scene.add(piano);
  }

  /* ---------- Lighting ---------- */
  await step('Hanging the lights');
  const cables = [];
  // Acoustic reflector ring over the orchestra
  const ringC = new THREE.Vector3(0, 11.4, -11.2);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = ringC.x + Math.cos(a) * 4.6;
    const z = ringC.z + Math.sin(a) * 4.6;
    const y = ringC.y + (i % 2) * 0.35;
    steady.cyl(1.0, 1.0, 0.08, 12, COL.acrylic, x, y, z, 0.2 * Math.sin(a), 0, -0.2 * Math.cos(a));
    cables.push(x, y, z, x, CEILING, z);
  }
  for (const [x, z, r] of [
    [0, ringC.z, 1.5],
    [-1.6, ringC.z + 1.9, 0.9],
    [1.6, ringC.z + 1.9, 0.9],
  ]) {
    steady.cyl(r, r, 0.08, 14, COL.acrylic, x, ringC.y + 0.8, z);
    cables.push(x, ringC.y + 0.8, z, x, CEILING, z);
  }

  // Lighting truss above the stage front, with fixtures aimed at the orchestra
  const trussZ = -4.6;
  const trussY = 10.9;
  for (const dy of [0, 0.42]) hall.box(17.4, 0.08, 0.08, COL.truss, 0, trussY + dy, trussZ);
  for (const dz of [-0.2, 0.2]) hall.box(17.4, 0.06, 0.06, COL.truss, 0, trussY + 0.21, trussZ + dz);
  for (let x = -8.5; x <= 8.51; x += 1) hall.box(0.04, 0.42, 0.04, COL.truss, x, trussY + 0.21, trussZ);
  for (const x of [-8, 8]) cables.push(x, trussY + 0.42, trussZ, x, CEILING, trussZ);
  for (let x = -8; x <= 8.01; x += 2) {
    const from = new THREE.Vector3(x, trussY - 0.25, trussZ);
    const aim = new THREE.Vector3(x * 0.45, STAGE_TOP + 0.5, -9.5);
    const dir = aim.clone().sub(from).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    hall.add(new THREE.CylinderGeometry(0.17, 0.14, 0.44, 8), COL.truss, new THREE.Matrix4().compose(from, q, new THREE.Vector3(1, 1, 1)));
    const lens = from.clone().addScaledVector(dir, 0.23);
    lamps.add(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 8), 0xfff2dc, new THREE.Matrix4().compose(lens, q, new THREE.Vector3(1, 1, 1)));
    glowBig.push([lens.x, lens.y - 0.05, lens.z, 0xffe2b5]);
  }

  const cableGeo = new THREE.BufferGeometry();
  cableGeo.setAttribute('position', new THREE.Float32BufferAttribute(cables, 3));
  scene.add(new THREE.LineSegments(cableGeo, new THREE.LineBasicMaterial({ color: 0x3a302a })));

  // Merge and add the static hall
  scene.add(new THREE.Mesh(hall.geometry(), lambert()));
  scene.add(new THREE.Mesh(panels.geometry(), wallMat));
  const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  scene.add(new THREE.Mesh(lamps.geometry(), lampMat));
  scene.add(new THREE.Mesh(steady.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true })));
  fx.lampMat = lampMat;

  // Glows: additive sprites instead of a bloom pass
  const glowTex = glowTexture();
  const glowPoints = (list, size, opacity) => {
    const pos = new Float32Array(list.length * 3);
    const col = new Float32Array(list.length * 3);
    list.forEach(([x, y, z, hex], i) => {
      pos.set([x, y, z], i * 3);
      const c = linear(hex);
      col.set([c.r, c.g, c.b], i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size,
        map: glowTex,
        vertexColors: true,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    scene.add(pts);
    return pts;
  };
  fx.glowBig = glowPoints(glowBig, 1.1, 0.6);
  fx.glowSmall = glowPoints(glowSmall, 0.45, 0.8);

  // Four lights in total. The stage is lit, the house is at half.
  const hemi = new THREE.HemisphereLight(0xffe0bb, 0x2c160c, 1.15);
  scene.add(hemi);

  const key = new THREE.SpotLight(0xffe4bd, 1250, 40, 0.74, 0.55, 2);
  key.position.set(0, trussY - 0.3, trussZ);
  key.target.position.set(0, STAGE_TOP, -10.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.camera.near = 4;
  key.shadow.camera.far = 24;
  scene.add(key, key.target);

  const wash = new THREE.SpotLight(0xffd2a3, 1150, 45, 0.5, 0.85, 2);
  wash.position.set(0, 15.5, -6.5);
  wash.target.position.set(0, 9.5, BACK_Z);
  scene.add(wash, wash.target);

  const house = new THREE.DirectionalLight(0xffcf9e, 0.7);
  house.position.set(0, 12, 22);
  house.target.position.set(0, 2, -6);
  scene.add(house, house.target);

  fx.lights = { hemi, key, wash, house };
  fx.base = { key: key.intensity, wash: wash.intensity };

  // Light shafts from the truss
  const tex = beamTexture();
  for (const [fx0, tx, tz, r, o] of [
    [0, 0, -7.6, 2.0, 0.075],
    [-4, -4.6, -6.9, 1.4, 0.05],
    [4, 3.4, -10, 1.6, 0.045],
  ]) {
    const s = shaft(new THREE.Vector3(fx0, trussY - 0.3, trussZ), new THREE.Vector3(tx, STAGE_TOP, tz), r, o, tex);
    scene.add(s.mesh);
    fx.shafts.push(s);
  }

  // Dust drifting through the light
  const dustN = 120;
  const dustPos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) {
    dustPos[i * 3] = (rand() - 0.5) * 9;
    dustPos[i * 3 + 1] = 2 + rand() * 8;
    dustPos[i * 3 + 2] = -11 + rand() * 6;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  fx.dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      color: 0xffe6bf,
      size: 0.05,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(fx.dust);

  scene.fog = new THREE.FogExp2(0x140b08, 0.011);
  scene.background = new THREE.Color(0x0e0806);

  return fx;
}
