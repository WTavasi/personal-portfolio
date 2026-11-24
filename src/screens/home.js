import { person } from '../content.js';
import { navigate } from '../lib/router.js';
import { getState, setState } from '../lib/state.js';
import { ensureAudio, preloadTuning, playTuning, stopTuning } from '../lib/audio.js';
import { homeMarkup } from './home-markup.js';
import { roomPages } from './rooms-markup.js';

const saveData = () => !!navigator.connection?.saveData;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const later = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1500));
const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const PROMPT = 'wyclef@portfolio ~ %';

// The terminal's log, kept for the visit, so coming back to the first screen shows the finished
// build at once instead of running it again.
let log = null; // [text, class][] once the build has finished
let started = null; // Promise of the running build, so only one ever runs

// The first screen.
//
// With JavaScript, a terminal builds the page: every line is a real loading step, timed as it runs
// (the typefaces, the pages, each part of the hall, the sound), while the hall goes up as a
// wireframe behind the window, which keeps turning once built. Then it welcomes the visitor and
// offers the options: See my work, Work with me, or Enter the hall, which brings the lights up and starts the sound (the orchestra tuning, with the
// audience talking). Nothing makes a sound before that.
//
// On a data-saver connection, or without WebGL, it is the plain first screen over a still of the
// hall, and the 3D is only built if asked for. The plain screen is also what the build writes into
// index.html for search engines and visitors without JavaScript.
export function homeScreen({ world }) {
  const terminal = !saveData() && !world.fallback;
  const el = document.createElement('section');
  el.className = terminal ? 'screen home home-term' : 'screen home';
  el.setAttribute('aria-label', 'Home');
  el.innerHTML = terminal
    ? `
    <div class="term">
      <div class="term-bar">
        <span class="term-dots" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="term-title">wyclef@portfolio: ~</span>
      </div>
      <div class="term-body">
        <pre class="term-out" aria-hidden="true"></pre>
        <p class="sr-only" role="status" data-bind="build">Building the page.</p>
        <div class="term-ready" hidden>${homeMarkup()}</div>
      </div>
    </div>`
    : homeMarkup();

  const $ = (s) => el.querySelector(s);
  const box = $('[data-bind="hall"]');
  const button = $('[data-act="turn-on"]');
  const status = $('[data-bind="hall-status"]');
  let gone = false;

  function unavailable() {
    button.disabled = true;
    status.textContent = 'The 3D hall is not available on this device. Every room is in the Tracklist.';
  }

  /* ------------------------------------------------------------ the terminal */

  const out = $('.term-out');
  const ready = $('.term-ready');
  const buildStatus = $('[data-bind="build"]');
  const instant = reduceMotion();
  const lines = [];
  let current = null; // the step now running: { label, start, node, timer }

  const write = (text, cls = '') => {
    const span = document.createElement('span');
    if (cls) span.className = cls;
    span.textContent = text;
    out.append(span);
    lines.push(span);
    return span;
  };

  async function type(text) {
    write(`${PROMPT} `, 'prompt');
    if (instant) return void write(`${text}\n`);
    const span = write('');
    for (const ch of text) {
      if (gone) return;
      span.textContent += ch;
      await sleep(26 + Math.random() * 40);
    }
    span.textContent += '\n';
    await sleep(160);
  }

  function finishStep(failed = false) {
    if (!current) return;
    clearInterval(current.timer);
    const ms = Math.round(performance.now() - current.start);
    const wide = window.innerWidth > 560; // the timing column only where it fits
    current.node.textContent = failed
      ? `  ✗ ${current.label}\n`
      : wide
        ? `  ✓ ${current.label.padEnd(30)} ${String(ms).padStart(4)} ms\n`
        : `  ✓ ${current.label}  ${ms} ms\n`;
    current.node.className = failed ? 'failed' : 'done';
    current = null;
  }

  async function onStep(label) {
    finishStep();
    if (gone) return;
    const node = write(`  ${SPIN[0]} ${label}\n`, 'doing');
    let i = 0;
    const timer = instant
      ? 0
      : setInterval(() => {
          i = (i + 1) % SPIN.length;
          node.textContent = `  ${SPIN[i]} ${label}\n`;
        }, 80);
    current = { label, start: performance.now(), node, timer };
    buildStatus.textContent = `${label}.`;
    if (!instant) await sleep(140); // long enough to read each line
  }

  async function build() {
    const t0 = performance.now();
    preloadTuning(); // the tuning and the chatter download while the hall builds
    const when = new Date().toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    write(`Last login: ${when} on console\n`, 'muted');
    await type('npm run build');
    write('> vite build && node scripts/build-hall.js\n', 'muted');

    await onStep('Loading typefaces');
    try {
      await document.fonts.ready;
    } catch {
      /* fonts are a nicety; carry on */
    }
    await onStep(`Laying out ${roomPages().length + 2} pages`);
    try {
      await world.load(onStep);
    } catch (err) {
      console.warn('3D hall unavailable:', err);
      world.fallback = true;
    }
    if (world.fallback) {
      finishStep(true);
      write('\n  WebGL is not available on this device, so the 3D hall cannot be drawn.\n  Every room is still here.\n\n', 'warn');
    } else {
      await onStep('Fetching the sound');
      await Promise.race([preloadTuning(), sleep(4000)]);
      finishStep();
      const secs = ((performance.now() - t0) / 1000).toFixed(2);
      const done = write(`  Built in ${secs} s.\n`, 'ok');
      // The steps fold into one line, so the options sit right under the build.
      if (!instant) await sleep(700);
      const steps = lines.filter((l) => l.className === 'done');
      for (const l of steps) {
        l.remove();
        lines.splice(lines.indexOf(l), 1);
      }
      done.textContent = `  ✓ Built ${steps.length} parts in ${secs} s.\n`;
    }
    await type('open portfolio');
    log = lines.map((s) => [s.textContent, s.className]);
  }

  // Show what was built and the options.
  function showReady() {
    ready.hidden = false;
    box.hidden = false;
    status.hidden = false;
    if (world.fallback) unavailable();
    buildStatus.textContent = 'Ready.';
    // The wireframe hall keeps turning slowly behind the welcome.
    world.api?.start();
    (world.fallback ? $('.home-btn') : button).focus({ preventScroll: true });
  }

  async function runTerminal() {
    world.dropStill();
    world.show();
    if (log) {
      for (const [text, cls] of log) write(text, cls);
      return showReady();
    }
    started ??= build();
    await started;
    if (!gone) {
      out.replaceChildren();
      lines.length = 0;
      for (const [text, cls] of log) write(text, cls);
      showReady();
    }
  }

  /* --------------------------------------------------------- turning it on */

  async function turnOn() {
    if (button.disabled) return;
    button.disabled = true;
    // Turning on the hall turns on sound: that is what the button promises. The orchestra tunes
    // with the audience talking underneath, then the hall hushes.
    if (!getState().sound) setState({ sound: true });
    ensureAudio();
    playTuning();

    let steps = 0;
    const onProgress = (label) => {
      steps += 1;
      if (!gone) status.textContent = `${label}…`;
      button.textContent = `Building the hall (${Math.min(99, Math.round((steps / 9) * 100))}%)`;
    };
    try {
      await world.load(onProgress);
    } catch (err) {
      console.warn('3D hall unavailable:', err);
      world.fallback = true;
    }
    if (world.fallback) {
      stopTuning(0.6);
      if (!gone) unavailable();
      return;
    }

    if (terminal) {
      el.classList.add('is-leaving');
      await sleep(instant ? 0 : 420);
    }
    world.on = true;
    navigate('home'); // the same address, now showing the hall
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="turn-on"]')) turnOn();
  });

  return {
    el,
    title: `${person.name} | ${person.headline}`,
    mount() {
      if (terminal) return void runTerminal();
      world.showStill();
      box.hidden = false;
      status.hidden = false;
      if (world.fallback) unavailable();
      if (saveData()) return;
      later(() => {
        if (gone) return;
        world.prefetch();
        preloadTuning();
      });
    },
    destroy() {
      gone = true;
      if (current) clearInterval(current.timer);
    },
  };
}
