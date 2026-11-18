import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Shared building blocks for the hall and the orchestra: everything is assembled from primitives
// with colours stored per vertex, then merged so each group costs one draw call.

const colorCache = new Map();
export function linear(hex) {
  if (!colorCache.has(hex)) colorCache.set(hex, new THREE.Color(hex)); // stored as linear
  return colorCache.get(hex);
}

// Paint a geometry with one colour, or with {top, side, bottom} chosen by face direction.
export function paint(geo, color) {
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

export function prep(geo, color, matrix, keepUv) {
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
export const UP = new THREE.Vector3(0, 1, 0);

export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// A bag of parts that becomes one geometry (one draw call).
export class Kit {
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
export function slab(shape, y0, y1, curveSegments = 40) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

export function sector(cx, cy, r0, r1, a0, a1) {
  const s = new THREE.Shape();
  s.moveTo(cx + r1 * Math.cos(a0), cy + r1 * Math.sin(a0));
  s.absarc(cx, cy, r1, a0, a1, false);
  s.lineTo(cx + r0 * Math.cos(a1), cy + r0 * Math.sin(a1));
  s.absarc(cx, cy, r0, a1, a0, true);
  return s;
}

export const lambert = (o = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, ...o });

// Instanced mesh from a list of matrices (and optional per-instance tints).
export function instances(geo, mat, matrices, tints) {
  const m = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((mx, i) => m.setMatrixAt(i, mx));
  if (tints) tints.forEach((c, i) => m.setColorAt(i, c));
  m.instanceMatrix.needsUpdate = true;
  return m;
}

const o3 = new THREE.Object3D();
export function facing(x, y, z, tx, tz) {
  o3.position.set(x, y, z);
  o3.lookAt(tx, y, tz);
  o3.updateMatrix();
  return o3.matrix.clone();
}
