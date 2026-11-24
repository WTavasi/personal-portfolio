import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { linear, M, Kit, facing, UP } from './kit.js';

// The orchestra: every player, instrument and bow, merged into one mesh (one draw call).
//
// Each figure is modelled once per instrument as a template, then copied into place with its own
// skin and hair colour. Movement happens on the GPU: every vertex carries the point its player
// sways around, and the parts that move (a bowing forearm with its bow, a timpanist's mallet
// arm) also carry the elbow they turn around. The CPU only updates a handful of numbers a frame.
//
// Templates are written as the player sees it: +z is forward (toward the conductor) and +x is
// the player's right. They are mirrored once when built, because in three.js a figure facing +z
// has its right hand on -x.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rad = THREE.MathUtils.degToRad;

// Section numbers used by the shader. -1 never moves (instruments that stand on the floor).
export const SEC = { experience: 0, projects: 1, skills: 2, certifications: 3, education: 4, piano: 5 };
const FIXED = -1;

/* --------------------------------------------------------------------- palette */

const BLACK = 0x18171a;
const SHIRT = 0xe9e4da;
const SHOE = 0x0c0b0c;
const VARNISH = 0x8a3a12; // violins and violas
const VARNISH_DEEP = 0x6a2a0e; // cellos and basses
const EBONY = 0x111014;
const BRIDGE = 0xd9b98a;
const STRING = 0x8f8a80;
const STEEL = 0x8c8c90;
const STICK = 0x4a2410;
const HAIR_WHITE = 0xece6d6;
const SILVER = 0xc9ccd2;
const BLACKWOOD = 0x1a1719;
const MAPLE_RED = 0x6a2c16;
const REED = 0xc8a46a;
const BRASS = 0xd6a842;
const COPPER = 0xa8653a;
const DRUM_HEAD = 0xe8dfcc;
const RIM = 0x2a2a2c;
const ROSEWOOD = 0x7a3818;
const ALU = 0xd8dbe0;
const FELT = 0xf0ece4;
const CASE = 0x241e1c;
const PAPER = 0xefe6d2;

const SKIN = [0x4a2f22, 0x6b4430, 0x8a5a3c, 0xa87150, 0xc48e68, 0xddb08c, 0x5c3a28, 0x7a4e36];
const HAIR = [0x1c130e, 0x2a1d16, 0x1c130e, 0x3b2a1e, 0x4a3420, 0x2a1d16, 0x6b5030, 0x8a8078];

/* ------------------------------------------------------------- template rig */

function indexed(g) {
  if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
  return g;
}

// A basis whose y axis runs along `yDir` and whose z axis is as close to `zHint` as possible.
function basis(origin, yDir, zHint) {
  const y = yDir.clone().normalize();
  const z = zHint.clone().addScaledVector(y, -zHint.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(origin);
}

// Two-bone reach: where the elbow goes when the shoulder is at S and the hand at G.
const ARM_A = 0.3;
const ARM_B = 0.34;
function ik(S, G, pole) {
  const d = G.clone().sub(S);
  const L = Math.min(d.length(), ARM_A + ARM_B - 0.002);
  d.normalize();
  const x = (ARM_A * ARM_A - ARM_B * ARM_B + L * L) / (2 * L);
  const h = Math.sqrt(Math.max(0, ARM_A * ARM_A - x * x));
  const p = pole.clone().addScaledVector(d, -pole.dot(d)).normalize();
  return S.clone().addScaledVector(d, x).addScaledVector(p, h);
}

class Rig {
  constructor() {
    this.parts = [];
    this.moves = [null];
    this.cur = 0;
  }
  // Parts added after this turn around `joint` (an elbow) while their section plays.
  move(joint, axis, amp, phase = 0) {
    this.moves.push({ joint: joint.clone(), axis: axis.clone().normalize(), amp, phase, kind: 'turn' });
    this.cur = this.moves.length - 1;
    return this;
  }
  // Parts added after this slide along `axis` while their section plays, up to `length` metres
  // each way, each point by `weight(point)` of that (1 moves fully, 0 stays put): a bow stroke.
  slide(axis, length, weight, phase = 0) {
    this.moves.push({ joint: V(0, 0, 0), axis: axis.clone().normalize(), amp: length, phase, kind: 'slide', weight });
    this.cur = this.moves.length - 1;
    return this;
  }
  still() {
    this.cur = 0;
    return this;
  }
  add(geo, color, matrix) {
    const g = indexed(geo);
    if (matrix) g.applyMatrix4(matrix);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.clearGroups();
    this.parts.push({ g, color, move: this.cur });
    return this;
  }
  box(w, h, d, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, M(x, y, z, rx, ry, rz));
  }
  ball(r, color, p, s = [1, 1, 1], detail = 1) {
    const g = detail ? new THREE.SphereGeometry(r, 9, 6) : new THREE.SphereGeometry(r, 6, 4);
    return this.add(g, color, new THREE.Matrix4().compose(p, new THREE.Quaternion(), V(...s)));
  }
  // A round tube from a to b, radius ra at a and rb at b.
  tube(a, b, ra, rb, color, seg = 6, open = false) {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1));
    return this.add(new THREE.CylinderGeometry(rb, ra, len, seg, 1, open), color, m);
  }
  // A flat board from a to b, `w` wide, `t` thick, its face turned toward `hint`.
  plank(a, b, w, t, color, hint = UP) {
    const len = a.distanceTo(b);
    const m = basis(a.clone().add(b).multiplyScalar(0.5), b.clone().sub(a), hint);
    return this.add(new THREE.BoxGeometry(w, len, t), color, m);
  }
  bar(a, b, t, color) {
    return this.tube(a, b, t / 2, t / 2, color, 4);
  }
  build() {
    const pt = new THREE.Vector3();
    const geos = this.parts.map(({ g, color, move }) => {
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      const tone = new Float32Array(n);
      const mv = new Float32Array(n).fill(move);
      const wt = new Float32Array(n).fill(1);
      const weight = this.moves[move]?.weight;
      const c = typeof color === 'number' ? linear(color) : null;
      for (let i = 0; i < n; i++) {
        if (c) col.set([c.r, c.g, c.b], i * 3);
        tone[i] = color === 'skin' ? 1 : color === 'hair' ? 2 : 0;
        if (weight) wt[i] = weight(pt.fromBufferAttribute(g.attributes.position, i));
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aTone', new THREE.BufferAttribute(tone, 1));
      g.setAttribute('aMove', new THREE.BufferAttribute(mv, 1));
      g.setAttribute('aW', new THREE.BufferAttribute(wt, 1));
      return g;
    });
    const geo = mergeGeometries(geos, false);
    // Mirror x (see the note at the top) and reverse the winding so faces still point outward.
    const p = geo.attributes.position;
    const nr = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      p.setX(i, -p.getX(i));
      nr.setX(i, -nr.getX(i));
    }
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    const moves = this.moves.map((m) => m && { ...m, weight: null, joint: m.joint.clone().setX(-m.joint.x), axis: m.axis.clone().setX(-m.axis.x) });
    return { geo, moves };
  }
}

/* ---------------------------------------------------------------- the body */

// A box tapered from wTop to wBot, d deep, h tall, centred on the origin.
function taper(wTop, wBot, d, h) {
  const g = new THREE.CylinderGeometry(wTop / Math.SQRT2, wBot / Math.SQRT2, h, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(1, 1, d / wTop);
  return g;
}

// Torso, head and shoulders above a pelvis at height y0 (0.6 seated, 1.0 standing).
function upper(r, y0) {
  r.box(0.35, 0.17, 0.25, BLACK, 0, y0, -0.02);
  r.add(taper(0.41, 0.33, 0.22, 0.5), BLACK, M(0, y0 + 0.3, -0.04, -0.05));
  r.box(0.11, 0.2, 0.012, SHIRT, 0, y0 + 0.43, 0.068, -0.05);
  r.box(0.07, 0.025, 0.015, BLACK, 0, y0 + 0.51, 0.074);
  r.tube(V(0, y0 + 0.53, -0.03), V(0, y0 + 0.63, -0.025), 0.05, 0.045, 'skin', 6);
  const head = V(0, y0 + 0.71, -0.02);
  r.ball(0.1, 'skin', head, [0.9, 1.1, 0.98]);
  r.ball(0.104, 'hair', head.clone().add(V(0, 0.036, -0.02)), [0.94, 0.8, 1.0]);
  r.box(0.022, 0.035, 0.03, 'skin', 0, y0 + 0.7, 0.083);
  return {
    L: V(-0.19, y0 + 0.53, -0.04),
    R: V(0.19, y0 + 0.53, -0.04),
    mouth: V(0, y0 + 0.665, 0.085),
  };
}

function seatedLegs(r, spread = 0.1) {
  for (const sx of [-1, 1]) {
    const hip = V(sx * 0.1, 0.56, 0);
    const knee = V(sx * spread, 0.55, 0.43);
    const ankle = V(sx * (spread + 0.01), 0.09, 0.47);
    r.tube(hip, knee, 0.075, 0.062, BLACK, 6);
    r.tube(knee, ankle, 0.058, 0.045, BLACK, 6);
    r.box(0.095, 0.07, 0.25, SHOE, ankle.x, 0.035, ankle.z + 0.06);
  }
}

function standingLegs(r) {
  for (const sx of [-1, 1]) {
    const hip = V(sx * 0.1, 0.96, 0);
    const knee = V(sx * 0.11, 0.53, 0.03);
    const ankle = V(sx * 0.12, 0.09, 0.01);
    r.tube(hip, knee, 0.075, 0.062, BLACK, 6);
    r.tube(knee, ankle, 0.058, 0.045, BLACK, 6);
    r.box(0.095, 0.07, 0.25, SHOE, ankle.x, 0.035, ankle.z + 0.06);
  }
}

// Forearm and hand from the elbow E to the grip point G.
function forearm(r, E, G, hint = UP) {
  const d = G.clone().sub(E).normalize();
  const W = G.clone().addScaledVector(d, -0.06);
  r.tube(E, W, 0.042, 0.034, BLACK, 6);
  r.plank(W, G.clone().addScaledVector(d, 0.035), 0.07, 0.035, 'skin', hint);
}

// A whole arm that holds still: shoulder S, hand at G, elbow bent toward `pole`.
function arm(r, S, G, pole, hint) {
  const E = ik(S, G, pole);
  r.tube(S, E, 0.05, 0.043, BLACK, 6);
  forearm(r, E, G, hint);
  return E;
}

// An arm whose forearm swings around the elbow (a bow stroke or a mallet stroke). Anything
// added inside `held` swings with the hand.
function swingingArm(r, S, G, pole, axisFrom, amp, phase, held) {
  const E = ik(S, G, pole);
  r.tube(S, E, 0.05, 0.043, BLACK, 6);
  r.move(E, axisFrom(E), amp, phase);
  forearm(r, E, G);
  held?.();
  r.still();
  return E;
}

/* ---------------------------------------------------------- string family */

const V2 = (x, y) => new THREE.Vector2(x, y);
// The outline of a violin-family body: lower bout, C-shaped waist, upper bout.
function bodyOutline(L, wl, wu, ww) {
  const h = L / 2;
  const a = wl / 2;
  const b = wu / 2;
  const c = ww / 2;
  const curves = [
    new THREE.CubicBezierCurve(V2(0, -h), V2(a * 0.62, -h), V2(a, -h * 0.82), V2(a, -h * 0.42)),
    new THREE.CubicBezierCurve(V2(a, -h * 0.42), V2(a, -h * 0.1), V2(c * 1.08, -h * 0.2), V2(c, h * 0.04)),
    new THREE.CubicBezierCurve(V2(c, h * 0.04), V2(c * 1.08, h * 0.26), V2(b, h * 0.16), V2(b, h * 0.48)),
    new THREE.CubicBezierCurve(V2(b, h * 0.48), V2(b, h * 0.82), V2(b * 0.55, h), V2(0, h)),
  ];
  const right = [];
  curves.forEach((cv, i) => right.push(...cv.getPoints(5).slice(i ? 1 : 0)));
  const left = right
    .slice(1, -1)
    .reverse()
    .map((p) => V2(-p.x, p.y));
  return new THREE.Shape([...right, ...left]);
}

// Real proportions in metres: body length, lower/upper bout and waist widths, rib depth,
// neck length (nut to body), bow length.
const VIOLIN = { L: 0.355, wl: 0.205, wu: 0.168, ww: 0.112, ribs: 0.032, neck: 0.13, bow: 0.75, stick: 0.008, body: VARNISH };
const VIOLA = { L: 0.405, wl: 0.235, wu: 0.19, ww: 0.13, ribs: 0.038, neck: 0.15, bow: 0.74, stick: 0.009, body: VARNISH };
const CELLO = { L: 0.755, wl: 0.44, wu: 0.345, ww: 0.235, ribs: 0.12, neck: 0.29, bow: 0.72, stick: 0.011, body: VARNISH_DEEP };
const BASS = { L: 1.1, wl: 0.66, wu: 0.52, ww: 0.37, ribs: 0.19, neck: 0.44, bow: 0.71, stick: 0.012, body: VARNISH_DEEP };

// One instrument in the frame B (y toward the scroll, z out of the top plate, origin at the
// centre of the body). Returns the points the hands and bow need, in the player's frame.
function stringed(r, B, s, endpin = 0) {
  const top = s.ribs / 2;
  const bh = s.L * 0.09; // bridge height
  const P = (x, y, z) => V(x, y, z).applyMatrix4(B);
  const at = (m) => B.clone().multiply(m);
  const neckTop = s.L / 2 + s.neck;
  r.add(new THREE.ExtrudeGeometry(bodyOutline(s.L, s.wl, s.wu, s.ww), { depth: s.ribs, bevelEnabled: false }), s.body, at(M(0, 0, -top)));
  for (const sx of [-1, 1]) r.add(new THREE.BoxGeometry(s.L * 0.016, s.L * 0.2, 0.003), EBONY, at(M(sx * s.ww * 0.44, -s.L * 0.05, top + 0.001, 0, 0, sx * 0.1)));
  r.add(new THREE.BoxGeometry(s.wu * 0.42, bh, s.L * 0.012), BRIDGE, at(M(0, -s.L * 0.08, top + bh / 2)));
  r.add(new THREE.BoxGeometry(s.wu * 0.24, s.L * 0.24, s.L * 0.02), EBONY, at(M(0, -s.L * 0.35, top + bh * 0.3)));
  r.add(new THREE.BoxGeometry(s.wu * 0.16, s.neck + 0.01, s.ribs * 0.55), s.body, at(M(0, s.L / 2 + s.neck / 2, top * 0.3)));
  r.add(new THREE.BoxGeometry(s.wu * 0.2, neckTop - s.L * 0.06, s.L * 0.016), EBONY, at(M(0, (neckTop + s.L * 0.06) / 2, top + bh * 0.55)));
  r.add(new THREE.BoxGeometry(s.wu * 0.13, s.neck * 0.28, s.ribs * 0.6), s.body, at(M(0, neckTop + s.neck * 0.14, top * 0.4)));
  r.ball(s.L * 0.045, s.body, P(0, neckTop + s.neck * 0.33, top * 0.3), [0.7, 1, 1], 0);
  // the strings: from the tailpiece, over the bridge, down the fingerboard to the nut
  const face = V(B.elements[8], B.elements[9], B.elements[10]).normalize();
  const bridgeTop = P(0, -s.L * 0.08, top + bh);
  r.plank(P(0, -s.L * 0.24, top + bh * 0.5), bridgeTop, s.wu * 0.07, 0.002, STRING, face);
  r.plank(bridgeTop, P(0, neckTop, top + bh * 0.62), s.wu * 0.055, 0.002, STRING, face);
  if (endpin) r.bar(P(0, -s.L / 2, 0), P(0, -s.L / 2 - endpin, 0), 0.012, STEEL);
  return {
    // where the bow hair meets the strings, between bridge and fingerboard
    contact: P(0, -s.L * 0.015, top + bh * 0.88),
    across: V(B.elements[0], B.elements[1], B.elements[2]).normalize(),
    normal: face,
    neck: (f) => P(0, s.L / 2 + s.neck * f, top * 0.2),
  };
}

// A bow lying across the strings, its hair through `contact`, frog toward the player's right.
// A stroke is what a real one is: the bow slides along its own length across the strings, so the
// hair stays on them and never cuts through the instrument or the player. The hand goes with the
// frog, the forearm follows it, and the upper arm moves a little from the shoulder.
function bowingArm(r, S, ins, s, pole, stroke) {
  const f = ins.across.clone();
  if (f.x < 0) f.negate();
  const tip = f.clone().negate();
  const along = THREE.MathUtils.clamp(S.clone().sub(ins.contact).dot(f), 0.12, s.bow * 0.6);
  const frog = ins.contact.clone().addScaledVector(f, along);
  const G = frog.clone().addScaledVector(tip, 0.05);
  const n = ins.normal;
  const E = ik(S, G, pole);
  // How far along a segment a point is, 0 at a and 1 at b.
  const share = (a, b) => {
    const ab = b.clone().sub(a);
    const len2 = ab.lengthSq();
    return (p) => THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / len2, 0, 1);
  };
  const upperArm = share(S, E);
  const lowerArm = share(E, G);
  r.slide(tip, stroke, (p) => 0.3 * upperArm(p));
  r.tube(S, E, 0.05, 0.043, BLACK, 6);
  r.slide(tip, stroke, (p) => 0.3 + 0.7 * lowerArm(p));
  forearm(r, E, G);
  r.slide(tip, stroke, () => 1);
  const end = frog.clone().addScaledVector(tip, s.bow);
  r.tube(frog.clone().addScaledVector(n, s.stick * 2.2), end.clone().addScaledVector(n, s.stick * 1.6), s.stick * 0.6, s.stick * 0.4, STICK, 5);
  r.plank(frog, end, s.stick * 1.2, 0.002, HAIR_WHITE, n);
  r.plank(frog.clone().addScaledVector(tip, -0.012), frog.clone().addScaledVector(tip, 0.045), s.stick * 2.2, s.stick * 2.6, EBONY, n);
  r.bar(end, end.clone().addScaledVector(n, s.stick * 2.4), s.stick * 0.9, HAIR_WHITE);
  r.still();
}

function violinist(s) {
  const r = new Rig();
  seatedLegs(r);
  const b = upper(r, 0.6);
  // Lower end on the left collarbone under the chin, scroll forward and to the left, top
  // plate rolled toward the right.
  const d = V(-0.68, -0.09, 0.73).normalize();
  const base = V(-0.07, 1.155, 0.035);
  const B = basis(base.clone().addScaledVector(d, s.L / 2), d, V(0.42, 0.9, 0.05));
  const ins = stringed(r, B, s);
  arm(r, b.L, ins.neck(0.42).addScaledVector(ins.normal, -0.025), V(0.2, -1, 0.1), ins.normal);
  bowingArm(r, b.R, ins, s, V(0.6, -0.8, -0.2), 0.2);
  return r.build();
}

function cellist() {
  const r = new Rig();
  seatedLegs(r, 0.23);
  const b = upper(r, 0.6);
  // Between the knees, leaning back onto the chest, the scroll beside the left ear (not in the
  // player's head).
  const d = V(-0.2, 1, -0.36).normalize();
  const bottom = V(0, 0.25, 0.42);
  const B = basis(bottom.clone().addScaledVector(d, CELLO.L / 2), d, V(0.2, 0.35, 0.92));
  const ins = stringed(r, B, CELLO, bottom.y / d.y);
  arm(r, b.L, ins.neck(0.32).addScaledVector(ins.normal, -0.05), V(-1, -0.3, 0.1), ins.normal);
  bowingArm(r, b.R, ins, CELLO, V(0.8, -0.5, -0.3), 0.22);
  return r.build();
}

function bassist() {
  const r = new Rig();
  standingLegs(r);
  const b = upper(r, 1.0);
  // Standing behind the bass, which leans back against the body, the neck past the left side of
  // the head (clear of the hair).
  const d = V(-0.12, 1, -0.3).normalize();
  const bottom = V(-0.06, 0.46, 0.36);
  const B = basis(bottom.clone().addScaledVector(d, BASS.L / 2), d, V(0.25, 0.3, 0.92));
  const ins = stringed(r, B, BASS, bottom.y / d.y);
  arm(r, b.L, ins.neck(0.3).addScaledVector(ins.normal, -0.07), V(-1, -0.2, 0.2), ins.normal);
  bowingArm(r, b.R, ins, BASS, V(0.8, -0.6, -0.2), 0.18);
  return r.build();
}

/* -------------------------------------------------------------- woodwinds */

function flutist() {
  const r = new Rig();
  seatedLegs(r);
  const b = upper(r, 0.6);
  // Held level to the right; the mouth hole sits under the lip, a hand's width from the end.
  const f = V(1, -0.13, 0.32).normalize();
  const a = b.mouth.clone().addScaledVector(f, -0.07).add(V(0, -0.012, 0.014));
  const e = a.clone().addScaledVector(f, 0.67);
  r.tube(a, e, 0.0095, 0.0095, SILVER, 8);
  r.plank(a.clone().addScaledVector(f, 0.045), a.clone().addScaledVector(f, 0.095), 0.024, 0.004, SILVER, V(0, 0.4, 1));
  for (const k of [0.27, 0.36, 0.45, 0.55]) r.tube(a.clone().addScaledVector(f, k), a.clone().addScaledVector(f, k + 0.012), 0.012, 0.012, SILVER, 8);
  arm(r, b.L, a.clone().addScaledVector(f, 0.19).add(V(0, -0.015, 0.01)), V(-0.6, -1, 0));
  arm(r, b.R, a.clone().addScaledVector(f, 0.42).add(V(0, -0.015, 0.012)), V(0.6, -1, -0.1));
  return r.build();
}

// Oboe and clarinet: straight, played down and forward from the mouth.
function reedPlayer(kind) {
  const r = new Rig();
  seatedLegs(r);
  const b = upper(r, 0.6);
  const o = V(0, -0.76, 0.64).normalize();
  const m = b.mouth.clone().add(V(0, -0.004, 0.004));
  const P = (k) => m.clone().addScaledVector(o, k);
  if (kind === 'oboe') {
    r.tube(m, P(0.05), 0.003, 0.005, REED, 5);
    r.tube(P(0.05), P(0.6), 0.009, 0.016, BLACKWOOD, 8);
    r.tube(P(0.6), P(0.66), 0.016, 0.03, BLACKWOOD, 10);
    for (const k of [0.22, 0.4]) r.tube(P(k), P(k + 0.012), 0.014, 0.014, SILVER, 8);
  } else {
    r.tube(m, P(0.08), 0.007, 0.012, BLACKWOOD, 8);
    r.tube(P(0.06), P(0.075), 0.014, 0.014, SILVER, 8); // ligature
    r.tube(P(0.08), P(0.6), 0.012, 0.014, BLACKWOOD, 8);
    r.tube(P(0.6), P(0.67), 0.014, 0.036, BLACKWOOD, 10);
    for (const k of [0.14, 0.33, 0.58]) r.tube(P(k), P(k + 0.012), 0.016, 0.016, SILVER, 8);
  }
  arm(r, b.L, P(0.22).add(V(0, 0, 0.012)), V(-0.8, -0.7, 0));
  arm(r, b.R, P(0.44).add(V(0, 0, 0.012)), V(0.8, -0.7, 0));
  return r.build();
}

function bassoonist() {
  const r = new Rig();
  seatedLegs(r);
  const b = upper(r, 0.6);
  // The boot rests by the right hip and the long joint rises past the left shoulder.
  const lo = V(0.26, 0.4, 0.25);
  const hi = V(-0.13, 1.74, 0.07);
  const along = hi.clone().sub(lo).normalize();
  const side = new THREE.Vector3().crossVectors(along, V(0, 0, 1)).normalize();
  const P = (k) => lo.clone().lerp(hi, k);
  r.tube(lo, hi, 0.038, 0.042, MAPLE_RED, 8);
  r.tube(lo.clone().addScaledVector(side, 0.06), P(0.45).addScaledVector(side, 0.06), 0.03, 0.03, MAPLE_RED, 8);
  r.tube(lo.clone().addScaledVector(along, -0.02), lo.clone().addScaledVector(along, 0.1), 0.06, 0.06, MAPLE_RED, 8);
  r.tube(hi, hi.clone().addScaledVector(along, 0.03), 0.046, 0.046, SHIRT, 8);
  // the bocal: a thin curved metal pipe from the reed to the wing joint
  const q = b.mouth.clone().add(V(0.05, -0.06, 0.08));
  r.tube(b.mouth, q, 0.004, 0.005, SILVER, 5);
  r.tube(q, P(0.44).addScaledVector(side, 0.06).add(V(0, 0, 0.03)), 0.005, 0.006, SILVER, 5);
  arm(r, b.L, P(0.66).add(V(0, 0, 0.04)), V(-0.8, -0.6, 0));
  arm(r, b.R, P(0.2).add(V(0, 0, 0.05)), V(0.9, -0.3, -0.2));
  return r.build();
}

/* ------------------------------------------------------------------- brass */

function trumpeter() {
  const r = new Rig();
  seatedLegs(r);
  const b = upper(r, 0.6);
  const t = V(0, -0.12, 1).normalize();
  const m = b.mouth;
  const P = (k, dy = 0) => m.clone().addScaledVector(t, k).add(V(0, dy, 0));
  r.tube(m, P(0.07), 0.006, 0.01, SILVER, 6);
  r.tube(P(0.07), P(0.36), 0.007, 0.008, BRASS, 6);
  r.tube(P(0.1, -0.055), P(0.33, -0.055), 0.008, 0.008, BRASS, 6);
  r.bar(P(0.1), P(0.1, -0.055), 0.014, BRASS);
  r.bar(P(0.33), P(0.33, -0.055), 0.014, BRASS);
  for (const k of [0.18, 0.21, 0.24]) r.tube(P(k, -0.07), P(k, 0.035), 0.011, 0.011, BRASS, 8);
  r.tube(P(0.36), P(0.5), 0.01, 0.062, BRASS, 12, true);
  arm(r, b.L, P(0.21, -0.035).add(V(-0.03, 0, 0)), V(-0.7, -1, 0));
  arm(r, b.R, P(0.22, 0.045).add(V(0.02, 0, 0)), V(0.7, -1, 0));
  return r.build();
}

function hornist() {
  const r = new Rig();
  seatedLegs(r);
  const b = upper(r, 0.6);
  const K = V(0.16, 0.98, 0.22);
  r.add(new THREE.TorusGeometry(0.15, 0.011, 5, 18), BRASS, M(K.x, K.y, K.z, 0, Math.PI / 2 - 0.25, 0));
  r.add(new THREE.TorusGeometry(0.11, 0.009, 5, 16), BRASS, M(K.x + 0.02, K.y, K.z, 0, Math.PI / 2 - 0.25, 0));
  r.tube(b.mouth, V(0.1, 1.17, 0.2), 0.006, 0.008, BRASS, 6);
  r.tube(V(0.1, 1.17, 0.2), K.clone().add(V(0, 0.15, 0.02)), 0.008, 0.009, BRASS, 6);
  for (const k of [-0.03, 0, 0.03]) r.tube(K.clone().add(V(-0.05, 0.03 + k, 0.1)), K.clone().add(V(0.02, 0.03 + k, 0.1)), 0.011, 0.011, BRASS, 8);
  // the bell opens toward the back, beside the right hip, with the right hand inside it
  const bs = K.clone().add(V(0.05, -0.12, -0.05));
  const be = V(0.3, 0.72, -0.16);
  r.tube(bs, be, 0.02, 0.15, BRASS, 14, true);
  arm(r, b.L, K.clone().add(V(-0.07, 0.04, 0.12)), V(-0.8, -0.8, 0));
  arm(r, b.R, bs.clone().lerp(be, 0.75).add(V(0.0, 0.03, 0.02)), V(0.8, -0.3, -0.2));
  return r.build();
}

function trombonist() {
  const r = new Rig();
  seatedLegs(r);
  const b = upper(r, 0.6);
  const s = V(0.04, -0.3, 1).normalize();
  const m = b.mouth;
  const P = (k, dx = 0, dy = 0) => m.clone().addScaledVector(s, k).add(V(dx, dy, 0));
  // the slide: two parallel tubes and the bow at the far end
  r.tube(m, P(0.06), 0.006, 0.01, SILVER, 6);
  for (const dx of [-0.032, 0.032]) r.tube(P(0.06, dx * 0.5), P(0.86, dx), 0.008, 0.008, BRASS, 6);
  r.bar(P(0.86, -0.04), P(0.86, 0.04), 0.016, BRASS);
  r.bar(P(0.55, -0.032), P(0.55, 0.032), 0.01, BRASS);
  // the bell section beside it on the left, and the tuning slide back over the shoulder
  r.tube(P(0.08, -0.13, 0.06), P(0.44, -0.13, 0.06), 0.008, 0.012, BRASS, 6);
  r.tube(P(0.44, -0.13, 0.06), P(0.62, -0.13, 0.06), 0.012, 0.11, BRASS, 14, true);
  r.tube(P(0.08, -0.13, 0.06), V(-0.15, 1.33, -0.24), 0.008, 0.008, BRASS, 6);
  r.bar(P(0.1, -0.13, 0.06), P(0.1, 0, 0), 0.01, BRASS);
  arm(r, b.L, P(0.14, -0.08, 0.02), V(-0.7, -1, 0));
  arm(r, b.R, P(0.55, 0, -0.02), V(0.8, -0.8, -0.2));
  return r.build();
}

function tubist() {
  const r = new Rig();
  seatedLegs(r);
  const b = upper(r, 0.6);
  // On the lap, bell up beside the head.
  r.tube(V(0.08, 0.66, 0.3), V(0.12, 1.3, 0.24), 0.07, 0.11, BRASS, 10);
  r.tube(V(0.12, 1.3, 0.24), V(0.14, 1.55, 0.22), 0.11, 0.24, BRASS, 16, true);
  r.add(new THREE.TorusGeometry(0.14, 0.055, 6, 14), BRASS, M(0.02, 0.7, 0.3, 0, Math.PI / 2, 0));
  r.add(new THREE.TorusGeometry(0.12, 0.03, 5, 14), BRASS, M(-0.06, 0.98, 0.3, 0, Math.PI / 2, 0));
  for (const k of [-0.06, -0.025, 0.01, 0.045]) r.tube(V(k, 0.98, 0.37), V(k, 1.1, 0.37), 0.013, 0.013, BRASS, 8);
  r.tube(b.mouth, V(-0.06, 1.12, 0.3), 0.007, 0.012, BRASS, 6);
  arm(r, b.L, V(-0.13, 0.98, 0.26), V(-0.9, -0.5, 0));
  arm(r, b.R, V(-0.01, 1.1, 0.39), V(0.8, -0.8, 0));
  return r.build();
}

/* -------------------------------------------------------------- percussion */

// A pair of mallets that strike in turn: stick length, head radius and colour.
function malletPlayer(r, b, spread, reach, stick, head, headCol, amp) {
  for (const sx of [-1, 1]) {
    const G = V(sx * spread, 1.02, 0.3);
    const dir = V(-sx * 0.15, -0.3, 1).normalize();
    swingingArm(
      r,
      sx < 0 ? b.L : b.R,
      G,
      V(sx * 0.6, -1, -0.3),
      (E) => new THREE.Vector3().crossVectors(G.clone().sub(E), UP),
      amp,
      sx < 0 ? Math.PI : 0,
      () => {
        const tip = G.clone().addScaledVector(dir, reach);
        r.tube(G, tip, stick, stick, STICK, 4);
        r.ball(head, headCol, tip, [1, 1, 1], 0);
      },
    );
  }
}

function timpanist() {
  const r = new Rig();
  standingLegs(r);
  const b = upper(r, 1.0);
  malletPlayer(r, b, 0.17, 0.36, 0.006, 0.026, FELT, 0.22);
  return r.build();
}

function keyboardPercussionist(spread) {
  const r = new Rig();
  standingLegs(r);
  const b = upper(r, 1.0);
  malletPlayer(r, b, spread, 0.3, 0.005, 0.016, 0xd8d0c0, 0.18);
  return r.build();
}

function trianglePlayer() {
  const r = new Rig();
  standingLegs(r);
  const b = upper(r, 1.0);
  // Triangle hung from the left hand on a loop of string, beaten from inside.
  const hold = V(-0.13, 1.4, 0.32);
  arm(r, b.L, hold, V(-0.6, -1, 0));
  const A = hold.clone().add(V(0, -0.06, 0.01));
  r.bar(hold, A, 0.003, PAPER);
  const Bp = A.clone().add(V(-0.1, -0.173, 0));
  const Cp = A.clone().add(V(0.1, -0.173, 0));
  r.bar(A, Bp, 0.007, SILVER);
  r.bar(Bp, Cp, 0.007, SILVER);
  r.bar(Cp, Cp.clone().lerp(A, 0.88), 0.007, SILVER);
  const G = V(0.07, 1.25, 0.3);
  const target = A.clone().add(V(0, -0.12, 0));
  swingingArm(
    r,
    b.R,
    G,
    V(0.6, -1, -0.2),
    (E) => new THREE.Vector3().crossVectors(G.clone().sub(E), UP),
    0.12,
    0,
    () => r.bar(G, target, 0.005, SILVER),
  );
  return r.build();
}

// Instruments that stand on the floor and never move. Built in their player's frame.
function timpaniSet() {
  const r = new Rig();
  // Four drums close around the player, largest on the left: 32, 29, 26 and 23 inches.
  [
    [-80, 0.405],
    [-27, 0.37],
    [27, 0.33],
    [80, 0.29],
  ].forEach(([deg, rr]) => {
    const p = V(0.9 * Math.sin(rad(deg)), 0, 0.9 * Math.cos(rad(deg)));
    const hh = 0.82;
    r.add(new THREE.SphereGeometry(rr, 14, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), COPPER, M(p.x, hh - 0.03, p.z, 0, 0, 0, 1, 0.9, 1));
    r.tube(V(p.x, hh - 0.06, p.z), V(p.x, hh, p.z), rr + 0.012, rr + 0.012, RIM, 14, true);
    r.tube(V(p.x, hh - 0.004, p.z), V(p.x, hh + 0.004, p.z), rr, rr, DRUM_HEAD, 14);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3 + rad(deg);
      r.bar(V(p.x + Math.cos(a) * rr * 0.55, hh - rr * 0.75, p.z + Math.sin(a) * rr * 0.55), V(p.x + Math.cos(a) * rr * 0.95, 0, p.z + Math.sin(a) * rr * 0.95), 0.025, RIM);
    }
    const toward = V(-p.x, 0, -p.z).normalize();
    r.plank(p.clone().addScaledVector(toward, rr * 0.4).setY(0.02), p.clone().addScaledVector(toward, rr * 1.05).setY(0.06), 0.11, 0.025, RIM, UP);
  });
  return r.build();
}

// Bars in keyboard order: a front row of naturals, a back row of sharps in groups of 2 and 3.
function barRows(r, { width, n, gap, lenLo, lenHi, y, zFront, zBack, col, thick, resonators }) {
  const pitch = width + gap;
  const x0 = (-(n - 1) * pitch) / 2;
  for (let i = 0; i < n; i++) {
    const len = lenLo + ((lenHi - lenLo) * i) / (n - 1);
    const x = x0 + i * pitch;
    r.box(width, thick, len, col, x, y, zFront);
    if (resonators) r.tube(V(x, y - 0.03, zFront), V(x, y - 0.03 - resonators * (1 - (0.7 * i) / n), zFront), 0.018, 0.018, BRASS, 6);
    if (i < n - 1 && ![2, 6].includes(i % 7)) {
      r.box(width, thick, len * 0.92, col, x + pitch / 2, y + 0.025, zBack);
      if (resonators) r.tube(V(x + pitch / 2, y, zBack), V(x + pitch / 2, y - resonators * (1 - (0.7 * i) / n), zBack), 0.018, 0.018, BRASS, 6);
    }
  }
  return x0;
}

function xylophone() {
  const r = new Rig();
  const y = 0.86;
  barRows(r, { width: 0.045, n: 22, gap: 0.02, lenLo: 0.36, lenHi: 0.22, y, zFront: 0.36, zBack: 0.64, col: ROSEWOOD, thick: 0.022, resonators: 0.42 });
  for (const z of [0.22, 0.5, 0.78]) r.box(1.52, 0.03, 0.03, CASE, 0, y - 0.02, z);
  for (const sx of [-0.74, 0.74]) {
    for (const z of [0.25, 0.75]) r.bar(V(sx, y - 0.03, z), V(sx, 0.05, z), 0.035, CASE);
    r.bar(V(sx, 0.12, 0.25), V(sx, 0.12, 0.75), 0.03, CASE);
  }
  r.bar(V(-0.74, 0.12, 0.5), V(0.74, 0.12, 0.5), 0.03, CASE);
  return r.build();
}

function glockenspiel() {
  const r = new Rig();
  const y = 0.88;
  r.box(0.8, 0.06, 0.38, CASE, 0, y - 0.04, 0.45);
  barRows(r, { width: 0.028, n: 16, gap: 0.016, lenLo: 0.15, lenHi: 0.1, y, zFront: 0.37, zBack: 0.53, col: ALU, thick: 0.012 });
  for (const [x, z] of [
    [-0.36, 0.3],
    [0.36, 0.3],
    [-0.36, 0.6],
    [0.36, 0.6],
  ]) {
    r.bar(V(x, y - 0.07, z), V(x * 1.15, 0, z + (z - 0.45) * 0.4), 0.025, STEEL);
  }
  return r.build();
}

function bassDrum() {
  const r = new Rig();
  const c = V(0.62, 0.62, 0.12);
  const ax = V(1, 0, 0.25).normalize();
  const end = (k) => c.clone().addScaledVector(ax, k);
  r.tube(end(-0.2), end(0.2), 0.43, 0.43, 0x3a1f14, 16);
  for (const k of [-0.205, 0.205]) r.tube(end(k), end(k + Math.sign(k) * 0.004), 0.425, 0.425, DRUM_HEAD, 16);
  for (const k of [-0.2, 0.2]) r.tube(end(k - 0.02), end(k + 0.02), 0.445, 0.445, RIM, 16, true);
  for (const k of [-0.15, 0.15]) {
    r.bar(end(k).setY(0.22), end(k).add(V(0, -0.62, 0.3)), 0.03, STEEL);
    r.bar(end(k).setY(0.22), end(k).add(V(0, -0.62, -0.3)), 0.03, STEEL);
  }
  return r.build();
}

/* -------------------------------------------------------- choir and piano */

function singer() {
  const r = new Rig();
  standingLegs(r);
  const b = upper(r, 1.0);
  for (const sx of [-1, 1]) {
    arm(r, sx < 0 ? b.L : b.R, V(sx * 0.12, 1.24, 0.3), V(sx * 0.6, -1, -0.2));
    // an open score, its two halves opened like a shallow V
    r.add(new THREE.BoxGeometry(0.2, 0.005, 0.28), 0x111014, M(sx * 0.1, 1.275, 0.36, -0.95, 0, sx * -0.25));
    r.add(new THREE.BoxGeometry(0.19, 0.004, 0.27), PAPER, M(sx * 0.1, 1.282, 0.362, -0.95, 0, sx * -0.25));
  }
  return r.build();
}

function pianist() {
  const r = new Rig();
  seatedLegs(r);
  const b = upper(r, 0.6);
  arm(r, b.L, V(-0.2, 0.8, 0.44), V(-0.6, -1, 0));
  arm(r, b.R, V(0.2, 0.8, 0.44), V(0.6, -1, 0));
  return r.build();
}

/* ---------------------------------------------------------------- shader */

const SHADER_HEAD = /* glsl */ `
attribute vec3 aPivot;
attribute vec3 aJoint;
attribute vec3 aAxis;
attribute vec4 aInfo; // section, sway phase, stroke phase, stroke angle (or minus a slide length)
attribute float aW; // how much of a slide this point follows
uniform float uTime;
uniform float uBeat;
uniform float uAmp[6];
mat3 turn(vec3 a, float g) {
  float s = sin(g), c = cos(g), o = 1.0 - c;
  return mat3(
    o * a.x * a.x + c, o * a.x * a.y + a.z * s, o * a.z * a.x - a.y * s,
    o * a.x * a.y - a.z * s, o * a.y * a.y + c, o * a.y * a.z + a.x * s,
    o * a.z * a.x + a.y * s, o * a.y * a.z - a.x * s, o * a.z * a.z + c);
}
`;
const SHADER_MOVE = /* glsl */ `
vec3 objectNormal = vec3(normal);
vec3 posed = vec3(position);
if (aInfo.x > -0.5) {
  float amp = uAmp[int(aInfo.x + 0.5)];
  if (amp > 0.001) {
    if (aInfo.w > 0.0) {
      // one mallet stroke per beat, turning around the elbow
      mat3 R = turn(aAxis, aInfo.w * amp * sin(uBeat * PI + aInfo.z));
      posed = aJoint + R * (posed - aJoint);
      objectNormal = R * objectNormal;
    } else if (aInfo.w < 0.0) {
      // one bow stroke per beat: the bow slides along its length, the arm follows
      posed += aAxis * (-aInfo.w * amp * aW * sin(uBeat * PI + aInfo.z));
    }
    mat3 S = turn(vec3(0.0, 1.0, 0.0), 0.045 * amp * sin(uTime * 2.6 + aInfo.y))
           * turn(vec3(1.0, 0.0, 0.0), 0.018 * amp * sin(uTime * 1.7 + aInfo.y * 1.3));
    posed = aPivot + S * (posed - aPivot);
    objectNormal = S * objectNormal;
  }
}
#ifdef USE_TANGENT
vec3 objectTangent = vec3(tangent.xyz);
#endif
`;

/* ------------------------------------------------------------------ build */

// Places every player around the conductor C. `levelY(lv)` is the height of riser lv and
// `onArc(r, phi)` gives the floor position at radius r and angle phi (0 = straight back).
export function buildOrchestra({ C, levelY, onArc, rand, stageTop, piano }) {
  const T = {
    violin: violinist(VIOLIN),
    viola: violinist(VIOLA),
    cello: cellist(),
    bass: bassist(),
    flute: flutist(),
    oboe: reedPlayer('oboe'),
    clarinet: reedPlayer('clarinet'),
    bassoon: bassoonist(),
    horn: hornist(),
    trumpet: trumpeter(),
    trombone: trombonist(),
    tuba: tubist(),
    timpanist: timpanist(),
    mallets: keyboardPercussionist(0.17),
    xylo: keyboardPercussionist(0.22),
    triangle: trianglePlayer(),
    timpani: timpaniSet(),
    xylophone: xylophone(),
    glockenspiel: glockenspiel(),
    bassDrum: bassDrum(),
    singer: singer(),
    pianist: pianist(),
  };

  const placed = [];
  const chairMx = [];
  const standMx = [];
  const proxies = { experience: new Kit(), projects: new Kit(), skills: new Kit(), certifications: new Kit() };
  const marks = { experience: [], projects: [], skills: [], certifications: [] };
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const rot = new THREE.Matrix3();

  function place(tpl, matrix, sec, extra = {}) {
    const g = tpl.geo.clone();
    g.applyMatrix4(matrix);
    const n = g.attributes.position.count;
    const col = g.attributes.color.array;
    const tone = g.attributes.aTone.array;
    const mv = g.attributes.aMove.array;
    const skin = linear(extra.skin ?? pick(SKIN));
    const hair = linear(extra.hair ?? pick(HAIR));
    const pivot = new THREE.Vector3().setFromMatrixPosition(matrix);
    rot.setFromMatrix4(matrix);
    const moves = tpl.moves.map((m) => m && { joint: m.joint.clone().applyMatrix4(matrix), axis: m.axis.clone().applyMatrix3(rot).normalize(), amp: m.amp, phase: m.phase, kind: m.kind });
    const aPivot = new Float32Array(n * 3);
    const aJoint = new Float32Array(n * 3);
    const aAxis = new Float32Array(n * 3);
    const aInfo = new Float32Array(n * 4);
    const sway = rand() * 6.283;
    const jitter = (rand() - 0.5) * 0.5; // players in a section bow together, not in lockstep
    for (let i = 0; i < n; i++) {
      if (tone[i] === 1) col.set([skin.r, skin.g, skin.b], i * 3);
      else if (tone[i] === 2) col.set([hair.r, hair.g, hair.b], i * 3);
      aPivot.set([pivot.x, pivot.y, pivot.z], i * 3);
      const m = moves[mv[i]];
      if (m) {
        aJoint.set([m.joint.x, m.joint.y, m.joint.z], i * 3);
        aAxis.set([m.axis.x, m.axis.y, m.axis.z], i * 3);
      }
      // The stroke's size: an angle for a turn, or minus a length for a slide (a bow stroke).
      aInfo.set([sec, sway, m ? m.phase + jitter : 0, m ? (m.kind === 'slide' ? -m.amp : m.amp) : 0], i * 4);
    }
    g.deleteAttribute('aTone');
    g.deleteAttribute('aMove');
    g.setAttribute('aPivot', new THREE.BufferAttribute(aPivot, 3));
    g.setAttribute('aJoint', new THREE.BufferAttribute(aJoint, 3));
    g.setAttribute('aAxis', new THREE.BufferAttribute(aAxis, 3));
    g.setAttribute('aInfo', new THREE.BufferAttribute(aInfo, 4));
    placed.push(g);
  }

  const spot = (r, deg, lv) => {
    const [x, z] = onArc(r, rad(deg));
    return V(x, levelY(lv), z);
  };
  const toward = (p) => facing(p.x, p.y, p.z, C.x, C.z);
  const proxy = (sec, p, w = 0.9, h = 1.6, d = 1.0) => proxies[sec].box(w, h, d, 0xffffff, p.x, p.y + h / 2, p.z);

  // Seated players along an arc, sharing a stand between each pair.
  function row(r, lv, degs, kindAt, sec, { mark = () => true, stands = true } = {}) {
    degs.forEach((deg) => {
      const p = spot(r, deg, lv);
      const mx = toward(p);
      chairMx.push(mx);
      place(T[kindAt(deg)], mx, SEC[sec]);
      proxy(sec, p);
      if (mark(p)) marks[sec].push(p);
    });
    if (!stands) return;
    for (let k = 0; k < degs.length; k += 2) {
      const deg = k + 1 < degs.length ? (degs[k] + degs[k + 1]) / 2 : degs[k];
      const s = spot(r - 0.68, deg, lv);
      const c = spot(r, deg, lv);
      standMx.push(facing(s.x, s.y, s.z, c.x, c.z));
    }
  }
  const spread = (d0, d1, n) => Array.from({ length: n }, (_, k) => d0 + ((k + 0.5) * (d1 - d0)) / n);

  // Strings, on the stage floor. First violins front left, seconds behind them, violas
  // centre right, cellos on the right, double basses standing beside the cellos.
  row(2.4, 0, spread(-74, -16, 2), () => 'violin', 'experience', { mark: (p) => p.x < -1.5 });
  row(3.55, 0, spread(-62, -11, 4), () => 'violin', 'experience', { mark: (p) => p.x < -1.5 });
  row(4.55, 0, spread(-66, -8, 6), () => 'violin', 'experience', { mark: (p) => p.x < -1.5 });
  row(2.4, 0, spread(16, 74, 2), () => 'cello', 'experience', { mark: () => false });
  row(3.55, 0, spread(11, 76, 4), (d) => (d < 44 ? 'viola' : 'cello'), 'experience', { mark: () => false });
  row(4.55, 0, spread(8, 77, 6), (d) => (d < 44 ? 'viola' : 'cello'), 'experience', { mark: () => false });
  for (const [r, deg] of [
    [4.4, 81],
    [4.4, 89],
    [5.6, 81],
    [5.6, 89],
  ]) {
    const p = spot(r, deg, 0);
    place(T.bass, toward(p), SEC.experience);
    proxy('experience', p, 0.9, 2.0, 0.9);
  }
  {
    const s = spot(3.75, 85, 0);
    const c = spot(4.4, 85, 0);
    standMx.push(facing(s.x, s.y, s.z, c.x, c.z));
  }

  // Woodwinds in the centre: flutes and oboes in front, clarinets and bassoons behind.
  row(5.9, 1, [-13, -5], () => 'flute', 'projects');
  row(5.9, 1, [5, 13], () => 'oboe', 'projects');
  row(7.7, 2, [-11, -5], () => 'clarinet', 'projects');
  row(7.7, 2, [5, 11], () => 'bassoon', 'projects');

  // Brass: horns to the left of the woodwinds, trumpets, trombones and tuba at the back.
  row(5.9, 1, [-50, -42, -34, -26], () => 'horn', 'skills', { mark: () => false });
  row(9.55, 3, [-30, -24, -18], () => 'trumpet', 'skills');
  row(9.55, 3, [-11, -5, 1], () => 'trombone', 'skills');
  row(9.55, 3, [8], () => 'tuba', 'skills');

  // Percussion at the back right: timpani, xylophone, glockenspiel, triangle and bass drum.
  for (const [deg, r, player, inst, box] of [
    [22, 10.1, 'timpanist', 'timpani', [2.2, 1.4, 1.9]],
    [37, 10.3, 'xylo', 'xylophone', [1.7, 1.4, 1.3]],
    [47, 10.2, 'mallets', 'glockenspiel', [1.0, 1.4, 1.1]],
    [56, 9.9, 'triangle', 'bassDrum', [1.8, 1.8, 1.2]],
  ]) {
    const p = spot(r, deg, 3);
    const mx = toward(p);
    place(T[player], mx, SEC.certifications);
    place(T[inst], mx, FIXED);
    const c = spot(r - 0.4, deg, 3);
    proxy('certifications', c, ...box);
    marks.certifications.push(p);
  }

  // The choir stands in the front four rows of the terrace, holding open scores.
  for (let j = 0; j < 4; j++) {
    const z = -17.45 - 0.85 * j + 0.12;
    const y = stageTop + 0.5 + 0.42 * j;
    for (let x = -9.0; x <= 9.01; x += 0.72) {
      if (rand() < 0.22) continue;
      place(T.singer, facing(x + (rand() - 0.5) * 0.12, y, z, x, z + 6), SEC.education);
    }
  }

  place(T.pianist, piano, SEC.piano);

  const geo = mergeGeometries(placed, false);
  placed.length = 0;

  const uniforms = { uTime: { value: 0 }, uBeat: { value: 0 }, uAmp: { value: [1, 1, 1, 1, 1, 1] } };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${SHADER_HEAD}`)
      .replace('#include <beginnormal_vertex>', SHADER_MOVE)
      .replace('#include <begin_vertex>', 'vec3 transformed = posed;');
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const amp = uniforms.uAmp.value;
  const ORDER = Object.keys(SEC);
  function animate(t, beats, active, dt) {
    uniforms.uTime.value = t;
    uniforms.uBeat.value = beats ?? 0;
    const k = Math.min(1, dt * 2.5);
    // Without music (tuning) the players hold their instruments up and barely move. Waiting for
    // the downbeat, everyone is still. When a section is featured, the others keep playing
    // underneath, so they keep moving, just less.
    const waiting = beats != null && beats < 0;
    ORDER.forEach((id, i) => {
      const on = beats == null ? 0.12 : waiting ? 0 : active == null || active === 'about' || active === id ? 1 : 0.35;
      amp[i] += (on - amp[i]) * k;
    });
  }

  return { mesh, chairMx, standMx, proxies, marks, animate, triangles: geo.index.count / 3 };
}
