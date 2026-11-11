import { person } from '../content.js';
import { getTempo } from '../lib/state.js';
import { preloadTuning } from '../lib/audio.js';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GLYPHS = ['♪', '♫', '♩', '♬', '\u{1D11E}', '♯'];

// The log is the loading state: each line appears when that stage of the hall really starts,
// and gets its OK when the next one begins. Nothing here is scripted for show.
const STEPS_BEFORE_WORLD = ['Loading typefaces'];

export function bootScreen({ go, world }) {
  const el = document.createElement('section');
  el.className = 'screen boot';
  el.setAttribute('aria-label', 'Loading');
  el.innerHTML = `
    <canvas class="boot-notes" aria-hidden="true"></canvas>
    <div class="boot-panel">
      <pre class="boot-out"></pre>
      <div class="boot-bar" role="progressbar" aria-label="Loading the hall" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
      <p class="boot-fail" role="status" hidden></p>
    </div>
    <a class="boot-skip" href="#/resume">Skip to résumé</a>
  `;

  const out = el.querySelector('.boot-out');
  const bar = el.querySelector('.boot-bar');
  const fill = bar.querySelector('span');
  const fail = el.querySelector('.boot-fail');
  const canvas = el.querySelector('canvas');
  const instant = reduceMotion();

  let cancelled = false;
  let open = null; // the line currently waiting for its OK
  let done = 0;
  const total = STEPS_BEFORE_WORLD.length + 7;

  const progress = () => {
    const pct = Math.min(100, Math.round((done / total) * 100));
    fill.style.width = `${pct}%`;
    bar.setAttribute('aria-valuenow', String(pct));
  };

  const closeLine = () => {
    if (!open) return;
    const dots = Math.max(3, 40 - open.length);
    out.append(document.createTextNode(` ${'.'.repeat(dots)} `));
    const ok = document.createElement('span');
    ok.className = 'ok';
    ok.textContent = 'OK';
    out.append(ok, document.createTextNode('\n'));
    open = null;
    done++;
    progress();
  };

  async function onStep(label) {
    closeLine();
    if (cancelled) return;
    out.append(document.createTextNode(label));
    open = label;
    if (!instant) await sleep(260);
  }

  async function run() {
    preloadTuning(); // downloads alongside the hall, plays on the first click
    out.append(document.createTextNode(`CONCERT BIOS v1.3\n(C) 2026 ${person.fullName}\nTempo locked: ${getTempo().bpm} BPM\n\n`));
    await onStep(STEPS_BEFORE_WORLD[0]);
    try {
      await document.fonts.ready;
    } catch {
      /* fonts are a nicety; carry on */
    }
    try {
      await world.load(onStep);
    } catch (err) {
      console.warn('3D hall unavailable:', err);
      world.fallback = true;
    }
    if (cancelled) return;
    closeLine();
    if (world.fallback) {
      fail.hidden = false;
      fail.textContent = 'The 3D hall could not start on this device. Everything else still works.';
      if (!instant) await sleep(900);
    } else if (!instant) {
      await sleep(350);
    }
    done = total;
    progress();
    if (!cancelled) go('home');
  }

  function startNotes() {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = 22;
    let w = 0;
    let h = 0;
    let cols = [];
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || '#e3b552';
    const dim = css.getPropertyValue('--text-3').trim() || '#a99a84';

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Array.from({ length: Math.ceil(w / (size * 2)) }, (_, i) => ({
        x: i * size * 2 + 10,
        y: Math.random() * -h,
        v: 0.6 + Math.random() * 1.4,
        g: GLYPHS[(Math.random() * GLYPHS.length) | 0],
        hot: Math.random() < 0.15,
      }));
      ctx.fillStyle = '#0b0709';
      ctx.fillRect(0, 0, w, h);
    };
    resize();
    window.addEventListener('resize', resize);
    if (instant) return () => window.removeEventListener('resize', resize);

    let raf = 0;
    let last = 0;
    const frame = (t) => {
      raf = requestAnimationFrame(frame);
      if (t - last < 45) return;
      last = t;
      ctx.fillStyle = 'rgba(11,7,9,0.2)';
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${size}px "Space Mono", monospace`;
      for (const c of cols) {
        ctx.fillStyle = c.hot ? accent : dim;
        ctx.globalAlpha = c.hot ? 0.9 : 0.45;
        ctx.fillText(c.g, c.x, c.y);
        c.y += c.v * 9;
        if (c.y > h + size) {
          c.y = -size;
          c.v = 0.6 + Math.random() * 1.4;
          c.g = GLYPHS[(Math.random() * GLYPHS.length) | 0];
          c.hot = Math.random() < 0.15;
        }
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }

  let stopNotes = () => {};
  return {
    el,
    title: `${person.name} | Loading`,
    mount() {
      stopNotes = startNotes();
      run();
    },
    destroy() {
      cancelled = true;
      stopNotes();
    },
  };
}
