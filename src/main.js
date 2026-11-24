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
import './styles/rooms.css';

import { bootScreen } from './screens/boot.js';
import { hallScreen } from './screens/hall.js';
import { resumeScreen } from './screens/resume.js';
import { roomScreen } from './screens/room.js';
import { themes, BPM } from './lib/themes.js';
import { stopTuning } from './lib/audio.js';
import { startRouter, currentRoute, navigate } from './lib/router.js';
import { createShell } from './shell.js';
import { visits } from './lib/visits.js';
import { pathFor } from './lib/router.js';

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
document.body.append(shell.tabbar);

// Screens ask for 'hall' or 'resume'; both the boot screen and the hall live at the home address.
const go = (name) => navigate(name === 'resume' ? 'resume' : 'home');

// Once the hall is lit, rooms open over it instead of replacing it: the camera moves to the room's
// place, the hall dims, and the page opens on the right. Without the hall (a direct link, no
// WebGL) a room is an ordinary page.
const hallIsOn = () => !!world.api?.revealed && !world.fallback;

// Clicking the dimmed hall around an open room goes back to the hall, as does Esc.
const backdrop = document.createElement('a');
backdrop.className = 'over-backdrop';
backdrop.href = pathFor('home');
backdrop.tabIndex = -1;
backdrop.setAttribute('aria-hidden', 'true');
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('over-hall') && !e.defaultPrevented) navigate('home');
});

function route() {
  const where = currentRoute() ?? { key: 'home' };
  const room = where.key === 'project' ? 'work' : where.key;
  let key = where.key === 'home' ? 'boot' : where.key;
  // The hall must be built before it can be shown.
  if (key === 'boot' && (world.api || world.fallback)) key = 'hall';
  const over = key !== 'boot' && key !== 'hall' && hallIsOn();

  // Without the hall behind it, a page is silent; over the hall, the music carries on.
  if (key !== 'boot' && key !== 'hall' && !over) {
    themes.pause(0.8);
    stopTuning(0.8);
  }

  current?.destroy?.();
  const next = key in screens ? screens[key]({ go, world, over }) : roomScreen({ go, world, key, param: where.param, over });
  next.el.classList.toggle('is-over-hall', over);
  next.el.classList.toggle('surface-paper', over);
  root.replaceChildren(...(over ? [backdrop, next.el] : [next.el]));
  document.title = next.title;
  document.body.dataset.screen = key;
  document.body.dataset.surface = over ? 'hall' : (next.surface ?? 'hall');
  document.body.classList.toggle('over-hall', over);
  current = next;
  shell.update(room);

  // Seat the audience as rooms are visited; the sixth room fills the house.
  const fullHouse = visits.record(room);
  if (over) {
    world.show();
    world.api.setView(room);
    world.api.setSelected(room);
    world.api.setAudience(visits.share());
    if (fullHouse) {
      world.api.celebrate();
      themes.applause();
    }
    // The Studio brings the whole orchestra up; every other room keeps it at the hall's level.
    themes.play(room === 'music' ? 'about' : null);
  }
  next.mount?.();
}

startRouter(route);
