// The top bar shared by every screen: the name (home), the Tracklist menu, the sound control and
// the résumé. It lives outside the screens, so it stays put while pages change underneath it.
// On narrow screens the sound and résumé controls move into the Tracklist menu, and a tab bar
// along the bottom gives one-tap access to the rooms.
import { person } from './content.js';
import { TRACKS, pathFor } from './lib/router.js';

// The tab bar on phones: the five rooms (Home is the name, the résumé is in the Tracklist).
const TABS = TRACKS.filter((t) => !['home', 'resume'].includes(t.key));
import { getState, setState, subscribe } from './lib/state.js';
import { ensureAudio, playClick } from './lib/audio.js';
import { esc } from './screens/resume-markup.js';

export function createShell({ onSound }) {
  const el = document.createElement('header');
  el.className = 'topbar';
  el.innerHTML = `
    <div class="topbar-id">
      <a class="topbar-name" href="${pathFor('home')}">${esc(person.name)}</a>
      <p class="topbar-role">${esc(person.headline)}</p>
    </div>
    <nav class="topbar-nav" aria-label="Site">
      <button class="link-quiet topbar-sound" type="button" data-act="sound" aria-pressed="false"></button>
      <a class="btn btn-secondary topbar-btn topbar-resume" href="${pathFor('resume')}">Résumé</a>
      <div class="tracklist">
        <button class="btn btn-secondary topbar-btn" type="button" data-act="tracklist" aria-expanded="false" aria-controls="tracklist">Tracklist</button>
        <div class="tracklist-panel" id="tracklist" hidden>
          <ol class="tracks">
            ${TRACKS.map(
              (t) => `<li><a class="track" href="${pathFor(t.key)}" data-track="${t.key}"><span class="track-no">${esc(t.no)}</span><span class="track-name">${esc(t.venue)}</span><span class="track-label">${esc(t.label)}</span></a></li>`,
            ).join('')}
          </ol>
          <div class="tracklist-extra">
            <button class="btn btn-secondary" type="button" data-act="sound" aria-pressed="false"></button>
          </div>
        </div>
      </div>
    </nav>
  `;

  const tabbar = document.createElement('nav');
  tabbar.className = 'tabbar';
  tabbar.setAttribute('aria-label', 'Rooms');
  tabbar.innerHTML = TABS.map((t) => `<a class="tab" href="${pathFor(t.key)}" data-track="${t.key}">${esc(t.label)}</a>`).join('');

  const button = el.querySelector('[data-act="tracklist"]');
  const panel = el.querySelector('.tracklist-panel');

  function setOpen(open, { focus = false } = {}) {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open && focus) panel.querySelector('.track')?.focus();
  }

  function renderSound() {
    const on = getState().sound;
    el.querySelectorAll('[data-act="sound"]').forEach((b) => {
      b.textContent = on ? 'Sound on' : 'Sound off';
      b.setAttribute('aria-pressed', String(on));
    });
  }

  el.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'tracklist') return setOpen(panel.hidden, { focus: e.detail === 0 });
    if (act === 'sound') {
      ensureAudio();
      setState({ sound: !getState().sound });
      onSound?.(getState().sound);
      playClick();
      return;
    }
    if (e.target.closest('.track')) setOpen(false);
  });

  // Esc closes the menu and puts focus back on its button; it does not also close a panel behind it.
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || panel.hidden) return;
    e.stopPropagation();
    setOpen(false);
    button.focus();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !e.target.closest('.tracklist')) setOpen(false);
  });
  el.addEventListener('focusout', (e) => {
    if (!panel.hidden && e.relatedTarget && !e.relatedTarget.closest('.tracklist')) setOpen(false);
  });

  renderSound();
  subscribe(renderSound);

  return {
    el,
    tabbar,
    // Called on every page change: mark the current track and close the menu.
    update(route) {
      [...el.querySelectorAll('.track'), ...tabbar.querySelectorAll('.tab')].forEach((a) => {
        if (a.dataset.track === route) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      setOpen(false);
    },
  };
}
