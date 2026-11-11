import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/figtree';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/boot.css';
import './styles/home.css';
import './styles/resume.css';

import { bootScreen } from './screens/boot.js';
import { homeScreen } from './screens/home.js';
import { resumeScreen } from './screens/resume.js';
import { getTempo } from './lib/state.js';

// Hash routes keep this a static site. A recruiter can open <site>/#/resume and skip everything.
const screens = { boot: bootScreen, home: homeScreen, resume: resumeScreen };

const canvas = document.getElementById('world');
const root = document.getElementById('app');

// The 3D hall is created once (during boot) and reused. It is loaded lazily so a direct link to the
// résumé never downloads the 3D code.
const world = {
  api: null,
  fallback: false,
  loading: null,
  load(onStep) {
    if (this.api) return Promise.resolve();
    this.loading ??= import('./world/index.js').then(async ({ createWorld }) => {
      this.api = await createWorld({ canvas, bpm: getTempo().bpm, onStep });
    });
    return this.loading;
  },
  show() {
    canvas.classList.toggle('is-ready', !this.fallback);
    document.body.classList.toggle('no-webgl', this.fallback);
    canvas.hidden = false;
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
  // Old links to #/program still work.
  if (key === 'program') {
    history.replaceState(null, '', '#/resume');
    key = 'resume';
  }
  if (!(key in screens)) key = 'boot';
  // The hall must be built before the home screen can show it.
  if (key === 'home' && !world.api && !world.fallback) key = 'boot';

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
