import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/figtree';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/boot.css';
import './styles/hall.css';
import './styles/resume.css';

import { bootScreen } from './screens/boot.js';
import { hallScreen } from './screens/hall.js';
import { resumeScreen } from './screens/resume.js';
import { themes } from './lib/themes.js';
import { stopTuning } from './lib/audio.js';

// Hash routes keep this a static site. A recruiter can open <site>/#/resume and skip everything.
const screens = { boot: bootScreen, hall: hallScreen, resume: resumeScreen };
const ALIASES = { program: 'resume', home: 'hall', concert: 'hall' }; // older links still work

const canvas = document.getElementById('world');
const root = document.getElementById('app');

// The 3D hall is created once (during the boot) and reused. It is loaded lazily so a direct
// link to the résumé never downloads the 3D code.
const world = {
  api: null,
  fallback: false,
  loading: null,
  load(onStep) {
    if (this.api) return Promise.resolve();
    this.loading ??= import('./world/index.js').then(async ({ createWorld }) => {
      this.api = await createWorld({ canvas, onStep });
      this.api.setBeatSource(() => themes.beats());
      this.api.start();
    });
    return this.loading;
  },
  showBlueprint() {
    canvas.hidden = false;
    canvas.classList.add('is-ready');
  },
  show() {
    canvas.classList.toggle('is-ready', !this.fallback);
    document.body.classList.toggle('no-webgl', this.fallback);
    canvas.hidden = this.fallback;
  },
  hide() {
    this.api?.stop();
    canvas.hidden = true;
  },
};

let current = null;

const go = (name) => {
  if (location.hash === `#/${name}`) route();
  else location.hash = `#/${name}`;
};

function route() {
  let key = location.hash.replace(/^#\/?/, '') || 'boot';
  if (ALIASES[key]) {
    key = ALIASES[key];
    history.replaceState(null, '', `#/${key}`);
  }
  if (!(key in screens)) key = 'boot';
  // The hall must be built before it can be shown.
  if (key === 'hall' && !world.api && !world.fallback) key = 'boot';
  if (key === 'boot' && (world.api || world.fallback)) key = 'hall';
  if (key === 'resume') {
    themes.stop(0.8);
    stopTuning(0.8);
  }

  current?.destroy?.();
  const next = screens[key]({ go, world });
  root.replaceChildren(next.el);
  document.title = next.title;
  document.body.dataset.screen = key;
  current = next;
  next.mount?.();
}

window.addEventListener('hashchange', route);
route();
