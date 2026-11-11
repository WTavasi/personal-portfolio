import { person } from '../content.js';
import { TEMPOS, getState, getTempo, setState, subscribe } from '../lib/state.js';
import { ensureAudio, playTuning, stopTuning, playClick } from '../lib/audio.js';

// Set to true when the rhythm game ships. Until then the primary action is the résumé,
// and the concert button says plainly that it is not playable yet.
const GAME_READY = false;

let begun = false; // remembered so coming back from the résumé skips the intro

export function homeScreen({ go, world }) {
  const el = document.createElement('section');
  el.className = 'screen home';
  el.setAttribute('aria-label', 'Home');

  const tempoButtons = TEMPOS.map(
    (t) => `
      <button class="seg" role="radio" data-tempo="${t.id}" aria-checked="false" tabindex="-1">
        <span class="seg-num">${t.bpm}</span>
        <span class="seg-name">${t.name}</span>
      </button>`,
  ).join('');

  el.innerHTML = `
    <div class="scrim scrim-top" aria-hidden="true"></div>
    <div class="scrim scrim-bottom" aria-hidden="true"></div>

    <header class="home-top">
      <div class="wordmark">
        <h1>${person.name}</h1>
        <p>${person.fullName}</p>
      </div>
      <a class="link-quiet" href="#/resume">Skip to résumé</a>
    </header>

    ${world.fallback ? '<p class="fallback-note">The 3D hall is not available on this device. The menu below still works.</p>' : ''}

    <button class="begin-hit" type="button">Begin: turns on sound and opens the menu</button>
    <p class="begin-hint" aria-hidden="true">Click anywhere to begin</p>

    <div class="menu" hidden>
      <div class="menu-group">
        <button class="btn btn-primary" data-act="resume">View résumé</button>
        <button class="btn btn-secondary" data-act="play" ${GAME_READY ? '' : 'aria-disabled="true"'}>
          <span>Start the concert</span>
          ${GAME_READY ? '' : '<span class="btn-note">Not playable yet</span>'}
        </button>
      </div>
      <div class="menu-group">
        <div class="seg-row" role="radiogroup" aria-label="Tempo">${tempoButtons}</div>
        <div class="row">
          <span id="sound-label">Sound</span>
          <button class="switch" role="switch" data-act="sound" aria-labelledby="sound-label"></button>
        </div>
      </div>
      <p class="sr-only" aria-live="polite" data-bind="live"></p>
    </div>
  `;

  const $ = (s) => el.querySelector(s);
  const menu = $('.menu');
  const hint = $('.begin-hint');
  const hit = $('.begin-hit');
  const live = $('[data-bind="live"]');

  function renderSettings() {
    const t = getTempo();
    el.querySelectorAll('.seg').forEach((b) => {
      const on = b.dataset.tempo === t.id;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    const sw = $('.switch');
    const s = getState().sound;
    sw.setAttribute('aria-checked', String(s));
    sw.textContent = s ? 'On' : 'Off';
    world.api?.setBpm(t.bpm);
  }

  function begin(fromKeyboard = false) {
    if (begun && !menu.hidden) return;
    begun = true;
    ensureAudio();
    playTuning();
    world.api?.setMode('podium');
    hint.hidden = true;
    hit.hidden = true;
    menu.hidden = false;
    menu.classList.add('menu-in');
    $('.btn-primary').focus({ preventScroll: true });
    if (fromKeyboard) live.textContent = 'Menu open.';
  }

  el.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const seg = e.target.closest('.seg');
    if (seg) {
      setState({ tempo: seg.dataset.tempo });
      playClick();
      const t = getTempo();
      live.textContent = `Tempo ${t.bpm} BPM, ${t.name}.`;
      return;
    }
    if (act === 'resume') go('resume');
    else if (act === 'play' && GAME_READY) go('play');
    else if (act === 'sound') {
      setState({ sound: !getState().sound });
      if (!getState().sound) stopTuning(0.4);
      playClick();
    } else if (!begun && !e.target.closest('a')) begin(e.detail === 0);
  });

  // Arrow keys move through the tempo radio group
  el.addEventListener('keydown', (e) => {
    const seg = e.target.closest?.('.seg');
    if (!seg) return;
    const i = TEMPOS.findIndex((t) => t.id === seg.dataset.tempo);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % TEMPOS.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + TEMPOS.length) % TEMPOS.length;
    if (next === null) return;
    e.preventDefault();
    setState({ tempo: TEMPOS[next].id });
    el.querySelector(`.seg[data-tempo="${TEMPOS[next].id}"]`).focus();
    playClick();
  });

  // Any key except Tab begins, so keyboard users are not stuck behind "click anywhere"
  const onKey = (e) => {
    if (begun || e.key === 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('a')) return;
    e.preventDefault();
    begin(true);
  };

  let unsub = () => {};
  return {
    el,
    title: `${person.name} | ${person.fullName}`,
    mount() {
      renderSettings();
      unsub = subscribe(renderSettings);
      window.addEventListener('keydown', onKey);
      world.show?.();
      world.api?.start();
      if (begun) {
        world.api?.setMode('podium');
        hint.hidden = true;
        hit.hidden = true;
        menu.hidden = false;
        $('.btn-primary').focus({ preventScroll: true });
      } else {
        world.api?.setMode('drift');
      }
    },
    destroy() {
      unsub();
      window.removeEventListener('keydown', onKey);
      stopTuning(0.8);
    },
  };
}
