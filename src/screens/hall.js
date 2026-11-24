import { person } from '../content.js';
import { TRACKS, pathFor, navigate } from '../lib/router.js';
import { tuningActive, entrance } from '../lib/audio.js';
import { themes, prepareApplauseAll } from '../lib/themes.js';
import { visits } from '../lib/visits.js';
import { esc } from './resume-markup.js';

// The hall is the hub: every room of the site is a place you can see (design document, section 7).
// Three ways in, all at once: click the place, click its glowing marker, or use the bar along the
// bottom. Opening a room moves the camera to it and the room's page opens over the dimmed hall.
const ROOMS = TRACKS.filter((t) => t.key !== 'home');

export function hallScreen({ world }) {
  const api = world.api;
  const el = document.createElement('section');
  el.className = 'screen hall';
  el.setAttribute('aria-label', 'The concert hall');
  el.innerHTML = `
    <div class="scrim scrim-top" aria-hidden="true"></div>
    <div class="scrim scrim-bottom" aria-hidden="true"></div>
    <h1 class="sr-only">${esc(person.name)}, ${esc(person.headline)}</h1>

    <div class="markers" aria-hidden="true">
      ${ROOMS.map(
        (r) => `<a class="marker" href="${pathFor(r.key)}" data-room="${r.key}" tabindex="-1"><span class="marker-ring"></span><span class="marker-label">${esc(r.venue)}</span></a>`,
      ).join('')}
    </div>

    ${world.fallback ? '<p class="hall-note">The 3D hall is not available on this device. Every room is in the bar below.</p>' : ''}

    <div class="dock">
      <p class="hall-hint" data-bind="hint"></p>
      <nav class="sections panel" aria-label="Rooms">
        ${ROOMS.map(
          (r) => `<a class="sec" href="${pathFor(r.key)}" data-room="${r.key}"><span class="sec-label">${esc(r.label)}</span><span class="sec-venue">${esc(r.venue)}</span></a>`,
        ).join('')}
      </nav>
    </div>
  `;

  const $ = (s) => el.querySelector(s);
  const markers = [...el.querySelectorAll('.marker')];
  let hover = null;

  function renderProgress() {
    el.querySelectorAll('[data-room]').forEach((a) => a.classList.toggle('is-visited', visits.has(a.dataset.room)));
    $('[data-bind="hint"]').textContent = visits.full
      ? 'Full house. Thank you for exploring.'
      : visits.size
        ? `${visits.size} of ${visits.total} rooms visited`
        : 'Click a glowing marker, or any place in the hall, to open a room.';
  }

  /* --------------------------------------------- pointing at the 3D hall */

  let downAt = null;
  const overUi = (target) => target.closest('button, a, input, .sections');

  el.addEventListener('pointermove', (e) => {
    if (!api || e.pointerType === 'touch') return;
    const id = overUi(e.target) ? null : api.pick(e.clientX, e.clientY);
    if (id !== hover) {
      hover = id;
      api.setHover(id);
      markers.forEach((m) => m.classList.toggle('is-hover', m.dataset.room === id));
      el.classList.toggle('is-pointing', !!id);
    }
  });
  el.addEventListener('pointerdown', (e) => {
    downAt = [e.clientX, e.clientY];
  });
  // A click on a place in the hall (not a drag) opens its room. Links (markers, the bar) are
  // handled by the router like any other link.
  el.addEventListener('click', (e) => {
    if (overUi(e.target) || !api) return;
    if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const id = api.pick(e.clientX, e.clientY);
    if (id) navigate(id);
  });

  // Markers follow their place on screen every frame.
  function placeMarkers() {
    const show = api.revealed;
    el.classList.toggle('is-lit', show);
    for (const m of markers) {
      const p = show ? api.project(m.dataset.room) : null;
      m.hidden = !p;
      if (p) m.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    }
  }

  let unframe = () => {};
  return {
    el,
    title: `${person.name} | ${person.headline}`,
    mount() {
      renderProgress();
      world.show?.();
      if (api) {
        api.setAudience(visits.share());
        api.setView('overview');
        api.setSelected(null);
        api.setActive(null);
        unframe = api.onFrame(placeMarkers);
        api.start();
        // The still image on the first screen stays until the lights are up, then fades away.
        if (!api.revealed) api.reveal().then(() => world.onRevealed?.());
        else world.onRevealed?.();
      }
      // The applause is rendered in the background, ready for when the house is full.
      setTimeout(prepareApplauseAll, 3000);
      // Coming back from a room, the whole orchestra returns at the hall's level.
      if (!tuningActive() && !entrance.pending) themes.play(null);
    },
    // The top bar's sound control: turning sound back on picks the music up again.
    onSound(on) {
      if (on && !themes.playing && !tuningActive()) themes.play(null);
    },
    destroy() {
      unframe();
      api?.setHover(null);
    },
  };
}
