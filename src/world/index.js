import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { buildHall, nextFrame } from './hall.js';
import { BOARD, DESK } from '../lib/board.js';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Camera poses: a position and a point to look at. The overview drifts in a slow arc; every
// other pose holds still apart from a faint sway. The camera eases between poses.
const OVERVIEW = { R: 22.5, swing: 0.28, height: 7.6, target: new THREE.Vector3(0, 4.0, -10.5), period: 60 };
const BUILD = { R: 30, swing: 0.55, height: 14, target: new THREE.Vector3(0, 3.2, -9), period: 48 };
const BASE_FOV = 46;
const TAN = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2));

// Rendering budget: 60 frames a second at most, and resolution capped for Intel laptops
// with Retina screens. Text stays sharp because it is HTML, not part of the 3D scene.
const MIN_FRAME_MS = 12;
// The Notice Board's real notes are page elements sized in CSS pixels; this many make a metre.
export const BOARD_PX = 1000;
const MAX_PIXEL_RATIO = 1.25;

export async function createWorld({ canvas, onStep }) {
  let renderer = null;
  let scene = null;
  let camera = null;
  const blueprintMat = new THREE.MeshBasicMaterial({
    color: 0xe3b552,
    wireframe: true,
    transparent: true,
    opacity: 0.17,
    toneMapped: false,
    fog: false,
  });

  // Each loading step redraws the wireframe, so the visitor watches the hall go up.
  const step = async (label) => {
    await onStep?.(label);
    if (renderer && scene) {
      placeCamera(performance.now() / 1000);
      renderer.render(scene, camera);
    }
    await nextFrame();
  };

  await step('Starting the renderer');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: false, powerPreference: 'high-performance' });
  const levels = [Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO), 1, 0.8].filter((v, i, a) => i === 0 || v < a[0]);
  let level = 0;
  renderer.setPixelRatio(levels[level]);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Nothing that casts a shadow ever moves, so the shadow map is drawn once, not every frame.
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  scene = new THREE.Scene();
  scene.overrideMaterial = blueprintMat;
  camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 90);

  let inset = 0; // pixels on the right covered by an open page
  let fx = null; // the hall, once built
  // With a page open on the right, the centre of the picture moves to the middle of what is still
  // visible, so the room sits centred beside the page instead of behind it.
  const applyInset = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // The camera sees a picture `inset` pixels wider than the window and shows its right part.
    camera.aspect = (w + inset) / h;
    if (inset > 0) camera.setViewOffset(w + inset, h, inset, 0, w, h);
    else camera.clearViewOffset();
  };

  // The Notice Board's real notes: page elements laid over the 3D exactly where the painted notes
  // are, shown only while the camera faces the board (nothing stands between them and the camera
  // there, so they never need to be hidden behind anything).
  const css = new CSS3DRenderer();
  const layer = css.domElement;
  layer.className = 'board-layer';
  layer.hidden = true;
  canvas.after(layer);
  const cssScene = new THREE.Scene();
  const board = new THREE.Group();
  board.position.set(BOARD.x - 0.09, BOARD.y, BOARD.z);
  board.rotation.y = -Math.PI / 2; // face into the hall: the board's right is the hall's +z
  cssScene.add(board);
  // The desk top: lying flat, facing up; along the desk (u) is the hall's +z, away from whoever
  // stands at it (v) is +x, toward the wall.
  const desk = new THREE.Group();
  desk.position.set(DESK.x, DESK.y + 0.003, DESK.z);
  desk.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));
  cssScene.add(desk);
  const surfaces = { board, desk };
  const deskPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(DESK.y + 0.003));
  const hit = new THREE.Vector3();
  let boardWanted = false;
  let boardShown = false;
  let boardTimer = 0;
  let boardSince = 0;
  let boardWhere = 'board';

  let dirty = true;
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    css.setSize(window.innerWidth, window.innerHeight);
    applyInset();
    camera.updateProjectionMatrix();
    dirty = true;
  };
  resize();
  window.addEventListener('resize', resize);

  const still = reduceMotion();
  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const goalPos = new THREE.Vector3();
  const goalTarget = new THREE.Vector3();
  let pose = 'build';
  let pinned = null; // debug only, set from the console with ?stats

  // A room's view, worked out from the object rather than set by hand, so it is framed straight
  // on and fills the part of the screen left visible at any window size: the camera stands in
  // front of the object, far enough back for its whole size to fit, at the room's eye height.
  const viewFor = (name) => {
    const v = fx?.views?.[name];
    if (!v || v.pos) return v;
    const visible = window.innerWidth - inset;
    const aspect = visible / window.innerHeight;
    const [w, h] = v.size;
    const d = Math.max(h / 2 / TAN, w / 2 / (TAN * aspect));
    const [x, y, z] = v.at;
    const [nx, , nz] = v.face;
    return { pos: [x + nx * d, v.eye, z + nz * d], target: [x, y, z] };
  };

  function orbit(o, t, outPos, outTarget) {
    const swing = still ? 0 : o.swing * Math.sin((2 * Math.PI * t) / o.period);
    outTarget.copy(o.target);
    outPos.set(Math.sin(swing) * o.R, o.height, o.target.z + Math.cos(swing) * o.R);
  }
  // A view behind a wall (backstage) is reached through its doorway: the camera goes to the
  // doorway first, then on in, and comes back out the same way.
  let via = []; // [{ pos, target }] to pass through first, in order
  function goal(t) {
    if (via.length) {
      goalPos.set(...via[0].pos);
      goalTarget.set(...via[0].target);
      if (camPos.distanceToSquared(goalPos) < 0.3) via.shift();
      return;
    }
    if (pose === 'build') return orbit(BUILD, t, goalPos, goalTarget);
    if (pose === 'overview') return orbit(OVERVIEW, t, goalPos, goalTarget);
    const v = viewFor(pose);
    // A faint sway keeps a view alive, except at the board, which is read like a page.
    const sway = still || pose === 'wall' ? 0 : 0.12 * Math.sin((2 * Math.PI * t) / 23);
    goalPos.set(v.pos[0] + sway, v.pos[1], v.pos[2]);
    goalTarget.set(...v.target);
  }
  function placeCamera(t, k = 1) {
    if (pinned) {
      camera.position.set(pinned[0], pinned[1], pinned[2]);
      camera.lookAt(pinned[3], pinned[4], pinned[5]);
      return false;
    }
    goal(t);
    const before = camPos.distanceToSquared(goalPos) + camTarget.distanceToSquared(goalTarget);
    camPos.lerp(goalPos, k);
    camTarget.lerp(goalTarget, k);
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
    return before > 1e-5;
  }
  placeCamera(0);

  fx = await buildHall(scene, step);
  for (const o of fx.lit) o.visible = false;

  await step('Warming up the shaders');
  // Compile the real materials too, so the reveal does not stutter.
  scene.overrideMaterial = null;
  if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  scene.overrideMaterial = blueprintMat;
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);

  /* ------------------------------------------------- hover, selection, reveal */

  const follow = fx.lights.follow;
  let hover = null;
  let selected = null;
  let spotLevel = 0;
  const spotGoal = new THREE.Vector3();
  let reveal = null; // { start, duration, resolve } while the lights come up
  let revealed = false;
  const frameListeners = new Set();
  let active = null; // which section is playing on its own, or null for everyone
  let beatSource = null;
  let fallbackBpm = 80;

  function spotTarget() {
    const id = selected ?? hover;
    return id ? fx.sections[id] : null;
  }

  /* ------------------------------------------------------------- the loop */

  let running = false;
  let raf = 0;
  let last = performance.now();
  let lastDraw = 0;
  const samples = [];

  function adapt(interval) {
    if (level >= levels.length - 1) return;
    samples.push(interval);
    if (samples.length < 90) return;
    samples.sort((a, b) => a - b);
    const slow = samples[Math.floor(samples.length * 0.7)];
    samples.length = 0;
    if (slow > 22) {
      level++;
      renderer.setPixelRatio(levels[level]);
      resize();
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - lastDraw < MIN_FRAME_MS) return;
    const interval = now - lastDraw;
    lastDraw = now;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const t = now / 1000;

    let changing = dirty;
    dirty = false;

    // The lights come up: the wireframe fades, then the real hall brightens from dark.
    if (reveal) {
      const p = Math.min(1, (now - reveal.start) / reveal.duration);
      if (p < 0.25) {
        blueprintMat.opacity = 0.17 * (1 - p / 0.25);
      } else {
        if (scene.overrideMaterial) {
          scene.overrideMaterial = null;
          for (const o of fx.lit) o.visible = true;
        }
        const q = (p - 0.25) / 0.75;
        renderer.toneMappingExposure = 0.03 + 0.97 * q * q * (3 - 2 * q);
      }
      if (p >= 1) {
        renderer.toneMappingExposure = 1;
        revealed = true;
        reveal.resolve();
        reveal = null;
      }
      changing = true;
    }

    const k = still ? 1 : 1 - Math.exp(-dt * (pose === 'overview' || pose === 'build' ? 1.4 : 2.2));
    if (placeCamera(t, k)) changing = true;

    // Follow spot eases toward the hovered or open section.
    const s = spotTarget();
    const want = s && revealed ? (selected ? 950 : 600) : 0;
    if (s) spotGoal.copy(s.focus);
    if (Math.abs(spotLevel - want) > 1 || (s && follow.target.position.distanceToSquared(spotGoal) > 1e-4)) {
      const sk = still ? 1 : 1 - Math.exp(-dt * 6);
      spotLevel += (want - spotLevel) * sk;
      if (s) follow.target.position.lerp(spotGoal, sk);
      follow.position.set(follow.target.position.x * 0.6, 13, follow.target.position.z + 9);
      follow.intensity = spotLevel;
      follow.target.updateMatrixWorld();
      changing = true;
    }

    if (!still && revealed) {
      // Without music there is no beat: the orchestra is tuning and the conductor waits.
      const beats = beatSource?.() ?? null;
      fx.animate(t, beats, active, dt);
      const pos = fx.dust.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + dt * 0.1;
        if (y > 10) y = 2;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.04);
      }
      pos.needsUpdate = true;
      changing = true;
    }

    // The real notes appear once the camera has arrived at the board, over the painted ones.
    // (Or after 2.5 s at most, on a device too slow for the camera to settle sooner.)
    if (boardWanted && !boardShown && (camPos.distanceToSquared(goalPos) < 0.05 || now - boardSince > 2500)) {
      boardShown = true;
      layer.classList.add('is-on');
      // The painted notes go once the real ones have faded in over them.
      clearTimeout(boardTimer);
      boardTimer = setTimeout(() => {
        if (boardShown && boardWhere === 'board') {
          fx.boardNotes.visible = false;
          dirty = true;
        }
      }, 260);
      changing = true;
    }

    // With reduced motion the scene only redraws when something actually changes.
    if (still && !changing) return;
    renderer.render(scene, camera);
    if (boardWanted) css.render(cssScene, camera);
    for (const fn of frameListeners) fn();
    if (interval < 200) adapt(interval);
  }

  /* --------------------------------------------------------- picking, markers */

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const proxyList = Object.values(fx.sections).map((s) => s.proxy);
  const tmp = new THREE.Vector3();

  if (new URLSearchParams(location.search).has('stats')) {
    window.__hallStats = () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      programs: renderer.info.programs?.length,
      pixelRatio: renderer.getPixelRatio(),
      seats: fx.seatCount,
      chairs: fx.chairCount,
    });
    window.__hallLook = (...v) => {
      pinned = v.length ? v : null;
      dirty = true;
    };
    // Make the orchestra play to a steady beat without music, to check the players' movement.
    window.__hallPlay = (on = true) => {
      const t0 = performance.now();
      beatSource = on ? () => ((performance.now() - t0) / 1000) * (fallbackBpm / 60) : null;
    };
  }

  return {
    sections: Object.keys(fx.sections),
    get revealed() {
      return revealed;
    },
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      dirty = true;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    // Turn the lights on. Resolves when the hall is fully lit.
    reveal() {
      if (revealed) return Promise.resolve();
      pose = 'overview';
      return new Promise((resolve) => {
        reveal = { start: performance.now(), duration: still ? 1 : 2600, resolve };
      });
    },
    // 'overview' or a section id
    setView(name) {
      const next = name === 'overview' || fx.views[name] ? name : 'overview';
      // In through the doorway, or back out of it the other way.
      if (next !== pose) via = fx.views[next]?.via ? [...fx.views[next].via] : fx.views[pose]?.via ? [...fx.views[pose].via].reverse() : [];
      pose = next;
      dirty = true;
    },
    // Lay page elements over the hall, on the board or the desk: items are { el, u, v, lift?,
    // turn? } with u and v in metres from the surface's centre (see lib/board.js), each element
    // sized in CSS pixels (BOARD_PX to a metre). Returns a handle per item to move it later.
    showBoard(items, where = 'board') {
      clearTimeout(boardTimer);
      board.clear();
      desk.clear();
      const handles = items.map(({ el, u, v, lift = 0, turn = 0 }) => {
        const o = new CSS3DObject(el);
        o.position.set(u, v, lift);
        o.rotation.z = -turn;
        o.scale.setScalar(1 / BOARD_PX);
        surfaces[where].add(o);
        return {
          move(nu, nv, nlift = o.position.z) {
            o.position.set(nu, nv, nlift);
            dirty = true;
          },
        };
      });
      boardWanted = true;
      boardShown = false;
      boardWhere = where;
      boardSince = performance.now();
      layer.hidden = false;
      fx.boardNotes.visible = true;
      dirty = true;
      return handles;
    },
    // Where a point on the screen falls on the desk top, as { u, v } in metres, or null.
    deskPoint(clientX, clientY) {
      ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(deskPlane, hit)) return null;
      return { u: hit.z - DESK.z, v: hit.x - DESK.x };
    },
    hideBoard() {
      boardWanted = false;
      boardShown = false;
      layer.classList.remove('is-on');
      fx.boardNotes.visible = true;
      dirty = true;
      clearTimeout(boardTimer);
      boardTimer = setTimeout(() => {
        if (boardWanted) return;
        board.clear();
        desk.clear();
        layer.hidden = true;
      }, 300);
    },
    // Pixels on the right of the screen covered by an open page (0 for none).
    setInset(px) {
      const next = Math.max(0, Math.round(px));
      if (next === inset) return;
      inset = next;
      resize();
    },
    setHover(id) {
      hover = id;
    },
    setSelected(id) {
      selected = id;
      fx.setEncore(id === 'about', still);
      dirty = true;
    },
    setActive(id) {
      active = id;
    },
    setBeatSource(fn, bpm = fallbackBpm) {
      beatSource = fn;
      fallbackBpm = bpm;
    },
    // The full-house moment: the audience applauds and throws flowers onto the stage.
    celebrate() {
      fx.celebrate(reduceMotion(), performance.now() / 1000);
      dirty = true;
    },
    // Which section is under a point on the screen, or null.
    pick(clientX, clientY) {
      if (!revealed) return null;
      ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(proxyList, false)[0];
      return hit ? hit.object.userData.section : null;
    },
    // Screen position of a section's marker, or null when it is behind the camera.
    project(id) {
      tmp.copy(fx.sections[id].anchor).project(camera);
      if (tmp.z > 1) return null;
      return { x: ((tmp.x + 1) / 2) * window.innerWidth, y: ((1 - tmp.y) / 2) * window.innerHeight };
    },
    onFrame(fn) {
      frameListeners.add(fn);
      return () => frameListeners.delete(fn);
    },
    dispose() {
      this.stop();
      window.removeEventListener('resize', resize);
      renderer.dispose();
    },
  };
}
