import { pathFor } from '../lib/router.js';
import { boardLayout, categories } from '../lib/board.js';
import { esc } from './resume-markup.js';
import { roomTitle } from './rooms-markup.js';

const PX = 1000; // CSS pixels to a metre on the board (world/index.js, BOARD_PX)
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const dateWords = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// The Notice Board, over the hall: the board itself is the content (design document, section 7).
// The camera faces the board and the real notes are laid over the 3D. Hovering (or focusing) a
// note lifts it and shows a short line; clicking it brings it forward with everything about it.
// The index-card tabs along the top filter the notes. Esc or "Back to the hall" returns.
//
// Wyclef's interests are sticky notes, one colour per category. Visitors' notes (stage S3, once
// approved) will be white index cards.
export function boardScreen({ world }) {
  const api = world.api;
  const { tabs, notes } = boardLayout();

  const el = document.createElement('section');
  el.className = 'screen board-screen';
  el.setAttribute('aria-labelledby', 'board-title');
  el.innerHTML = `
    <h1 class="sr-only" id="board-title" tabindex="-1">Notice board</h1>
    <p class="sr-only">What I am listening to, watching, playing and reading right now. Each note is a button; open one to read it.</p>
    <div class="board-dock">
      <a class="btn btn-secondary board-back" href="${pathFor('home')}">Back to the hall</a>
      <p class="board-hint">Hover a note to read it. Click it to open it.</p>
    </div>
    <div class="note-scrim" hidden></div>
    <article class="note-card" role="dialog" aria-modal="true" aria-labelledby="note-card-title" hidden></article>
  `;

  const $ = (s) => el.querySelector(s);
  const card = $('.note-card');
  const scrim = $('.note-scrim');

  /* ------------------------------------------------- the notes and the tabs */

  const tabEls = tabs.map((t) => {
    const wrap = document.createElement('div');
    wrap.className = 'board-item';
    wrap.innerHTML = `<button class="board-tab" type="button" data-filter="${esc(t.key)}" aria-pressed="${t.key === 'all'}" style="width:${Math.round(t.w * PX)}px;height:${Math.round(t.h * PX)}px">${esc(t.label)}</button>`;
    return { el: wrap, u: t.u, v: t.v };
  });

  const noteEls = notes.map((n, i) => {
    const p = n.pin;
    const wrap = document.createElement('div');
    wrap.className = 'board-item';
    const size = Math.round(n.size * PX);
    wrap.innerHTML = `
      <button class="note" type="button" data-i="${i}" data-category="${esc(p.category)}"
        style="--note:${n.colour};--pin:${n.pinColour};--tilt:${n.tilt.toFixed(3)}rad;width:${size}px;height:${size}px"
        aria-label="${esc(p.title)}, ${esc(categories[p.category] ?? 'Note')}">
        <span class="note-pin" aria-hidden="true"></span>
        <span class="note-cat" aria-hidden="true">${esc(categories[p.category] ?? 'Note')}</span>
        <span class="note-title" aria-hidden="true">${esc(p.title)}</span>
        ${p.creator ? `<span class="note-line" aria-hidden="true">${esc(p.creator)}</span>` : ''}
      </button>`;
    return { el: wrap, u: n.u, v: n.v };
  });

  const noteButtons = noteEls.map((n) => n.el.querySelector('.note'));
  const tabButtons = tabEls.map((t) => t.el.querySelector('.board-tab'));

  function filter(key) {
    tabButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === key)));
    noteButtons.forEach((b) => {
      const on = key === 'all' || b.dataset.category === key;
      b.classList.toggle('is-dim', !on);
      b.tabIndex = on ? 0 : -1;
      b.setAttribute('aria-hidden', String(!on));
    });
  }

  /* --------------------------------------------------- a note brought forward */

  let openFrom = null;

  function open(i) {
    const n = notes[i];
    const p = n.pin;
    openFrom = noteButtons[i];
    card.style.setProperty('--note', n.colour);
    card.innerHTML = `
      <p class="note-card-cat">${esc(categories[p.category] ?? 'Note')}</p>
      <h2 id="note-card-title">${esc(p.title)}</h2>
      ${p.creator ? `<p class="note-card-by">${esc(p.creator)}</p>` : ''}
      ${p.note ? `<p class="note-card-note">${esc(p.note)}</p>` : ''}
      <p class="note-card-date">Pinned ${esc(dateWords(p.pinned))}</p>
      <div class="note-card-actions">
        ${p.link ? `<a class="btn btn-secondary" href="${esc(p.link)}" target="_blank" rel="noopener">Open link</a>` : ''}
        <button class="btn btn-secondary" type="button" data-act="close">Put it back</button>
      </div>`;
    scrim.hidden = false;
    card.hidden = false;
    // It comes forward from where it is pinned: start at the note's place and size, then grow.
    if (!reduceMotion()) {
      const from = openFrom.getBoundingClientRect();
      const to = card.getBoundingClientRect();
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      const k = from.width / to.width;
      card.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${k}) rotate(${n.tilt}rad)`, opacity: 0.6 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 320, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
      );
    }
    card.querySelector('[data-act="close"]').focus({ preventScroll: true });
  }

  function close() {
    if (card.hidden) return;
    card.hidden = true;
    scrim.hidden = true;
    openFrom?.focus({ preventScroll: true });
    openFrom = null;
  }

  /* ------------------------------------------------------------------ events */

  const onBoardClick = (e) => {
    const tab = e.target.closest('.board-tab');
    if (tab) return filter(tab.dataset.filter);
    const note = e.target.closest('.note');
    if (note && !note.classList.contains('is-dim')) open(Number(note.dataset.i));
  };
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="close"]') || e.target === scrim) close();
  });
  // Esc puts an open note back first; only with none open does it leave the board.
  const onKey = (e) => {
    if (e.key !== 'Escape' || card.hidden) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  // Keep focus inside the card while it is open.
  card.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = [...card.querySelectorAll('a, button')];
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  return {
    el,
    title: roomTitle('wall'),
    mount() {
      api.showBoard([...tabEls, ...noteEls]);
      for (const item of [...tabEls, ...noteEls]) item.el.addEventListener('click', onBoardClick);
      window.addEventListener('keydown', onKey, true);
      filter('all');
      $('#board-title').focus({ preventScroll: true });
    },
    destroy() {
      window.removeEventListener('keydown', onKey, true);
      api.hideBoard();
    },
  };
}
