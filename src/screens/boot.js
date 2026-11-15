import { person } from '../content.js';
import { getState, setState, subscribe } from '../lib/state.js';
import { ensureAudio, preloadTuning, playTuning, playClick } from '../lib/audio.js';
import { themes, preloadThemes } from '../lib/themes.js';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const PROMPT = 'wyclef@portfolio ~/concert-hall %';

// A terminal that builds the hall. Every line is a real loading step, timed as it runs, while
// the hall goes up as a wireframe behind the window. When it is done the visitor chooses
// their sound settings and enters when they are ready.
export function bootScreen({ go, world }) {
  const el = document.createElement('section');
  el.className = 'screen boot';
  el.setAttribute('aria-label', 'Loading');
  el.innerHTML = `
    <a class="boot-skip" href="#/resume">Skip to résumé</a>
    <div class="term">
      <div class="term-bar">
        <span class="term-dots" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="term-title">wyclef@portfolio: ~/concert-hall</span>
      </div>
      <div class="term-body">
        <pre class="term-out"></pre>
        <div class="term-ready" hidden>
          <div class="term-row">
            <span id="snd-l">Sound</span>
            <button class="switch" role="switch" data-act="sound" aria-labelledby="snd-l"></button>
            <label for="vol" class="vol-l">Volume</label>
            <input id="vol" class="range" type="range" min="0" max="100" step="5" />
            <output for="vol" class="range-out"></output>
          </div>
          <div class="term-actions">
            <button class="btn btn-primary" data-act="enter">Enter the hall <span class="kbd" aria-hidden="true">Enter</span></button>
          </div>
        </div>
      </div>
    </div>
    <p class="sr-only" role="status" data-bind="status">Building the hall.</p>
  `;

  const $ = (s) => el.querySelector(s);
  const out = $('.term-out');
  const ready = $('.term-ready');
  const status = $('[data-bind="status"]');
  const vol = $('#vol');
  const instant = reduceMotion();

  let cancelled = false;
  let entering = false;
  let current = null; // { label, start, node, timer }
  const started = performance.now();

  const write = (text, cls) => {
    const span = document.createElement('span');
    if (cls) span.className = cls;
    span.textContent = text;
    out.append(span);
    return span;
  };

  async function type(text) {
    write(`${PROMPT} `, 'prompt');
    if (instant) return write(`${text}\n`);
    const span = write('');
    for (const ch of text) {
      if (cancelled) return;
      span.textContent += ch;
      await sleep(26 + Math.random() * 40);
    }
    span.textContent += '\n';
    await sleep(160);
  }

  function finishStep() {
    if (!current) return;
    clearInterval(current.timer);
    const ms = Math.round(performance.now() - current.start);
    const wide = window.innerWidth > 560; // keep the timing column only where it fits
    current.node.textContent = wide
      ? `  ✓ ${current.label.padEnd(30)} ${String(ms).padStart(4)} ms\n`
      : `  ✓ ${current.label}  ${ms} ms\n`;
    current.node.className = 'done';
    current = null;
  }

  async function onStep(label) {
    finishStep();
    if (cancelled) return;
    const node = write(`  ${SPIN[0]} ${label}\n`, 'doing');
    let i = 0;
    const timer = instant
      ? 0
      : setInterval(() => {
          i = (i + 1) % SPIN.length;
          node.textContent = `  ${SPIN[i]} ${label}\n`;
        }, 80);
    current = { label, start: performance.now(), node, timer };
    status.textContent = `${label}.`;
    if (!instant) await sleep(140); // long enough to read each line
  }

  function renderSettings() {
    const s = getState();
    const sw = $('.switch');
    sw.setAttribute('aria-checked', String(s.sound));
    sw.textContent = s.sound ? 'On' : 'Off';
    vol.value = String(Math.round(s.volume * 100));
    vol.disabled = !s.sound;
    $('.range-out').textContent = `${Math.round(s.volume * 100)}%`;
  }

  async function run() {
    preloadTuning();
    preloadThemes(); // the music downloads and decodes while the hall builds
    const when = new Date().toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    write(`Last login: ${when} on console\n`, 'muted');
    await type('npm run build:hall');
    write(`> node scripts/build-hall.js\n`, 'muted');

    await onStep('Loading typefaces');
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
    if (world.fallback) {
      if (current) {
        clearInterval(current.timer);
        current.node.textContent = `  ✗ ${current.label}\n`;
        current.node.className = 'failed';
        current = null;
      }
      write('\n  WebGL is not available on this device, so the 3D hall cannot be drawn.\n  The sections are still here as a list.\n\n', 'warn');
    } else {
      finishStep();
      const secs = ((performance.now() - started) / 1000).toFixed(2);
      write(`  Built in ${secs} s.\n`, 'ok');
    }
    await type('open hall');
    ready.hidden = false;
    status.textContent = 'The hall is ready. Choose your sound settings, then enter the hall.';
    $('[data-act="enter"]').focus({ preventScroll: true });
  }

  async function enter() {
    if (entering || ready.hidden) return;
    entering = true;
    ensureAudio();
    // The orchestra tunes as the lights come up; the hall theme comes in as the tuning fades.
    playTuning().then((seconds) => {
      if (!seconds) themes.play();
      else setTimeout(() => !themes.playing && themes.play(), seconds * 1000);
    });
    if (world.api) world.api.reveal();
    el.classList.add('is-leaving');
    await sleep(instant ? 0 : 480);
    go('hall');
  }

  el.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'enter') enter();
    if (act === 'sound') {
      setState({ sound: !getState().sound });
      playClick();
    }
  });
  vol.addEventListener('input', () => setState({ volume: Number(vol.value) / 100 }));
  vol.addEventListener('change', () => playClick());

  // Enter opens the hall from anywhere except the volume slider and links.
  const onKey = (e) => {
    if (e.key !== 'Enter' || ready.hidden) return;
    if (e.target.closest?.('a, input, [role="switch"]')) return;
    e.preventDefault();
    enter();
  };

  let unsub = () => {};
  return {
    el,
    title: `${person.name} | Building the hall`,
    mount() {
      renderSettings();
      unsub = subscribe(renderSettings);
      window.addEventListener('keydown', onKey);
      world.showBlueprint?.();
      run();
    },
    destroy() {
      cancelled = true;
      unsub();
      window.removeEventListener('keydown', onKey);
      if (current) clearInterval(current.timer);
    },
  };
}
