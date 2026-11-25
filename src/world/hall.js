import * as THREE from 'three';
import { linear, M, Kit, slab, sector, lambert, instances, facing } from './kit.js';
import { buildOrchestra } from './orchestra.js';
import { buildCrowd } from './crowd.js';
import { BOARD, boardLayout } from '../lib/board.js';
import { BOOTH, buildBooth } from './booth.js';
import { BACKSTAGE, buildBackstage } from './backstage.js';
import { buildDesk } from './desk.js';

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
  acrylic: 0xa89a86, // unlit, so this reads as softly lit acrylic
  truss: 0x1a1819,
  pianoBlack: 0x0d0c0e,
  ivory: 0xf1ece0,
};

/* ------------------------------------------------------------------ helpers */



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

// Concert black for the conductor.
const BLACK = 0x18171a;
const SHIRT = 0xe9e4da;

// The conductor: a standing body, plus each arm as its own piece so it can move.
// Built facing +z; the arms reach forward from the shoulders.
function conductorKits() {
  const SKINTONE = 0x6b4430;
  const body = new Kit();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const sx of [-0.1, 0.1]) body.box(0.14, 0.9, 0.17, BLACK, sx, 0.45, 0);
  body.box(0.44, 0.66, 0.26, BLACK, 0, 1.23, 0);
  body.box(0.46, 0.5, 0.06, BLACK, 0, 1.0, -0.14); // tails of the jacket
  body.box(0.13, 0.22, 0.02, SHIRT, 0, 1.44, 0.135);
  body.box(0.1, 0.1, 0.1, SKINTONE, 0, 1.62, 0);
  body.add(new THREE.IcosahedronGeometry(0.12, 1), SKINTONE, M(0, 1.76, 0.01));
  body.add(new THREE.IcosahedronGeometry(0.126, 1), 0x241812, M(0, 1.8, -0.02, 0, 0, 0, 1, 0.6, 1));
  const arm = (withBaton) => {
    const k = new Kit();
    k.bar(V(0, 0, 0), V(0, -0.12, 0.26), 0.1, BLACK);
    k.bar(V(0, -0.12, 0.26), V(0, -0.02, 0.5), 0.085, BLACK);
    k.box(0.07, 0.07, 0.09, SKINTONE, 0, -0.01, 0.54);
    if (withBaton) k.bar(V(0, 0, 0.56), V(0, 0.06, 0.95), 0.012, 0xf4efe6);
    return k.geometry();
  };
  return { body: body.geometry(), right: arm(true), left: arm(false) };
}


// An orchestra chair: four legs, padded seat, small back. Faces +z.
function chairKit() {
  const k = new Kit();
  for (const sx of [-1, 1]) {
    k.box(0.03, 0.9, 0.03, COL.chair, sx * 0.19, 0.45, -0.19, -0.06); // raked back, under the backrest
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
  // A panelled wall, w by h metres. u0 and v0 shift the texture, so a wall built in pieces (around
  // an opening) still lines up.
  function panel(w, h, matrix, tint, u0 = 0, v0 = 0) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w + u0) / PANEL_TILE, (uv.getY(i) * h + v0) / PANEL_TILE);
    panels.add(g, tint, matrix);
  }

  /* ---------- Shell ---------- */
  await step('Raising the walls');
  const hallLen = REAR_Z - BACK_Z;
  const midZ = (REAR_Z + BACK_Z) / 2;
  panel(hallLen, CEILING, M(-WALL_X, CEILING / 2, midZ, 0, Math.PI / 2), COL.mapleDeep);
  hall.box(0.08, 1.1, hallLen, COL.mahogany, -(WALL_X - 0.04), 0.55, midZ); // dado
  // The right wall has an opening behind the stage door, where the backstage corridor runs out
  // of the hall. It is hidden by the panelling and the gallery except through the door.
  {
    const o0 = BACKSTAGE.z - BACKSTAGE.half - 0.05;
    const o1 = BACKSTAGE.z + BACKSTAGE.half + 0.05;
    const oTop = BACKSTAGE.floor + BACKSTAGE.height + 0.05;
    const at = (z0, z1, y0, y1) => panel(z1 - z0, y1 - y0, M(WALL_X, (y0 + y1) / 2, (z0 + z1) / 2, 0, -Math.PI / 2), COL.mapleDeep, z0 - BACK_Z, y0);
    at(BACK_Z, REAR_Z, oTop, CEILING);
    at(BACK_Z, o0, 0, oTop);
    at(o1, REAR_Z, 0, oTop);
    at(o0, o1, 0, BACKSTAGE.floor);
    hall.box(0.08, 1.1, o0 - BACK_Z, COL.mahogany, WALL_X - 0.04, 0.55, (BACK_Z + o0) / 2);
    hall.box(0.08, 1.1, REAR_Z - o1, COL.mahogany, WALL_X - 0.04, 0.55, (o1 + REAR_Z) / 2);
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

  /* ---------- Rooms you can see from the stalls ---------- */
  // Each room of the site is a real place in the hall (design document, section 7): the control
  // control booth high on the left wall (Work), the stage (Music), the stage door on the right,
  // open onto backstage (Services), the podium (About me), and the notice board beside the door.
  const ROOM_Z = -10.4;
  // The Booth: the control room above the left upper gallery, with two engineers at the desk.
  const booth = buildBooth(scene);
  glowSmall.push(...booth.glows);

  // The stage door: a frame in the panelling, the door swung wide open into the hall, and
  // backstage behind it.
  let back = null;
  {
    const { z: dz, w: dw, h: dh } = BACKSTAGE.door;
    const sill = BACKSTAGE.floor; // the door opens off the stage
    for (const s of [-1, 1]) hall.box(0.14, dh, 0.08, COL.mahogany, 11.27, sill + dh / 2, dz + s * (dw / 2 + 0.03));
    hall.box(0.14, 0.08, dw + 0.22, COL.mahogany, 11.27, sill + dh + 0.04, dz);
    hall.box(0.34, 0.04, dw, COL.walnut, 11.15, sill - 0.02, dz); // the threshold, from the stage's edge
    // Hinged on the side away from the audience and swung right back, so it never hides the way in.
    const open = 2.3; // how far the door is swung, in radians
    const leaf = dw - 0.06;
    const hinge = new THREE.Vector3(11.26, 0, dz - dw / 2);
    hall.box(0.05, dh - 0.06, leaf, COL.walnut, hinge.x - Math.sin(open) * (leaf / 2), sill + (dh - 0.06) / 2, hinge.z + Math.cos(open) * (leaf / 2), 0, -open);
    back = buildBackstage(scene);
  }

  // The Notice Board: a corkboard beside the stage door, with Wyclef's notes pinned on it. These
  // are painted notes, seen from across the hall; when the camera faces the board the real notes
  // (page elements, see world/board.js) are laid exactly over them, from the same layout.
  const BOARD_Z = BOARD.z;
  const FACE = BOARD.x - 0.07; // the cork's surface
  hall.box(0.08, BOARD.h, BOARD.w, COL.walnut, BOARD.x, BOARD.y, BOARD_Z);
  hall.box(0.04, BOARD.cork[1], BOARD.cork[0], 0xb07a45, FACE + 0.02, BOARD.y, BOARD_Z);
  const notes = new Kit();
  const { tabs, notes: noteList } = boardLayout();
  for (const t of tabs) notes.box(0.006, t.h, t.w, 0xf3ecdf, FACE - 0.004, BOARD.y + t.v, BOARD_Z + t.u);
  for (const n of noteList) {
    const colour = new THREE.Color(n.colour).getHex();
    notes.box(0.006, n.size, n.size, colour, FACE - 0.006, BOARD.y + n.v, BOARD_Z + n.u, n.tilt);
    notes.cyl(0.018, 0.018, 0.02, 8, new THREE.Color(n.pinColour).getHex(), FACE - 0.02, BOARD.y + n.v + n.size * 0.4, BOARD_Z + n.u, 0, 0, Math.PI / 2);
  }
  fx.boardNotes = new THREE.Mesh(notes.geometry(), lambert());
  scene.add(fx.boardNotes);
  // A brass picture lamp over the board, so it reads from across the hall.
  hall.box(0.06, 0.05, 1.4, COL.brass, FACE - 0.16, BOARD.y + BOARD.h / 2 + 0.06, BOARD_Z);
  for (const dz of [-0.5, 0.5]) hall.box(0.2, 0.025, 0.025, COL.brass, FACE - 0.08, BOARD.y + BOARD.h / 2 + 0.06, BOARD_Z + dz);
  steady.box(0.02, 0.025, 1.3, 0xffe9c4, FACE - 0.16, BOARD.y + BOARD.h / 2 + 0.03, BOARD_Z);
  glowBig.push([FACE - 0.3, BOARD.y + 0.62, BOARD_Z, 0xffd9a8]);
  glowSmall.push([FACE - 0.2, BOARD.y + BOARD.h / 2, BOARD_Z - 0.4, 0xffe2b0], [FACE - 0.2, BOARD.y + BOARD.h / 2, BOARD_Z + 0.4, 0xffe2b0]);
  // The desk under it, where visitors leave their notes.
  glowSmall.push(...buildDesk(scene).glows);

  /* ---------- Audience ---------- */
  await step('Seating the audience');
  const seatMx = [];
  const endMx = [];
  const seatTint = [];
  const tint = () => new THREE.Color(1, 1, 1).multiplyScalar(0.9 + rand() * 0.14);

  // Add a run of seats; `positions` are seat centres in order along the run.
  const audienceMx = []; // stalls and galleries; the choir terrace stays empty
  function seatRun(positions, faceAt, audience = true) {
    const mats = positions.map(([x, y, z]) => {
      const f = faceAt(x, y, z);
      return facing(x, y, z, f[0], f[1]);
    });
    if (audience) audienceMx.push(...mats);
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
    seatRun(run, (px, py, pz) => [px, pz + 5], false);
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

  // Panelling under the galleries, beside the stage. On the right it has the stage door cut
  // into it, which opens backstage (Services).
  {
    const len = 8.6;
    const zA = -12.6 - len / 2;
    const zB = -12.6 + len / 2;
    panel(len, 3.24, M(-11.3, 1.62, -12.6, 0, Math.PI / 2), COL.maple);
    const { z: dz, w: dw, h: dh } = BACKSTAGE.door;
    const sill = BACKSTAGE.floor;
    const d0 = dz - dw / 2;
    const d1 = dz + dw / 2;
    panel(d0 - zA, 3.24, M(11.3, 1.62, (zA + d0) / 2, 0, -Math.PI / 2), COL.maple);
    panel(zB - d1, 3.24, M(11.3, 1.62, (d1 + zB) / 2, 0, -Math.PI / 2), COL.maple, d1 - zA);
    panel(dw, 3.24 - sill - dh, M(11.3, sill + dh + (3.24 - sill - dh) / 2, dz, 0, -Math.PI / 2), COL.maple, d0 - zA, sill + dh);
    panel(dw, sill, M(11.3, sill / 2, dz, 0, -Math.PI / 2), COL.maple, d0 - zA);
    // A return at the panelling's open end, closing the space behind it (and the corridor) off
    // from the stalls.
    hall.box(WALL_X - 11.3, 3.42, 0.06, COL.mapleDeep, (WALL_X + 11.3) / 2, 1.71, zB);
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
  const C = CONDUCTOR;
  const onArc = (r, phi) => [C.x + r * Math.sin(phi), C.z - r * Math.cos(phi)];
  const PIANO_AT = new THREE.Vector3(-5.45, STAGE_TOP, -7.55);
  const PIANO_TURN = -Math.PI / 2 + 0.18;
  const benchSeat = new THREE.Matrix4()
    .compose(PIANO_AT, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, PIANO_TURN, 0)), new THREE.Vector3(1, 1, 1))
    .multiply(M(0.74, 0.04, 0.75, 0, Math.PI, 0));
  const orchestra = buildOrchestra({ C, levelY, onArc, rand, stageTop: STAGE_TOP, piano: benchSeat });
  scene.add(orchestra.mesh);
  const chairs = instances(chairKit(), lambert(), orchestra.chairMx);
  const stands = instances(standKit(), lambert(), orchestra.standMx);
  chairs.castShadow = stands.castShadow = true;
  scene.add(chairs, stands);
  fx.chairCount = orchestra.chairMx.length;
  fx.orchestraTriangles = orchestra.triangles;
  // Props on stage that cast shadows: the podium
  const props = new Kit();
  props.box(1.1, 0.24, 1.1, COL.walnut, C.x, STAGE_TOP + 0.12, C.z);
  props.box(1.0, 0.03, 1.0, COL.redCarpet, C.x, STAGE_TOP + 0.255, C.z);
  for (const sx of [-0.5, 0.5]) props.box(0.04, 0.95, 0.04, COL.brass, C.x + sx, STAGE_TOP + 0.7, C.z + 0.5);
  props.box(1.04, 0.045, 0.045, COL.brass, C.x, STAGE_TOP + 1.18, C.z + 0.5);
  props.box(0.03, 1.0, 0.03, COL.stand, C.x, STAGE_TOP + 0.75, C.z - 0.48);
  props.box(0.92, 0.56, 0.03, COL.stand, C.x, STAGE_TOP + 1.3, C.z - 0.5, -0.42);
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
    piano.position.copy(PIANO_AT);
    piano.rotation.y = PIANO_TURN;
    scene.add(piano);
  }

  /* ---------- People: the conductor beats time while music plays; a set house in the stalls ---------- */
  const personMat = lambert();

  // The conductor on the podium, facing the orchestra.
  const maestro = new THREE.Group();
  maestro.position.set(C.x, STAGE_TOP + 0.27, C.z);
  maestro.rotation.y = Math.PI;
  const ck = conductorKits();
  const body = new THREE.Mesh(ck.body, personMat);
  const rightArm = new THREE.Group();
  const leftArm = new THREE.Group();
  // Built facing +z, where a figure's right hand is on -x.
  rightArm.position.set(-0.24, 1.47, 0.02);
  leftArm.position.set(0.24, 1.47, 0.02);
  rightArm.rotation.set(0.55, 0, 0); // at rest until the music starts (see REST_R below)
  leftArm.rotation.set(0.5, 0, 0);
  rightArm.add(new THREE.Mesh(ck.right, personMat));
  leftArm.add(new THREE.Mesh(ck.left, personMat));
  maestro.add(body, rightArm, leftArm);
  maestro.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  scene.add(maestro);

  // The players move on the GPU (see orchestra.js); the conductor beats time here.
  //
  // A 4/4 pattern as seen from the orchestra: 1 straight down, 2 across to the left, 3 out to the
  // right, 4 up. Each beat lands at the bottom of a stroke (the ictus) exactly on the beat, and
  // the hand rebounds between beats. Beat 1 is the biggest stroke, and the rebound after beat 4
  // is the highest, because it is the preparation for the next downbeat.
  // While the music is counting in (beats < 0) the baton is held up, then the conductor gives
  // one beat of preparation, a small lift and a fall, into the orchestra's first downbeat.
  const SIDE = [0, -0.38, 0.42, 0.05]; // where each ictus is, across the body
  const DEPTH = [0.4, 0.26, 0.29, 0.22]; // how low each ictus is (arm rotation, + is down)
  const REBOUND = [0.1, 0.07, 0.1, 0.3]; // how high the hand rises after each beat
  const NEUTRAL = 0.05;
  const RAISED = -0.22; // baton up, ready
  const smooth = (a, b, x) => {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  // In About me the conductor turns round to face the audience, as at an encore.
  let encore = false;
  fx.setEncore = (on, instant) => {
    encore = on;
    if (instant) maestro.rotation.y = on ? 0 : Math.PI;
  };
  fx.orchestraState = () => ({
    amp: [...orchestra.state.amp],
    sway: [...orchestra.state.sway],
    loose: orchestra.state.u.uLoose.value,
    beat: orchestra.state.beat,
  });
  // The conductor's arms: rest (arms down, baton lowered) and how far into the beating they are.
  const REST_R = [0.55, 0, 0];
  const REST_L = [0.5, 0, 0];
  let conducting = 0;
  const settle = (arm, to, k) => {
    const r = arm.rotation;
    r.set(r.x + (to[0] - r.x) * k, r.y + (to[1] - r.y) * k, r.z + (to[2] - r.z) * k);
  };
  fx.animate = (t, dt, { beats = null, levels = null, bpm, focus = null } = {}) => {
    orchestra.animate(t, dt, { beats, levels, bpm, focus });
    crowd.animate(t, dt);
    const turn = encore ? 0 : Math.PI;
    maestro.rotation.y += (turn - maestro.rotation.y) * Math.min(1, dt * 2.2);
    // No music (the orchestra is tuning, or the piece has ended): the conductor lowers the arms,
    // unhurried, and waits.
    if (beats == null) {
      conducting = 0;
      const k = 1 - Math.exp(-dt / 0.6);
      settle(rightArm, REST_R, k);
      settle(leftArm, REST_L, k);
      return;
    }
    // Coming in, the arms rise into the pattern over half a second rather than jumping to it.
    conducting = Math.min(1, conducting + dt / 0.5);
    const b = beats;
    let lift; // arm rotation about x: higher values put the hand lower
    let side;
    let leftTo;
    if (b < 0) {
      const f = Math.max(0, 1 + b); // 0 until the preparatory beat, then 0 to 1 through it
      lift = f < 0.5 ? RAISED - 0.08 * Math.sin(Math.PI * (f / 0.5)) : RAISED + (NEUTRAL + DEPTH[0] - RAISED) * ((f - 0.5) / 0.5) ** 2;
      side = 0;
      leftTo = [-0.1, 0.12, 0];
    } else {
      const frac = b - Math.floor(b);
      const beat = Math.floor(b) % 4;
      const next = (beat + 1) % 4;
      const up = Math.sin(Math.PI * frac); // 0 at each ictus, 1 at the top of the rebound
      const depth = DEPTH[beat] + (DEPTH[next] - DEPTH[beat]) * frac;
      lift = NEUTRAL + depth * (1 - up) - REBOUND[beat] * up;
      side = SIDE[beat] + (SIDE[next] - SIDE[beat]) * smooth(0.15, 0.9, frac);
      leftTo = [0.15 + 0.06 * (1 - up), 0.15 - side * 0.3, 0];
    }
    const k = conducting < 1 ? 1 - Math.exp(-dt / 0.12) : 1;
    settle(rightArm, [lift, -side, 0], k);
    settle(leftArm, leftTo, k);
  };

  // The audience: the same people in the same seats on every visit, scattered so the hall reads
  // as a real house, with gaps, rather than filling row by row. About two thirds of the seats are
  // taken; the empty ones are where visitors who leave a note on the board will sit (stage S3).
  for (let i = audienceMx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [audienceMx[i], audienceMx[j]] = [audienceMx[j], audienceMx[i]];
  }
  const crowd = buildCrowd(scene, audienceMx, rand, { stageTop: STAGE_TOP, stageFrontZ });
  const HOUSE = 0.66;
  crowd.setCount(Math.round(audienceMx.length * HOUSE));
  fx.celebrate = (instant, now) => crowd.celebrate(instant, now);
  fx.animate(0, 0.1); // the first pose, before any music

  /* ---------- Rooms: what can be clicked, where its marker sits, where the follow spot points ---------- */
  const box = (w, h, d, x, y, z) => {
    const k = new Kit();
    k.box(w, h, d, 0xffffff, x, y, z);
    return k;
  };
  const proxies = {
    work: box(BOOTH.glassX - BOOTH.backX + 0.2, BOOTH.roofY - BOOTH.floorY + 0.2, BOOTH.width + 0.2, (BOOTH.glassX + BOOTH.backX) / 2, (BOOTH.floorY + BOOTH.roofY) / 2, BOOTH.z),
    music: box(16, 2.6, 10, 0, STAGE_TOP + 1.3, -12.2), // the orchestra, not the whole stage
    services: box(0.9, BACKSTAGE.door.h + 0.2, 1.7, 11.0, BACKSTAGE.floor + BACKSTAGE.door.h / 2, ROOM_Z),
    wall: box(1.0, BOARD.y + BOARD.h / 2 - STAGE_TOP, BOARD.w, 10.9, (STAGE_TOP + BOARD.y + BOARD.h / 2) / 2, BOARD_Z), // board and desk
    about: box(1.4, 2.4, 1.6, C.x, STAGE_TOP + 1.2, C.z),
  };
  const proxyMat = new THREE.MeshBasicMaterial();
  const at = (v, dy) => v.clone().setY(v.y + dy);
  const roomAnchors = {
    work: new THREE.Vector3(BOOTH.glassX + 0.2, BOOTH.roofY + 0.45, BOOTH.z),
    music: new THREE.Vector3(0, STAGE_TOP + 3.6, -12.5),
    services: new THREE.Vector3(10.9, BACKSTAGE.floor + BACKSTAGE.door.h + 0.35, ROOM_Z),
    wall: new THREE.Vector3(10.9, BOARD.y + BOARD.h / 2 + 0.4, BOARD_Z),
    about: new THREE.Vector3(C.x, STAGE_TOP + 2.2, C.z),
  };
  // What each room's camera frames: the object's centre, the way it faces (out into the hall),
  // the size to fit on screen (width, height, in metres, with some room around it) and the eye
  // height to look from. The camera is placed in front of it from these (see world/index.js).
  // Music and About me are views of the stage, so they are set as a position and a target.
  fx.views = {
    work: { at: [BOOTH.glassX, 9.95, BOOTH.z], face: [1, 0, 0], size: [BOOTH.width + 0.5, 2.15], eye: 10.15 },
    // Services: backstage, from the far end of the passage, looking back along the posters to the
    // lit stage door.
    // Services: the stage door, straight on, with the corridor running away behind it.
    services: { at: [11.3, BACKSTAGE.floor + 1.15, BACKSTAGE.door.z], face: [-1, 0, 0], size: [3.4, 2.9], eye: BACKSTAGE.floor + 1.6 },
    wall: { at: [BOARD.x - 0.07, BOARD.y, BOARD_Z], face: [-1, 0, 0], size: [BOARD.w + 0.3, BOARD.h + 0.35], eye: BOARD.y + 0.1 },
    // The desk under the board, seen from in front and above, as when standing to write.
    desk: { pos: [9.85, 3.05, -14.4], target: [10.86, 1.77, -14.4] },
    music: { pos: [0, 5.6, 1.5], target: [0, 2.6, -13] },
    // About me: from the front stalls, facing the podium; the conductor turns to the house.
    about: { pos: [C.x, STAGE_TOP + 1.1, C.z + 6.2], target: [C.x, STAGE_TOP + 1.35, C.z - 0.6] },
  };

  fx.sections = {};
  for (const [id, kit] of Object.entries(proxies)) {
    const mesh = new THREE.Mesh(kit.geometry(), proxyMat);
    mesh.visible = false; // never drawn; only used to find what the pointer is over
    mesh.userData.section = id;
    scene.add(mesh);
    fx.sections[id] = { id, proxy: mesh, anchor: roomAnchors[id], focus: at(roomAnchors[id], -1.4) };
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
  const cableLines = new THREE.LineSegments(cableGeo, new THREE.LineBasicMaterial({ color: 0x3a302a }));
  scene.add(cableLines);

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

  // Backstage's lamps: low until Services is chosen, then they come up, and go down again when the
  // visitor leaves.
  const backGlow = glowPoints(back.lamps, 0.55, 0);
  const DIM = 0.22;
  let backWant = 0;
  let backLevel = 0;
  const setBack = (v) => {
    backLevel = v;
    back.mesh.material.color.setScalar(DIM + (1 - DIM) * v);
    backGlow.material.opacity = 0.85 * v;
  };
  setBack(0);
  fx.setBackstageLit = (on, instant) => {
    backWant = on ? 1 : 0;
    if (instant) setBack(backWant);
  };
  fx.stepBackstage = (dt) => {
    if (Math.abs(backWant - backLevel) < 0.002) return false;
    setBack(backLevel + (backWant - backLevel) * Math.min(1, dt * 2.5));
    return true;
  };

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

  // A follow spot that moves to whichever section is hovered or open.
  const follow = new THREE.SpotLight(0xfff0d8, 0, 34, 0.2, 0.55, 2);
  follow.position.set(0, 13, 2);
  follow.target.position.set(0, 1, -9);
  scene.add(follow, follow.target);

  fx.lights = { hemi, key, wash, house, follow };
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
      map: glowTex,
      size: 0.06,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(fx.dust);

  // Things that only make sense once the lights are on; hidden while the hall is a wireframe.
  fx.lit = [cableLines, fx.glowBig, fx.glowSmall, fx.dust, ...fx.shafts.map((x) => x.mesh)];

  scene.fog = new THREE.FogExp2(0x140b08, 0.011);
  scene.background = new THREE.Color(0x0e0806);

  return fx;
}
