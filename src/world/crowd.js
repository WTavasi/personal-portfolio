import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, Kit } from './kit.js';

// The audience: seated people with arms, a head with a nose, and one of six hairstyles.
// Everyone is instanced (a few draw calls for the whole house). When every section has been
// explored they applaud, raising their hands to clap, and some throw flowers onto the stage.
// The clapping runs in the vertex shader, so it costs the CPU two numbers a frame.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const SKIN = [0x4a2f22, 0x6b4430, 0x8a5a3c, 0xa87150, 0xc48e68, 0xddb08c, 0x5c3a28, 0x7a4e36];
const CLOTHES = [0x2b2f3a, 0x3a2d2a, 0x4a3b33, 0x26333a, 0x55463a, 0x3d2630, 0x2f3b2f, 0x6a5a4c, 0x1f2430, 0x5a3038, 0x6b2a2e, 0x2e4a5a];
const HAIR = [0x161010, 0x1c130e, 0x2a1d16, 0x1c130e, 0x3b2a1e, 0x4a3420, 0x2a1d16, 0x6b4a2a, 0xa07a46, 0x7a3a20, 0x8f8a82];
const SHOE = 0x141214;

// Where a hand rests on the lap, and how far it rises to clap in front of the chest.
const REST_X = 0.11;
const LIFT_Y = 0.44;
const HEAD = V(0, 1.21, -0.03);

// A cylinder from a to b (one tapering part of a limb). Four sides is plenty at audience distance.
function limb(k, a, b, ra, rb, color, seg = 4) {
  const dir = b.clone().sub(a);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
  k.add(new THREE.CylinderGeometry(rb, ra, dir.length(), seg, 1), color, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)));
}

// Add the weight used by the clap: 0 stays put, 1 moves with the hand.
function withWeight(geo, weightAt) {
  const p = geo.attributes.position;
  const w = new Float32Array(p.count);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) w[i] = weightAt(v.fromBufferAttribute(p, i));
  geo.setAttribute('aW', new THREE.BufferAttribute(w, 1));
  return geo;
}

// Clothes: torso, legs, upper arms (still) and forearms (which move with the hands). Faces +z.
function clothesGeometry() {
  const body = new Kit();
  const torso = new THREE.CylinderGeometry(0.4 / Math.SQRT2, 0.34 / Math.SQRT2, 0.52, 4, 1);
  torso.rotateY(Math.PI / 4);
  torso.scale(1, 1, 0.22 / 0.4);
  body.add(torso, 0xffffff, M(0, 0.82, -0.05, -0.06));
  // lap and lower legs, mostly hidden by the seat in front
  body.box(0.36, 0.15, 0.46, 0xffffff, 0, 0.58, 0.14);
  body.box(0.32, 0.46, 0.13, 0xffffff, 0, 0.28, 0.4);
  body.box(0.3, 0.06, 0.2, SHOE, 0, 0.03, 0.5);
  const still = withWeight(body.geometry(), () => 0);

  // Arms: shoulder to elbow to wrist. To clap, the hands rise to just under the chin and the
  // elbows come up half as far, so the arms bend naturally instead of stretching.
  const along = (a, b, v) => {
    const d = b.clone().sub(a);
    return THREE.MathUtils.clamp(v.clone().sub(a).dot(d) / d.lengthSq(), 0, 1);
  };
  const shoulders = [-1, 1].map((sx) => V(sx * 0.2, 1.03, -0.05));
  const elbows = [-1, 1].map((sx) => V(sx * 0.22, 0.75, 0.04));
  const wrists = [-1, 1].map((sx) => V(sx * REST_X, 0.63, 0.3));
  const upperArms = new Kit();
  const foreArms = new Kit();
  [0, 1].forEach((i) => {
    limb(upperArms, shoulders[i], elbows[i], 0.05, 0.043, 0xffffff);
    limb(foreArms, elbows[i], wrists[i], 0.042, 0.034, 0xffffff);
  });
  const side = (v) => (v.x < 0 ? 0 : 1);
  const upper = withWeight(upperArms.geometry(), (v) => 0.5 * along(shoulders[side(v)], elbows[side(v)], v));
  const fore = withWeight(foreArms.geometry(), (v) => 0.5 + 0.5 * along(elbows[side(v)], wrists[side(v)], v));
  const moving = mergeGeometries([upper, fore], false);
  return mergeGeometries([still, moving], false);
}

// Skin: neck, head with a nose (still) and the hands (which clap). Palms face each other.
function skinGeometry() {
  const head = new Kit();
  head.box(0.08, 0.09, 0.08, 0xffffff, 0, 1.1, -0.04);
  head.add(new THREE.SphereGeometry(0.105, 7, 4), 0xffffff, new THREE.Matrix4().compose(HEAD, new THREE.Quaternion(), V(0.9, 1.08, 0.98)));
  head.box(0.022, 0.035, 0.03, 0xffffff, 0, HEAD.y - 0.01, HEAD.z + 0.1);
  const still = withWeight(head.geometry(), () => 0);
  const hands = new Kit();
  for (const sx of [-1, 1]) hands.box(0.03, 0.08, 0.09, 0xffffff, sx * REST_X, 0.65, 0.35);
  return mergeGeometries([still, withWeight(hands.geometry(), () => 1)], false);
}

// Hairstyles, each a separate mesh tinted per person. Bald people get none.
function hairGeometries() {
  const cap = (k) => k.add(new THREE.SphereGeometry(0.11, 7, 3, 0, Math.PI * 2, 0, Math.PI * 0.62), 0xffffff, new THREE.Matrix4().compose(HEAD.clone().add(V(0, 0.035, -0.015)), new THREE.Quaternion(), V(0.95, 0.8, 1.02)));
  const short = new Kit();
  cap(short);
  const long = new Kit();
  cap(long);
  long.box(0.2, 0.3, 0.07, 0xffffff, 0, HEAD.y - 0.1, HEAD.z - 0.08);
  for (const sx of [-1, 1]) long.box(0.04, 0.22, 0.12, 0xffffff, sx * 0.09, HEAD.y - 0.06, HEAD.z - 0.02);
  const bun = new Kit();
  cap(bun);
  bun.add(new THREE.SphereGeometry(0.055, 5, 3), 0xffffff, M(0, HEAD.y + 0.09, HEAD.z - 0.09));
  const afro = new Kit();
  afro.add(new THREE.SphereGeometry(0.16, 8, 5), 0xffffff, new THREE.Matrix4().compose(HEAD.clone().add(V(0, 0.06, -0.03)), new THREE.Quaternion(), V(1, 0.88, 0.95)));
  const pony = new Kit();
  cap(pony);
  limb(pony, HEAD.clone().add(V(0, 0.04, -0.1)), HEAD.clone().add(V(0, -0.2, -0.16)), 0.035, 0.02, 0xffffff, 5);
  return { short: short.geometry(), long: long.geometry(), bun: bun.geometry(), afro: afro.geometry(), pony: pony.geometry() };
}
const HAIR_MIX = [
  ['short', 0.35],
  ['long', 0.2],
  ['bun', 0.1],
  ['afro', 0.12],
  ['pony', 0.13],
  ['bald', 0.1],
];

/* ------------------------------------------------------------------- flowers */

function bouquetGeometries() {
  const wrap = new Kit();
  const cone = new THREE.CylinderGeometry(0.075, 0.018, 0.24, 7, 1, true);
  wrap.add(cone, 0xe8dcc0, M(0, 0.12, 0));
  for (const [x, z] of [
    [0.012, 0],
    [-0.012, 0.01],
    [0, -0.012],
  ]) {
    wrap.add(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 4), 0x3f6a2a, M(x, -0.04, z));
  }
  const blooms = new Kit();
  for (const [x, y, z] of [
    [0, 0.29, 0],
    [0.055, 0.26, 0.02],
    [-0.05, 0.265, -0.025],
    [0.015, 0.255, -0.06],
    [-0.02, 0.25, 0.058],
  ]) {
    blooms.add(new THREE.IcosahedronGeometry(0.042, 0), 0xffffff, M(x, y, z));
  }
  for (const [x, z] of [
    [0.07, -0.03],
    [-0.07, 0.03],
  ]) {
    wrap.add(new THREE.BoxGeometry(0.05, 0.004, 0.03), 0x3f6a2a, M(x, 0.24, z, 0, 0, x > 0 ? -0.5 : 0.5));
  }
  return { wrap: wrap.geometry(), blooms: blooms.geometry() };
}
const BLOOMS = [0xc81e3a, 0xe8577a, 0xf3efe6, 0xf2c14e, 0xb3264a, 0xf08a5d];

/* ------------------------------------------------------------------- shader */

const CLAP_HEAD = /* glsl */ `
attribute float aW;
attribute float aPhase;
uniform float uClap;
uniform float uTime;
`;
// Hands rise from the lap to the chest and beat together, each person at their own pace.
const CLAP_MOVE = /* glsl */ `
vec3 transformed = vec3(position);
if (uClap > 0.001 && aW > 0.0) {
  float side = sign(position.x);
  float open = 0.5 + 0.5 * sin(uTime * (11.0 + mod(aPhase, 3.0)) + aPhase);
  float x = 0.016 + 0.07 * open;
  transformed += aW * uClap * vec3(side * (x - ${REST_X.toFixed(3)}), ${LIFT_Y.toFixed(3)}, -0.02);
}
`;

export function buildCrowd(scene, audienceMx, rand, { stageTop, stageFrontZ }) {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const n = audienceMx.length;
  const uniforms = { uClap: { value: 0 }, uTime: { value: 0 } };
  const clapMat = () => {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${CLAP_HEAD}`).replace('#include <begin_vertex>', CLAP_MOVE);
    };
    return m;
  };

  const phase = new THREE.InstancedBufferAttribute(new Float32Array(n).map(() => rand() * 30), 1);
  const make = (geo, mat, list, tints) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    list.forEach((mx, i) => m.setMatrixAt(i, mx));
    tints.forEach((c, i) => m.setColorAt(i, new THREE.Color(c)));
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false; // bounds would be measured while the hall is empty
    scene.add(m);
    return m;
  };

  const clothes = clothesGeometry();
  const skin = skinGeometry();
  clothes.setAttribute('aPhase', phase);
  skin.setAttribute('aPhase', phase);
  const body = make(clothes, clapMat(), audienceMx, audienceMx.map(() => pick(CLOTHES)));
  const heads = make(skin, clapMat(), audienceMx, audienceMx.map(() => pick(SKIN)));

  // Each hairstyle mesh holds its people in fill order, so showing the first k people of the
  // house shows exactly their hair too.
  const hairGeo = hairGeometries();
  const hairMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const styleOf = audienceMx.map(() => {
    let r = rand();
    for (const [style, share] of HAIR_MIX) if ((r -= share) < 0) return style;
    return 'short';
  });
  const hair = Object.entries(hairGeo).map(([style, geo]) => {
    const members = [];
    styleOf.forEach((s, i) => s === style && members.push(i));
    const mesh = make(geo, hairMat, members.map((i) => audienceMx[i]), members.map(() => pick(HAIR)));
    return { mesh, members };
  });

  function setCount(k) {
    body.count = heads.count = k;
    for (const h of hair) {
      let c = 0;
      while (c < h.members.length && h.members[c] < k) c++;
      h.mesh.count = c;
    }
  }
  setCount(0);

  /* ---------- Flowers ---------- */
  const FLOWERS = 34;
  const bq = bouquetGeometries();
  const wrapMesh = new THREE.InstancedMesh(bq.wrap, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), FLOWERS);
  const bloomMesh = new THREE.InstancedMesh(bq.blooms, new THREE.MeshLambertMaterial({ vertexColors: true }), FLOWERS);
  for (let i = 0; i < FLOWERS; i++) bloomMesh.setColorAt(i, new THREE.Color(pick(BLOOMS)));
  for (const m of [wrapMesh, bloomMesh]) {
    m.count = 0;
    m.frustumCulled = false;
    scene.add(m);
  }

  // Throwers come from the rows nearest the stage; each bouquet lands on the stage front.
  const nearest = audienceMx
    .map((mx) => new THREE.Vector3().setFromMatrixPosition(mx))
    .filter((p) => p.z < 3 && Math.abs(p.x) < 9)
    .sort(() => rand() - 0.5);
  const flights = Array.from({ length: FLOWERS }, (_, i) => {
    const from = (nearest[i % Math.max(1, nearest.length)] ?? V(0, 0, 2)).clone().add(V(0, 1.25, 0));
    const x = THREE.MathUtils.clamp(from.x * 0.55 + (rand() - 0.5) * 5, -7.5, 7.5);
    let z = stageFrontZ(Math.abs(x)) - 0.25 - rand() * 0.9;
    if (Math.abs(x) < 0.8) z = Math.max(z, -5.75); // keep clear of the podium
    return {
      from,
      to: V(x, stageTop + 0.04, z),
      delay: 0.4 + rand() * 3.6,
      time: 1.2 + rand() * 0.5,
      height: 2.2 + rand() * 1.4,
      spin: V(rand() * 9 - 4.5, rand() * 6 - 3, rand() * 9 - 4.5),
      yaw: rand() * Math.PI * 2,
    };
  });

  const o = new THREE.Object3D();
  function placeFlower(i, f, u) {
    if (u >= 1) {
      // lying on the stage
      o.position.copy(f.to);
      o.rotation.set(0, f.yaw, 0);
      o.rotateX(Math.PI / 2 - 0.08);
      o.position.y += 0.07;
    } else {
      o.position.lerpVectors(f.from, f.to, u);
      o.position.y += 4 * f.height * u * (1 - u);
      o.rotation.set(f.spin.x * u, f.yaw + f.spin.y * u, f.spin.z * u);
    }
    o.updateMatrix();
    wrapMesh.setMatrixAt(i, o.matrix);
    bloomMesh.setMatrixAt(i, o.matrix);
  }

  let started = null; // time the celebration began
  let settled = true;
  const HOLD = 6.2; // seconds of the full ovation

  if (new URLSearchParams(location.search).has('stats')) window.__clap = () => uniforms.uClap.value;
  return {
    setCount,
    // Applause and flowers. With reduced motion the flowers are simply there, nobody moves.
    celebrate(instant, now) {
      wrapMesh.count = bloomMesh.count = FLOWERS;
      if (instant) {
        flights.forEach((f, i) => placeFlower(i, f, 1));
        wrapMesh.instanceMatrix.needsUpdate = bloomMesh.instanceMatrix.needsUpdate = true;
        return;
      }
      // until a bouquet's turn comes it is held out of sight
      flights.forEach((f, i) => placeFlower(i, { ...f, from: f.from.clone().setY(-50), to: f.from.clone().setY(-50) }, 0));
      started = now;
      settled = false;
    },
    animate(t, dt) {
      uniforms.uTime.value = t;
      if (started === null) return;
      const e = t - started;
      // Everyone claps through the ovation; afterwards they keep applauding, a little less high,
      // for as long as the visitor stays (the steady applause can be heard over the music).
      const target = e < HOLD ? 1 : 0.8;
      uniforms.uClap.value += (target - uniforms.uClap.value) * Math.min(1, dt * (target === 1 ? 5 : 1.6));
      if (settled) return;
      let flying = 0;
      flights.forEach((f, i) => {
        const u = (e - f.delay) / f.time;
        if (u < 0) return flying++;
        placeFlower(i, f, Math.min(1, u));
        if (u < 1) flying++;
      });
      wrapMesh.instanceMatrix.needsUpdate = bloomMesh.instanceMatrix.needsUpdate = true;
      if (!flying) settled = true;
    },
  };
}
