import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/figtree';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/boot.css';
import './styles/hall.css';
import './styles/resume.css';
import './styles/shell.css';

import { bootScreen } from './screens/boot.js';
import { hallScreen } from './screens/hall.js';
import { resumeScreen } from './screens/resume.js';
import { themes, BPM } from './lib/themes.js';
import { stopTuning } from './lib/audio.js';
import { startRouter, currentRoute, navigate } from './lib/router.js';
import { createShell } from './shell.js';

// Every page has a real address (see lib/router.js). A recruiter can open <site>/resume and skip
// everything. Home is the boot screen until the hall is built, then the hall itself.
const screens = { boot: bootScreen, hall: hallScreen, resume: resumeScreen };

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
      this.api.setBeatSource(() => themes.beats(), BPM);
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

// The shared top bar sits outside the screens and outlives them.
const shell = createShell({ onSound: (on) => current?.onSound?.(on) });
document.body.insertBefore(shell.el, root);

// Screens ask for 'hall' or 'resume'; both the boot screen and the hall live at the home address.
const go = (name) => navigate(name === 'resume' ? 'resume' : 'home');

function route() {
  let key = currentRoute() === 'resume' ? 'resume' : 'boot';
  // The hall must be built before it can be shown.
  if (key === 'boot' && (world.api || world.fallback)) key = 'hall';
  if (key === 'resume') {
    themes.pause(0.8);
    stopTuning(0.8);
  }

  current?.destroy?.();
  const next = screens[key]({ go, world });
  root.replaceChildren(next.el);
  document.title = next.title;
  document.body.dataset.screen = key;
  document.body.dataset.surface = next.surface ?? 'hall';
  current = next;
  shell.update(key === 'resume' ? 'resume' : 'home');
  next.mount?.();
}

startRouter(route);
