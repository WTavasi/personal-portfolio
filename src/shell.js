// The top bar shared by every screen: the name (home), the mini-player, the Tracklist menu, the
// sound control and the résumé. It lives outside the screens, so it stays put while pages change underneath it.
// On narrow screens the sound and résumé controls move into the Tracklist menu, and a tab bar
// along the bottom gives one-tap access to the rooms.
import { person } from './content.js';
import { TRACKS, pathFor } from './lib/router.js';

// The tab bar on phones: the five rooms (Home is the name, the résumé is in the Tracklist).
const TABS = TRACKS.filter((t) => !['home', 'resume'].includes(t.key));
import { getState, setState, subscribe } from './lib/state.js';
import { ensureAudio, playClick } from './lib/audio.js';
import { themes, NOW_PLAYING } from './lib/themes.js';

const ICON = {
  play: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" fill="currentColor"/></svg>',
};
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
      <div class="player" data-bind="player" role="group" aria-label="Music player" hidden>
        <button class="player-play" type="button" data-act="play"></button>
        <p class="player-now"><span class="player-title">${esc(NOW_PLAYING.title)}</span><span class="player-cat">${esc(NOW_PLAYING.category)}</span></p>
        <label class="player-vol"><span class="sr-only">Volume</span><input type="range" min="0" max="100" step="1" data-act="volume" /></label>
      </div>
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
          <label class="tracklist-setting"><input type="checkbox" data-act="keep" /> Keep music playing across pages</label>
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

  /* ------------------------------------------------ the mini-player */

  const player = el.querySelector('[data-bind="player"]');
  const playBtn = player.querySelector('[data-act="play"]');
  const volume = player.querySelector('[data-act="volume"]');
  const keep = el.querySelector('[data-act="keep"]');

  // It appears once anything has played, and stays.
  function renderPlayer() {
    const playing = themes.playing;
    if (themes.everPlayed) player.hidden = false;
    playBtn.innerHTML = playing ? ICON.pause : ICON.play;
    playBtn.setAttribute('aria-label', playing ? `Pause ${NOW_PLAYING.title}` : `Play ${NOW_PLAYING.title}`);
    player.classList.toggle('is-playing', playing);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }
  function renderSettings() {
    const { volume: v, keepPlaying } = getState();
    if (document.activeElement !== volume) volume.value = String(Math.round(v * 100));
    keep.checked = keepPlaying;
  }

  function play() {
    ensureAudio();
    // Pressing play is asking to hear it, so it turns sound on too.
    if (!getState().sound) setState({ sound: true });
    themes.resume();
  }
  const pause = () => themes.hold();

  playBtn.addEventListener('click', () => (themes.playing ? pause() : play()));
  volume.addEventListener('input', () => setState({ volume: Number(volume.value) / 100 }));
  keep.addEventListener('change', () => setState({ keepPlaying: keep.checked }));

  // Lock-screen and media-key controls.
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new window.MediaMetadata({ title: NOW_PLAYING.title, artist: person.name, album: NOW_PLAYING.category });
    try {
      navigator.mediaSession.setActionHandler('play', play);
      navigator.mediaSession.setActionHandler('pause', pause);
      navigator.mediaSession.setActionHandler('stop', pause);
    } catch {
      /* an action this browser does not support */
    }
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
  renderPlayer();
  renderSettings();
  subscribe(renderSound);
  subscribe(renderSettings);
  themes.onChange(renderPlayer);

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
