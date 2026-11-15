import * as THREE from 'three';
import { buildHall, nextFrame } from './hall.js';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Camera poses: a position and a point to look at. The overview drifts in a slow arc; every
// other pose holds still apart from a faint sway. The camera eases between poses.
const OVERVIEW = { R: 22.5, swing: 0.28, height: 7.6, target: new THREE.Vector3(0, 4.0, -10.5), period: 60 };
const BUILD = { R: 30, swing: 0.55, height: 14, target: new THREE.Vector3(0, 3.2, -9), period: 90 };
const SECTION_VIEWS = {
  // Each view leaves its section left of centre, clear of the panel on the right.
  about: { pos: [2.2, 3.3, -1.2], target: [-0.3, 2.0, -8.2] },
  experience: { pos: [1.2, 4.3, -2.8], target: [-0.6, 1.4, -8.8] },
  projects: { pos: [-1.2, 5.0, -3.6], target: [2.6, 1.7, -12.2] },
  skills: { pos: [-0.2, 5.4, -5.2], target: [6.2, 2.0, -13.6] },
  education: { pos: [-2.4, 4.4, -9.6], target: [3.4, 2.6, -19.0] },
};
const BASE_FOV = 46;

// Rendering budget: 60 frames a second at most, and resolution capped for Intel laptops
// with Retina screens. Text stays sharp because it is HTML, not part of the 3D scene.
const MIN_FRAME_MS = 12;
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

  let dirty = true;
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
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

  function orbit(o, t, outPos, outTarget) {
    const swing = still ? 0 : o.swing * Math.sin((2 * Math.PI * t) / o.period);
    outTarget.copy(o.target);
    outPos.set(Math.sin(swing) * o.R, o.height, o.target.z + Math.cos(swing) * o.R);
  }
  function goal(t) {
    if (pose === 'build') return orbit(BUILD, t, goalPos, goalTarget);
    if (pose === 'overview') return orbit(OVERVIEW, t, goalPos, goalTarget);
    const v = SECTION_VIEWS[pose];
    const sway = still ? 0 : 0.12 * Math.sin((2 * Math.PI * t) / 23);
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

  const fx = await buildHall(scene, step);
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
  const fallbackStart = performance.now();

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
      // Without music the conductor keeps time on his own, at the same tempo.
      const beats = beatSource?.() ?? ((now - fallbackStart) / 1000) * (80 / 60);
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

    // With reduced motion the scene only redraws when something actually changes.
    if (still && !changing) return;
    renderer.render(scene, camera);
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
      pose = name === 'overview' || SECTION_VIEWS[name] ? name : 'overview';
      dirty = true;
    },
    setHover(id) {
      hover = id;
    },
    setSelected(id) {
      selected = id;
    },
    setActive(id) {
      active = id;
    },
    setBeatSource(fn) {
      beatSource = fn;
    },
    setAudience(share) {
      fx.setAudience(share);
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
