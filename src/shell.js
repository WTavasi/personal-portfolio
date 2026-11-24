// The top bar shared by every screen: the name (home), the mini-player, the sound control, the
// Résumé menu (print it, or email it) and All Sections. It lives outside the screens, so it stays
// put while pages change underneath it. On narrow screens the sound control moves into All
// Sections, and a tab bar along the bottom gives one-tap access to the rooms.
import { person, contact } from './content.js';
import { TRACKS, pathFor } from './lib/router.js';

// The tab bar on phones: the four core rooms (Home is the name; the notice board, an extra, is in
// the Tracklist).
const TABS = TRACKS.filter((t) => !t.extra && t.key !== 'home');
import { getState, setState, subscribe } from './lib/state.js';
import { ensureAudio, playClick } from './lib/audio.js';
import { themes, NOW_PLAYING } from './lib/themes.js';

const ICON = {
  play: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" fill="currentColor"/></svg>',
};
import { esc, resumePart } from './screens/resume-markup.js';

// The email that "Email the résumé" writes: the visitor's own mail app sends it, so nothing leaves
// the page and no address is kept. Mail apps cannot take attachments this way, so it links to the
// résumé on the web instead.
function mailtoFor(to) {
  const site = new URL(pathFor('home'), window.location.origin).href;
  const resumeUrl = new URL(pathFor('resume'), window.location.origin).href;
  const lines = [
    'Hello,',
    '',
    `Here is the résumé of ${person.name}, a ${person.headline.toLowerCase().replace('devops', 'DevOps')} based in ${person.location}.`,
    person.availability,
    '',
    `Résumé (web): ${resumeUrl}`,
    `Interactive portfolio: ${site}`,
    '',
    `Contact: ${[contact.email, contact.linkedin].filter(Boolean).join(' | ')}`,
  ];
  const q = (v) => encodeURIComponent(v);
  return `mailto:${q(to)}?subject=${q(`Résumé: ${person.name}, ${person.headline}`)}&body=${q(lines.join('\n'))}`;
}

// Print the résumé, from any page: it is written into a page of its own that only print shows.
function printResume() {
  let sheet = document.querySelector('.print-resume');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.className = 'print-resume';
    document.body.append(sheet);
  }
  sheet.innerHTML = `<main class="doc room-doc">${resumePart()}</main>`;
  document.body.classList.add('printing-resume');
  window.print();
}
window.addEventListener('afterprint', () => document.body.classList.remove('printing-resume'));

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
      <div class="menu resume-menu">
        <button class="btn btn-secondary topbar-btn" type="button" data-act="menu" aria-expanded="false" aria-controls="resume-menu">Résumé</button>
        <div class="tracklist-panel menu-panel" id="resume-menu" hidden>
          <button class="btn btn-secondary menu-item" type="button" data-act="print">Print the résumé</button>
          <button class="btn btn-secondary menu-item" type="button" data-act="mail" aria-expanded="false" aria-controls="mail-form">Email the résumé</button>
          <form class="mail-form" id="mail-form" hidden novalidate>
            <label for="mail-to">Send it to</label>
            <input id="mail-to" type="email" aria-describedby="mail-note" autocomplete="email" placeholder="name@company.com" required />
            <button class="btn btn-primary" type="submit">Write the email</button>
            <p class="mail-note" id="mail-note" aria-live="polite">This opens your own mail app with a message ready to send. The address stays on your device.</p>
          </form>
        </div>
      </div>
      <div class="menu tracklist">
        <button class="btn btn-secondary topbar-btn" type="button" data-act="menu" aria-expanded="false" aria-controls="tracklist">All Sections</button>
        <div class="tracklist-panel" id="tracklist" hidden>
          <ol class="tracks">
            ${TRACKS.map(
              (t) => `<li${t.extra ? ' class="track-extra"' : ''}><a class="track" href="${pathFor(t.key)}" data-track="${t.key}"><span class="track-no">${esc(t.no)}</span><span class="track-name">${esc(t.label)}</span></a></li>`,
            ).join('')}
          </ol>
          <div class="tracklist-extra">
            <button class="btn btn-secondary" type="button" data-act="sound" aria-pressed="false"></button>
          </div>
          <label class="tracklist-setting" hidden><input type="checkbox" data-act="keep" /> Keep music playing across pages</label>
        </div>
      </div>
    </nav>
  `;

  const tabbar = document.createElement('nav');
  tabbar.className = 'tabbar';
  tabbar.setAttribute('aria-label', 'Rooms');
  tabbar.innerHTML = TABS.map((t) => `<a class="tab" href="${pathFor(t.key)}" data-track="${t.key}">${esc(t.label)}</a>`).join('');

  // The two menus (Résumé, All Sections): one open at a time.
  const menus = [...el.querySelectorAll('.menu')].map((root) => ({ root, button: root.querySelector('[data-act="menu"]'), panel: root.querySelector('.menu-panel, #tracklist') }));
  function setOpen(menu, open, { focus = false } = {}) {
    for (const m of menus) {
      const on = m === menu && open;
      m.panel.hidden = !on;
      m.button.setAttribute('aria-expanded', String(on));
    }
    if (open && focus) menu.panel.querySelector('a, button')?.focus();
  }
  const closeAll = () => setOpen(null, false);
  const openMenu = () => menus.find((m) => !m.panel.hidden);

  // Email the résumé: the address field opens under the option.
  const mailForm = el.querySelector('.mail-form');
  const mailTo = el.querySelector('#mail-to');
  const mailNote = el.querySelector('#mail-note');
  const NOTE = mailNote.textContent;
  mailTo.addEventListener('input', () => {
    mailTo.removeAttribute('aria-invalid');
    mailNote.textContent = NOTE;
  });
  mailForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const to = mailTo.value.trim();
    if (!to || !mailTo.checkValidity()) {
      mailTo.setAttribute('aria-invalid', 'true');
      mailNote.textContent = 'Please enter an email address, like name@company.com.';
      return mailTo.focus();
    }
    window.location.href = mailtoFor(to);
    closeAll();
  });

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
    // The player and its setting appear once anything has played, and stay.
    if (themes.everPlayed) player.hidden = keep.parentElement.hidden = false;
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
    const actEl = e.target.closest('[data-act]');
    const act = actEl?.dataset.act;
    if (act === 'menu') {
      const menu = menus.find((m) => m.button === actEl);
      return setOpen(menu, menu.panel.hidden, { focus: e.detail === 0 });
    }
    if (act === 'print') {
      closeAll();
      return printResume();
    }
    if (act === 'mail') {
      mailForm.hidden = !mailForm.hidden;
      actEl.setAttribute('aria-expanded', String(!mailForm.hidden));
      if (!mailForm.hidden) mailTo.focus();
      return;
    }
    if (act === 'sound') {
      ensureAudio();
      setState({ sound: !getState().sound });
      onSound?.(getState().sound);
      playClick();
      return;
    }
    if (e.target.closest('.track')) closeAll();
  });

  // Esc closes a menu and puts focus back on its button; it does not also close a panel behind it.
  el.addEventListener('keydown', (e) => {
    const m = openMenu();
    if (e.key !== 'Escape' || !m) return;
    e.stopPropagation();
    closeAll();
    m.button.focus();
  });
  document.addEventListener('pointerdown', (e) => {
    const m = openMenu();
    if (m && !m.root.contains(e.target)) closeAll();
  });
  el.addEventListener('focusout', (e) => {
    const m = openMenu();
    if (m && e.relatedTarget && !m.root.contains(e.relatedTarget)) closeAll();
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
      closeAll();
    },
  };
}
