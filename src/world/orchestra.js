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

// How a point moves with a stroke. The CPU works out, once, where every moving point is at both
// ends of its stroke (g = -1 and g = 1; g = 0 is the pose as modelled), with the real joints: the
// shoulder and elbow turn, nothing stretches. Each point stores the parabola through those three
// places, p + lin * g + quad * g², so the GPU only has to evaluate it.
const KIND = { none: 0, bow: 1, strike: 2 };
const smoothstep = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

class Rig {
  constructor() {
    this.parts = [];
    this.motions = [null];
    this.cur = 0;
    this.hip = 0.6; // the height the body sways from: seated, or standing (set by the legs)
    this.band = null; // where the sway fades in, if not just above the hips: [from, to] high
  }
  // Parts added after this follow a stroke. `at(p, g)` is where template point p is at stroke
  // position g. A 'bow' stroke goes to and fro; a 'strike' lifts slowly and falls fast, with
  // g = -1 the moment the mallet meets the instrument.
  motion(kind, phase, at) {
    this.motions.push({ kind: KIND[kind], phase, at });
    this.cur = this.motions.length - 1;
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
    this.parts.push({ g, color, motion: this.cur });
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
    const geos = this.parts.map(({ g, color, motion }) => {
      const n = g.attributes.position.count;
      const pos = g.attributes.position;
      const col = new Float32Array(n * 3);
      const tone = new Float32Array(n);
      const lin = new Float32Array(n * 3);
      const quad = new Float32Array(n * 3);
      const mot = new Float32Array(n * 3);
      const m = this.motions[motion];
      const c = typeof color === 'number' ? linear(color) : null;
      for (let i = 0; i < n; i++) {
        if (c) col.set([c.r, c.g, c.b], i * 3);
        tone[i] = color === 'skin' ? 1 : color === 'hair' ? 2 : 0;
        pt.fromBufferAttribute(pos, i);
        // The legs stay on the chair (or the floor); from the hips up the body sways.
        const [lo, hi] = this.band ?? [this.hip - 0.06, this.hip + 0.14];
        mot.set([m ? m.kind : 0, m ? m.phase : 0, smoothstep(lo, hi, pt.y)], i * 3);
        if (!m) continue;
        const a = m.at(pt.clone(), -1);
        const b = m.at(pt.clone(), 1);
        lin.set([(b.x - a.x) / 2, (b.y - a.y) / 2, (b.z - a.z) / 2], i * 3);
        quad.set([(a.x + b.x) / 2 - pt.x, (a.y + b.y) / 2 - pt.y, (a.z + b.z) / 2 - pt.z], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aTone', new THREE.BufferAttribute(tone, 1));
      g.setAttribute('aLin', new THREE.BufferAttribute(lin, 3));
      g.setAttribute('aQuad', new THREE.BufferAttribute(quad, 3));
      g.setAttribute('aMot', new THREE.BufferAttribute(mot, 3));
      return g;
    });
    const geo = mergeGeometries(geos, false);
    // Mirror x (see the note at the top) and reverse the winding so faces still point outward.
    for (const k of ['position', 'normal', 'aLin', 'aQuad']) {
      const a = geo.attributes[k];
      for (let i = 0; i < a.count; i++) a.setX(i, -a.getX(i));
    }
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    return { geo, hip: this.hip };
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
  r.hip = 0.98;
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

// Turning about a point: where p goes when turned by `angle` about `axis` through `c`.
const turnAbout = (p, c, axis, angle) => p.clone().sub(c).applyAxisAngle(axis, angle).add(c);
// Find x in [0, hi] where f(x) = goal, for f rising with x.
function solve(f, goal, hi) {
  let lo = 0;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < goal) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// An arm beating with a mallet (or a triangle beater) held in the hand at G. The stroke comes
// mostly from the wrist, a little from the elbow; the upper arm stays where it is. At g = -1 the
// head just meets the surface (point Q, normal n, facing the head), at g = 1 it is lifted `lift`
// higher than it rests. `held` adds the stick and head, given the head's resting centre.
function malletArm(r, S, G, pole, Q, n, { head, hover, lift, phase, held }) {
  const tip = Q.clone().addScaledVector(n, hover + head);
  const E = ik(S, G, pole);
  const d = G.clone().sub(E).normalize();
  const W = G.clone().addScaledVector(d, -0.06);
  const axis = new THREE.Vector3().crossVectors(tip.clone().sub(E), n).normalize();
  const ELBOW = 0.3; // the elbow's share of the turn; the wrist does the rest
  const lower = (p, a) => turnAbout(p, E, axis, a * ELBOW);
  const hand = (p, a) => turnAbout(lower(p, a), lower(W, a), axis, a * (1 - ELBOW));
  // How far the head is from the surface after turning by a (positive turns lift it).
  const sign = hand(tip, 0.05).clone().sub(Q).dot(n) > hover + head ? 1 : -1;
  const gap = (a) => hand(tip, sign * a).sub(Q).dot(n) - head;
  const down = solve((a) => -gap(-a), -0.003, 1.2);
  const up = solve(gap, hover + lift, 1.2);
  const angle = (g) => sign * (g < 0 ? g * down : g * up);
  r.tube(S, E, 0.05, 0.043, BLACK, 6);
  r.motion('strike', phase, (p, g) => lower(p, angle(g)));
  r.tube(E, W, 0.042, 0.034, BLACK, 6);
  r.motion('strike', phase, (p, g) => hand(p, angle(g)));
  r.plank(W, G.clone().addScaledVector(d, 0.035), 0.07, 0.035, 'skin');
  held(tip);
  r.still();
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
// frog, and the arm follows it on its joints: the elbow opens and closes, the upper arm swings
// from the shoulder, and neither changes length. At rest the frog is `reach` from the strings;
// a stroke moves it `stroke` either way (g = 1 in toward the strings, g = -1 out to the tip).
function bowingArm(r, S, ins, s, pole, { reach, stroke, phase = 0 }) {
  const f = ins.across.clone();
  if (f.x < 0) f.negate();
  const tip = f.clone().negate();
  const n = ins.normal;
  const grip = (g) => ins.contact.clone().addScaledVector(f, reach - g * stroke).addScaledVector(tip, 0.05);
  const G = grip(0);
  const E = ik(S, G, pole);
  const armAt = (g) => {
    const Gg = grip(g);
    return { G: Gg, E: ik(S, Gg, pole) };
  };
  const swing = (from, to) => new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
  r.motion('bow', phase, (p, g) => {
    const a = armAt(g);
    return p.sub(S).applyQuaternion(swing(E.clone().sub(S), a.E.clone().sub(S))).add(S);
  });
  r.tube(S, E, 0.05, 0.043, BLACK, 6);
  r.motion('bow', phase, (p, g) => {
    const a = armAt(g);
    return p.sub(E).applyQuaternion(swing(G.clone().sub(E), a.G.clone().sub(a.E))).add(a.E);
  });
  forearm(r, E, G);
  r.motion('bow', phase, (p, g) => p.addScaledVector(tip, g * stroke));
  const frog = ins.contact.clone().addScaledVector(f, reach);
  const end = frog.clone().addScaledVector(tip, s.bow);
  r.tube(frog.clone().addScaledVector(n, s.stick * 2.2), end.clone().addScaledVector(n, s.stick * 1.6), s.stick * 0.6, s.stick * 0.4, STICK, 5);
  r.plank(frog, end, s.stick * 1.2, 0.002, HAIR_WHITE, n);
  r.plank(frog.clone().addScaledVector(tip, -0.012), frog.clone().addScaledVector(tip, 0.045), s.stick * 2.2, s.stick * 2.6, EBONY, n);
  r.bar(end, end.clone().addScaledVector(n, s.stick * 2.4), s.stick * 0.9, HAIR_WHITE);
  r.still();
  // The arm must reach the frog all through the stroke, or the hand would leave the bow.
  if (import.meta.env?.DEV) for (const g of [-1, 1]) if (S.distanceTo(grip(g)) > ARM_A + ARM_B) console.warn('bow arm cannot reach', S.distanceTo(grip(g)));
}

// Where each bow rests and how far a stroke takes it, in metres (see bowingArm).
// Each is as long as fits: any nearer the strings and the arm meets the instrument; any further
// and the arm cannot reach (cellos and basses are bowed low, a long way from the shoulder).
const BOWING = {
  violin: { reach: 0.3, stroke: 0.12 },
  cello: { reach: 0.33, stroke: 0.1 },
  bass: { reach: 0.34, stroke: 0.09 },
};

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
  bowingArm(r, b.R, ins, s, V(0.6, -0.8, -0.2), BOWING.violin);
  return r.build();
}

function cellist() {
  const r = new Rig();
  seatedLegs(r, 0.23);
  // The cello is bowed at hip height: the sway starts above that, so bow and strings move as one.
  r.band = [0.7, 0.92];
  const b = upper(r, 0.6);
  // Between the knees, leaning back onto the chest, the scroll beside the left ear (not in the
  // player's head).
  const d = V(-0.2, 1, -0.36).normalize();
  const bottom = V(0, 0.25, 0.42);
  const B = basis(bottom.clone().addScaledVector(d, CELLO.L / 2), d, V(0.2, 0.35, 0.92));
  const ins = stringed(r, B, CELLO, bottom.y / d.y);
  arm(r, b.L, ins.neck(0.32).addScaledVector(ins.normal, -0.05), V(-1, -0.3, 0.1), ins.normal);
  bowingArm(r, b.R, ins, CELLO, V(0.8, -0.5, -0.3), BOWING.cello);
  return r.build();
}

function bassist() {
  const r = new Rig();
  standingLegs(r);
  r.band = [1.08, 1.3]; // above where the bow meets the strings (see the cellist)
  const b = upper(r, 1.0);
  // Standing behind the bass, which leans back against the body, the neck past the left side of
  // the head (clear of the hair).
  const d = V(-0.12, 1, -0.3).normalize();
  const bottom = V(-0.06, 0.46, 0.36);
  const B = basis(bottom.clone().addScaledVector(d, BASS.L / 2), d, V(0.25, 0.3, 0.92));
  const ins = stringed(r, B, BASS, bottom.y / d.y);
  arm(r, b.L, ins.neck(0.3).addScaledVector(ins.normal, -0.07), V(-1, -0.2, 0.2), ins.normal);
  bowingArm(r, b.R, ins, BASS, V(0.8, -0.6, -0.2), BOWING.bass);
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

// A pair of mallets that strike in turn, the hands at `hands` (x either side), each head over
// `spot(sx)` on a surface `top` high. `stick` and `head` are the stick's and the head's radius.
function malletPlayer(r, b, { hands, spot, top, stick, head, headCol, hover, lift }) {
  for (const sx of [-1, 1]) {
    const G = V(sx * hands.x, hands.y, hands.z);
    const Q = spot(sx).setY(top);
    malletArm(r, sx < 0 ? b.L : b.R, G, V(sx * 0.6, -1, -0.3), Q, UP, {
      head,
      hover,
      lift,
      phase: sx < 0 ? Math.PI : 0,
      held: (tip) => {
        r.tube(G, tip, stick, stick, STICK, 4);
        r.ball(head, headCol, tip, [1, 1, 1], 0);
      },
    });
  }
}

// The timpani (see timpaniSet): drums at 27° either side, 0.9 m out; struck about 10 cm in from
// the rim on the player's side, where a timpanist plays.
const TIMPANI = [
  [-80, 0.405],
  [-27, 0.37],
  [27, 0.33],
  [80, 0.29],
];
const DRUM_TOP = 0.824;
const drumAt = (deg) => V(0.9 * Math.sin(rad(deg)), 0, 0.9 * Math.cos(rad(deg)));

function timpanist() {
  const r = new Rig();
  standingLegs(r);
  const b = upper(r, 1.0);
  malletPlayer(r, b, {
    hands: V(0.2, 1.02, 0.3),
    spot: (sx) => {
      const [deg, rr] = TIMPANI[sx < 0 ? 1 : 2];
      const p = drumAt(deg);
      return p.multiplyScalar(1 - (rr - 0.1) / 0.9);
    },
    top: DRUM_TOP,
    stick: 0.006,
    head: 0.026,
    headCol: FELT,
    hover: 0.07,
    lift: 0.13,
  });
  return r.build();
}

// Xylophone and glockenspiel players: mallets on the front row of bars.
function keyboardPercussionist({ x, z, top, hands }) {
  const r = new Rig();
  standingLegs(r);
  const b = upper(r, 1.0);
  malletPlayer(r, b, { hands, spot: (sx) => V(sx * x, 0, z), top, stick: 0.005, head: 0.016, headCol: 0xd8d0c0, hover: 0.05, lift: 0.1 });
  return r.build();
}

function trianglePlayer() {
  const r = new Rig();
  standingLegs(r);
  const b = upper(r, 1.0);
  // Triangle hung from the left hand on a loop of string, struck on its right side.
  const hold = V(-0.13, 1.4, 0.32);
  arm(r, b.L, hold, V(-0.6, -1, 0));
  const A = hold.clone().add(V(0, -0.06, 0.01));
  r.bar(hold, A, 0.003, PAPER);
  const Bp = A.clone().add(V(-0.1, -0.173, 0));
  const Cp = A.clone().add(V(0.1, -0.173, 0));
  r.bar(A, Bp, 0.007, SILVER);
  r.bar(Bp, Cp, 0.007, SILVER);
  r.bar(Cp, Cp.clone().lerp(A, 0.88), 0.007, SILVER);
  // the middle of the right side, and the way out from it, in the triangle's plane
  const Q = Cp.clone().lerp(A, 0.45);
  const out = V(0.173, 0.1, 0).normalize();
  const G = V(0.13, 1.2, 0.27);
  malletArm(r, b.R, G, V(0.6, -1, -0.2), Q.addScaledVector(out, 0.0035), out, {
    head: 0.0025,
    hover: 0.035,
    lift: 0.025,
    phase: 0,
    held: (tip) => r.bar(G, tip, 0.005, SILVER),
  });
  return r.build();
}

// Instruments that stand on the floor and never move. Built in their player's frame.
function timpaniSet() {
  const r = new Rig();
  // Four drums close around the player, largest on the left: 32, 29, 26 and 23 inches.
  TIMPANI.forEach(([deg, rr]) => {
    const p = drumAt(deg);
    const hh = DRUM_TOP - 0.004;
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
    arm(r, sx < 0 ? b.L : b.R, V(sx * 0.12, 1.24, 0.3), V(sx * 0.25, -1, -0.3)); // elbows in, clear of a neighbour's
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
attribute vec3 aPivot; // the player's hips, which the body sways from
attribute vec3 aLin; // the stroke: this point at stroke g is position + aLin * g + aQuad * g * g
attribute vec3 aQuad;
attribute vec4 aInfo; // section, the player's own seed, stroke phase, stroke kind * 2 + sway share
uniform float uBeat; // the music's beat, smoothed so it never jumps
uniform float uFree; // a clock for playing on their own (tuning), slowing as the sound fades
uniform float uSwayT; // the clock the bodies sway by
uniform float uLoose; // 0 playing together on the beat, 1 each on their own
uniform float uAmp[6]; // how hard each section is playing, 0 to 1
uniform float uSway[6]; // how much each section sways
uniform vec2 uConductor;
mat3 turn(vec3 a, float g) {
  float s = sin(g), c = cos(g), o = 1.0 - c;
  return mat3(
    o * a.x * a.x + c, o * a.x * a.y + a.z * s, o * a.z * a.x - a.y * s,
    o * a.x * a.y - a.z * s, o * a.y * a.y + c, o * a.y * a.z + a.x * s,
    o * a.z * a.x + a.y * s, o * a.y * a.z - a.x * s, o * a.z * a.z + c);
}
// A mallet over one turn of its phase: 0 at the hit, rising slowly to 1, then falling fast.
float lift(float ph) {
  float u = fract(ph * 0.15915494);
  return u < 0.7 ? 0.5 - 0.5 * cos(PI * u / 0.7) : 0.5 + 0.5 * cos(PI * (u - 0.7) / 0.3);
}
`;
const SHADER_MOVE = /* glsl */ `
vec3 objectNormal = vec3(normal);
vec3 posed = vec3(position);
if (aInfo.x > -0.5) {
  int sec = int(aInfo.x + 0.5);
  float kind = floor(aInfo.w * 0.5);
  float share = aInfo.w - 2.0 * kind;
  float amp = uAmp[sec];
  if (kind > 0.5 && amp > 0.001) {
    // On the beat: a bow changes direction every beat, a mallet falls on alternate beats per hand.
    // On their own: each player's strokes have their own length and pace, with pauses.
    float onBeat = uBeat * PI + aInfo.z;
    float own = uFree * (1.5 + 1.1 * fract(aInfo.y * 0.618)) + aInfo.z + aInfo.y;
    float ease = 0.6 + 0.4 * sin(uFree * 0.29 + aInfo.y * 1.7);
    float g;
    if (kind < 1.5) {
      g = amp * mix(sin(onBeat), sin(own) * ease, uLoose);
    } else {
      // A soft stroke still meets the instrument; it just starts from lower.
      float h = mix(lift(onBeat), lift(own) * ease, uLoose);
      g = mix(-min(1.0, amp * 3.0), amp, h);
    }
    posed += aLin * g + aQuad * (g * g);
  }
  if (share > 0.001) {
    // Leaning in and back, a little to the side, a little turn: slow, uneven, never quite still.
    float e = uSway[sec] * share;
    float a = uSwayT * (0.8 + 0.4 * fract(aInfo.y * 0.37)) + aInfo.y * 3.0;
    float lean = e * (0.026 * sin(a * 0.71) + 0.012 * sin(a * 1.63 + 2.0));
    float side = e * (0.014 * sin(a * 0.53 + 1.1) + 0.006 * sin(a * 1.37 + 0.4));
    float yaw = e * (0.022 * sin(a * 0.61 + 0.5) + 0.01 * sin(a * 1.21 + 2.7));
    vec2 f = normalize(uConductor - aPivot.xz);
    mat3 S = turn(vec3(0.0, 1.0, 0.0), yaw) * turn(vec3(f.y, 0.0, -f.x), lean) * turn(vec3(f.x, 0.0, f.y), side);
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
    mallets: keyboardPercussionist({ x: 0.13, z: 0.37, top: 0.886, hands: V(0.17, 1.03, 0.17) }),
    xylo: keyboardPercussionist({ x: 0.2, z: 0.44, top: 0.871, hands: V(0.2, 1.03, 0.22) }),
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
    const mot = g.attributes.aMot.array;
    const skin = linear(extra.skin ?? pick(SKIN));
    const hair = linear(extra.hair ?? pick(HAIR));
    const hip = V(0, tpl.hip, 0).applyMatrix4(matrix);
    rot.setFromMatrix4(matrix);
    for (const k of ['aLin', 'aQuad']) g.attributes[k].applyMatrix3(rot);
    const aPivot = new Float32Array(n * 3);
    const aInfo = new Float32Array(n * 4);
    const seed = rand() * 6.283;
    const jitter = (rand() - 0.5) * 0.5; // players in a section bow together, not in lockstep
    for (let i = 0; i < n; i++) {
      if (tone[i] === 1) col.set([skin.r, skin.g, skin.b], i * 3);
      else if (tone[i] === 2) col.set([hair.r, hair.g, hair.b], i * 3);
      aPivot.set([hip.x, hip.y, hip.z], i * 3);
      const kind = mot[i * 3];
      aInfo.set([sec, seed, kind ? mot[i * 3 + 1] + jitter : 0, kind * 2 + mot[i * 3 + 2]], i * 4);
    }
    g.deleteAttribute('aTone');
    g.deleteAttribute('aMot');
    g.setAttribute('aPivot', new THREE.BufferAttribute(aPivot, 3));
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
  row(4.55, 0, spread(8, 74, 6), (d) => (d < 44 ? 'viola' : 'cello'), 'experience', { mark: () => false });
  // A bass is as wide as a person: they stand a full step apart, clear of the cellos' bows.
  for (const [r, deg] of [
    [4.4, 82],
    [4.45, 93],
    [5.6, 80.5],
    [5.6, 90.5],
  ]) {
    const p = spot(r, deg, 0);
    place(T.bass, toward(p), SEC.experience);
    proxy('experience', p, 0.9, 2.0, 0.9);
  }
  {
    const s = spot(3.75, 87.5, 0);
    const c = spot(4.4, 87.5, 0);
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
  // A trombone's slide reaches past where a stand would be, so each trombonist's stand is set off
  // to their right, clear of the slide and the bell.
  row(9.55, 3, [-11, -5, 1], () => 'trombone', 'skills', { stands: false });
  for (const deg of [-11, -5, 1]) {
    const c = spot(9.55, deg, 3);
    const ahead = V(C.x - c.x, 0, C.z - c.z).normalize();
    const right = V(-ahead.z, 0, ahead.x);
    const s = c.clone().addScaledVector(ahead, 0.62).addScaledVector(right, 0.36);
    standMx.push(facing(s.x, s.y, s.z, c.x + right.x * 0.36, c.z + right.z * 0.36));
  }
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

  const uniforms = {
    uBeat: { value: 0 },
    uFree: { value: 0 },
    uSwayT: { value: 0 },
    uLoose: { value: 1 },
    uAmp: { value: [0, 0, 0, 0, 0, 0] },
    uSway: { value: [0, 0, 0, 0, 0, 0] },
    uConductor: { value: new THREE.Vector2(C.x, C.z) },
  };
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

  const play = new Orchestra(uniforms);
  return { mesh, chairMx, standMx, proxies, marks, animate: (...a) => play.step(...a), state: play, triangles: geo.index.count / 3 };
}

/* ------------------------------------------------------------ how they play */

const ORDER = Object.keys(SEC);
// How much of each section joins in the tuning: the strings and winds tune, brass a little, the
// timpanist taps a drum now and then, the choir and pianist wait.
const TUNING = { experience: 1, projects: 0.8, skills: 0.55, certifications: 0.3, education: 0, piano: 0 };
// Which recording drives which section once the music plays.
const STEM = { experience: 'strings', projects: 'woodwinds', skills: 'brass', certifications: 'percussion', education: 'choir', piano: 'piano' };
// How fast things follow the sound, in seconds (the time to get about two thirds of the way). They
// come in quickly; they stop the way an orchestra does at the end of a piece: the last strokes
// slow and shorten, the bows settle, and the players' bodies come to rest a while after.
const ATTACK = 0.25;
const RELEASE = 1.1;
const SWAY_IN = 0.7;
const SWAY_OUT = 2.2;
const SWAY_REST = 0.22; // the sway left when nobody plays: breathing, shifting on the chair
const ease = (from, to, dt, up, down) => from + (to - from) * (1 - Math.exp(-dt / (to > from ? up : down)));

class Orchestra {
  constructor(u) {
    this.u = u;
    this.amp = u.uAmp.value;
    this.sway = u.uSway.value;
    this.sway.fill(SWAY_REST);
    this.beat = 0;
    this.bps = 80 / 60;
    this.on = false;
  }
  // levels: { tuning, stems: { strings, ... } }, each 0 to 1, or null if nothing reports a level
  // (the debug beat). beats: the music's position, or null. focus: the open section, for the
  // debug beat only (with real music the mix itself brings the featured section forward).
  step(t, dt, { levels = null, beats = null, bpm = 80, focus = null } = {}) {
    const u = this.u;
    dt = Math.min(dt, 0.1);
    const tuning = levels?.tuning ?? 0;
    let music = 0;
    let most = 0;
    ORDER.forEach((id, i) => {
      let want;
      if (levels) {
        const stem = levels.stems?.[STEM[id]] ?? 0;
        music = Math.max(music, stem);
        want = Math.max(stem, tuning * TUNING[id]);
      } else want = beats != null && beats >= 0 ? (focus == null || focus === 'about' || focus === id ? 1 : 0.35) : 0;
      this.amp[i] = ease(this.amp[i], want, dt, ATTACK, RELEASE);
      if (this.amp[i] < 1e-3 && want === 0) this.amp[i] = 0;
      this.sway[i] = ease(this.sway[i], SWAY_REST + (1 - SWAY_REST) * want, dt, SWAY_IN, SWAY_OUT);
      most = Math.max(most, this.amp[i]);
    });
    if (!levels && beats != null && beats >= 0) music = 1;
    // Tuning, everyone plays on their own; in the music, together on the beat. Between the two,
    // whichever is louder leads; in silence nothing changes.
    if (tuning > music + 0.05) u.uLoose.value = ease(u.uLoose.value, 1, dt, 0.7, 0.7);
    else if (music > 0.05) u.uLoose.value = ease(u.uLoose.value, 0, dt, 0.7, 0.7);
    // The beat clock follows the music without ever jumping: it runs at the tempo and is pulled
    // gently into phase (a bow stroke repeats every two beats). With no music it runs on, slowing
    // as the players stop.
    if (bpm) this.bps = bpm / 60;
    const together = (1 - u.uLoose.value) * most;
    if (beats != null && beats >= 0) {
      if (together < 0.02) this.beat = beats;
      else {
        const off = beats - this.beat;
        const wrap = off - 2 * Math.round(off / 2);
        this.beat += dt * this.bps + wrap * Math.min(1, dt * 3);
      }
    } else this.beat += dt * this.bps * (0.3 + 0.7 * most);
    u.uBeat.value = this.beat;
    u.uFree.value += dt * (0.45 + 0.55 * most);
    let swaying = 0;
    for (const v of this.sway) swaying += v / this.sway.length;
    u.uSwayT.value += dt * (0.55 + 0.6 * swaying);
    this.on = most > 0.02;
  }
}
