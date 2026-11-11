import * as THREE from 'three';
import { buildHall, nextFrame } from './hall.js';
import { BeatClock } from '../lib/beat.js';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Camera presets. The camera swings in a slow arc around a point on the stage.
// drift: above the back of the stalls. podium: closer, after the first click.
const MODES = {
  drift: { R: 22.5, az: 0.3, height: 7.6, ty: 4.0, lz: -10.5, period: 56 },
  podium: { R: 13.5, az: 0.16, height: 4.6, ty: 2.6, lz: -8.6, period: 56 },
};
const KEYS = ['R', 'az', 'height', 'ty', 'lz', 'period'];
const BASE_FOV = 46;

// Rendering budget. Drift is slow, so 60 frames a second is plenty even on 120 Hz screens.
const MIN_FRAME_MS = 12;
// Intel laptops with Retina screens choke above this; text stays sharp because it is HTML.
const MAX_PIXEL_RATIO = 1.25;

export async function createWorld({ canvas, bpm, onStep }) {
  const step = async (label) => {
    await onStep?.(label);
    await nextFrame();
  };

  await step('Starting the renderer');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    stencil: false,
    powerPreference: 'high-performance',
  });
  // Quality steps, highest first. We drop a step if the machine cannot keep up.
  const levels = [Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO), 1, 0.8].filter(
    (v, i, a) => i === 0 || v < a[0],
  );
  let level = 0;
  renderer.setPixelRatio(levels[level]);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Nothing that casts a shadow ever moves, so the shadow map is drawn once, not every frame.
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 90);
  const fx = await buildHall(scene, step);

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  };

  let dirty = true;
  resize();
  window.addEventListener('resize', resize);

  // Camera state eases toward the active mode so switching modes glides.
  const cur = { ...MODES.drift };
  let goal = MODES.drift;
  const clock = new BeatClock(bpm);
  const still = reduceMotion();
  const lookAt = new THREE.Vector3();

  let pinned = null; // debug only: a fixed camera set from the console with ?stats

  function placeCamera(t) {
    if (pinned) {
      camera.position.set(pinned[0], pinned[1], pinned[2]);
      camera.lookAt(pinned[3], pinned[4], pinned[5]);
      return;
    }
    const swing = still ? 0 : cur.az * Math.sin((2 * Math.PI * t) / cur.period);
    const bob = still ? 0 : 0.2 * Math.sin((2 * Math.PI * t) / 31);
    lookAt.set(0, cur.ty, cur.lz);
    camera.position.set(Math.sin(swing) * cur.R, cur.height + bob, cur.lz + Math.cos(swing) * cur.R);
    camera.lookAt(lookAt);
  }

  await step('Warming up the shaders');
  placeCamera(0);
  renderer.shadowMap.needsUpdate = true;
  // Compile every shader now, during loading, so the first frames do not stutter.
  if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  renderer.render(scene, camera);

  let running = false;
  let raf = 0;
  let last = performance.now();
  let lastDraw = 0;
  const t0 = last;
  const samples = [];

  // If the machine struggles, step resolution down rather than stutter forever.
  function adapt(interval) {
    if (level >= levels.length - 1) return;
    samples.push(interval);
    if (samples.length < 90) return;
    samples.sort((a, b) => a - b);
    const slow = samples[Math.floor(samples.length * 0.7)];
    samples.length = 0;
    // Most frames slower than about 45 a second: take one step down.
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
    const t = (now - t0) / 1000;

    const k = 1 - Math.exp(-dt * 1.8);
    let moving = false;
    for (const key of KEYS) {
      const d = goal[key] - cur[key];
      if (Math.abs(d) > 1e-3) moving = true;
      cur[key] += d * k;
    }

    // With reduced motion the scene is still, so only draw when something changed.
    if (still && !moving && !dirty) return;
    dirty = false;
    placeCamera(t);

    // Everything breathes on the beat. Off entirely when the person prefers reduced motion.
    const p = still ? 0 : clock.pulse(now);
    const bar = still ? 0 : clock.barPulse(now);
    const { key: keyLight, wash } = fx.lights;
    keyLight.intensity = fx.base.key * (1 + 0.12 * p);
    wash.intensity = fx.base.wash * (1 + 0.08 * p + 0.18 * bar);
    for (const s of fx.shafts) s.mat.opacity = s.base * (1 + 0.5 * p + 0.25 * bar);
    fx.lampMat.color.setScalar(0.85 + 0.3 * p);
    fx.glowBig.material.opacity = 0.5 + 0.25 * p;
    fx.glowSmall.material.opacity = 0.7 + 0.25 * p;
    fx.scoreMat.emissiveIntensity = 0.45 + 0.3 * p;
    const fov = BASE_FOV - 0.3 * p;
    if (Math.abs(camera.fov - fov) > 0.001) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    if (!still) {
      const pos = fx.dust.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + dt * 0.12;
        if (y > 10) y = 2;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.05);
      }
      pos.needsUpdate = true;
    }

    renderer.render(scene, camera);
    if (interval < 200) adapt(interval);
  }

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
    setBpm(next) {
      clock.setBpm(next);
    },
    setMode(name) {
      goal = MODES[name] ?? MODES.drift;
    },
    renderOnce() {
      dirty = true;
      lastDraw = 0;
      frame(performance.now());
      cancelAnimationFrame(raf);
    },
    dispose() {
      this.stop();
      window.removeEventListener('resize', resize);
      renderer.dispose();
    },
  };
}
