import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/figtree';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/home.css';
import './styles/hall.css';
import './styles/resume.css';
import './styles/shell.css';
import './styles/rooms.css';
import './styles/board.css';

import { homeScreen } from './screens/home.js';
import { stillMarkup } from './screens/home-markup.js';
import { hallScreen } from './screens/hall.js';
import { aboutScreen } from './screens/resume.js';
import { roomScreen } from './screens/room.js';
import { boardScreen } from './screens/board.js';
import { themes, BPM } from './lib/themes.js';
import { stopTuning } from './lib/audio.js';
import { getState } from './lib/state.js';
import { startRouter, currentRoute, navigate, neighbours } from './lib/router.js';
import { createShell } from './shell.js';
import { visits } from './lib/visits.js';
import { pathFor } from './lib/router.js';

// Every page has a real address (see lib/router.js). A recruiter can open <site>/resume and skip
// everything. Home is the first screen until the visitor turns on the hall, then the hall itself.
// About me holds the résumé: /resume opens it at the résumé part.
const screens = {
  home: homeScreen,
  hall: hallScreen,
  about: (o) => aboutScreen(o),
  resume: (o) => aboutScreen({ ...o, jump: true }),
};

const canvas = document.getElementById('world');
const root = document.getElementById('app');

// The 3D hall is built once, when the visitor turns it on, and reused. Its code is fetched while
// the first screen is idle, so a direct link to a room never downloads it unless asked.
const world = {
  api: null,
  fallback: false,
  on: false, // true once the visitor has turned on the hall
  module: null,
  loading: null,
  onRevealed: () => dropStill(),
  showStill: () => showStill(),
  dropStill: () => dropStill(),
  prefetch() {
    this.module ??= import('./world/index.js');
    return this.module;
  },
  load(onStep) {
    if (this.api) return Promise.resolve();
    this.loading ??= this.prefetch().then(async ({ createWorld }) => {
      this.api = await createWorld({ canvas, onStep });
      this.api.setBeatSource(() => themes.beats(), BPM);
    });
    return this.loading;
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

// The still image of the hall behind the plain first screen (written into index.html by the
// build, or added here). It stays while the real hall builds and lights up, then fades away. The
// terminal has the wireframe hall behind it instead, so it drops the still at once.
let still = document.querySelector('.hall-still');
function showStill() {
  if (!still) {
    canvas.insertAdjacentHTML('afterend', stillMarkup());
    still = document.querySelector('.hall-still');
  }
  still.removeAttribute('data-prerendered');
  still.classList.remove('is-gone');
}
function dropStill() {
  if (!still) return;
  const s = still;
  still = null;
  s.classList.add('is-gone');
  setTimeout(() => s.remove(), 900);
}

// The shared top bar sits outside the screens and outlives them.
const shell = createShell({ onSound: (on) => current?.onSound?.(on) });
document.body.insertBefore(shell.el, root);
document.body.append(shell.tabbar);

// Screens ask for 'hall' or 'resume'; the first screen and the hall share the home address.
const go = (name) => navigate(name === 'resume' ? 'resume' : 'home');

// Once the hall is lit, rooms open over it instead of replacing it: the camera moves to the room's
// place, the hall dims, and the page opens on the right. Without the hall (a direct link, no
// WebGL) a room is an ordinary page.
const hallIsOn = () => world.on && !!world.api?.revealed && !world.fallback;

// Clicking the dimmed hall around an open room goes back to the hall, as does Esc.
const backdrop = document.createElement('a');
backdrop.className = 'over-backdrop';
backdrop.href = pathFor('home');
backdrop.tabIndex = -1;
backdrop.setAttribute('aria-hidden', 'true');
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('over-hall') && !e.defaultPrevented) navigate('home');
});

// In a room, the keyboard's left and right arrows go to the previous and next room, like the
// arrows at the top of the room (not while typing, and not on the notice board, an extra).
window.addEventListener('keydown', (e) => {
  if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable], [role="slider"]') || e.target.type === 'range') return;
  const where = currentRoute();
  const room = where && ({ project: 'work', resume: 'about' }[where.key] ?? where.key);
  const n = room && where.key !== 'project' ? neighbours(room) : null;
  if (!n) return;
  e.preventDefault();
  navigate(e.key === 'ArrowLeft' ? n.prev.key : n.next.key);
});

function route() {
  const where = currentRoute() ?? { key: 'home' };
  const room = { project: 'work', resume: 'about' }[where.key] ?? where.key;
  let key = where.key;
  // Home is the hall once the visitor has turned it on.
  if (key === 'home' && world.on && world.api) key = 'hall';
  const over = key !== 'home' && key !== 'hall' && hallIsOn();

  if (key !== 'home' && key !== 'hall' && !over) dropStill();

  // Without the hall behind it, a page is silent, unless the visitor started the music from the
  // player and wants it to keep playing across pages: then it carries on, dipped to read over.
  // Over the hall, the music carries on in the room's own tone.
  if (key !== 'home' && key !== 'hall' && !over) {
    stopTuning(0.8);
    if (themes.chosen && getState().keepPlaying) themes.setTone('page');
    else themes.pause(0.8);
  }

  // The Notice Board over the hall is the board itself, not a page beside it. Phones, where the
  // notes would be too small to read, get the page.
  const onBoard = over && key === 'wall' && window.innerWidth > 640;
  const panel = over && !onBoard;

  current?.destroy?.();
  const next = onBoard
    ? boardScreen({ world })
    : key in screens
      ? screens[key]({ go, world, over })
      : roomScreen({ go, world, key, param: where.param, over });
  next.el.classList.toggle('is-over-hall', panel);
  next.el.classList.toggle('surface-paper', panel);
  root.replaceChildren(...(panel ? [backdrop, next.el] : [next.el]));
  document.title = next.title;
  document.body.dataset.screen = key;
  document.body.dataset.surface = over ? 'hall' : (next.surface ?? 'hall');
  document.body.classList.toggle('over-hall', over);
  document.body.classList.toggle('on-board', onBoard);
  current = next;
  shell.update(room);

  visits.record(room);
  if (over) {
    world.show();
    fitBesidePage();
    world.api.setView(room);
    world.api.setSelected(room);
    // Music the visitor chose plays on in the room's own tone (the Booth through glass, the foyer
    // rooms far away).
    themes.setTone(room === 'about' ? 'page' : room);
  }
  next.mount?.();
}

// The hall frames a room in the part of the screen the page leaves visible. On phones the page
// covers the screen, so there is nothing to fit.
function fitBesidePage() {
  const panel = current?.el.classList.contains('is-over-hall') ? current.el : null;
  const left = panel && window.innerWidth > 640 ? panel.getBoundingClientRect().left : window.innerWidth;
  world.api?.setInset(window.innerWidth - left);
}
window.addEventListener('resize', fitBesidePage);

startRouter(route);
