import { pathFor } from '../lib/router.js';
import { boardLayout, categories, DESK } from '../lib/board.js';
import { desk, LIMITS, DEFAULT_NOTE } from '../lib/desk.js';
import { esc } from './resume-markup.js';
import { roomTitle } from './rooms-markup.js';
import { ICON } from './room-nav.js';

const PX = 1000; // CSS pixels to a metre on the board and the desk (world/index.js, BOARD_PX)
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const dateWords = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// The Notice Board, over the hall: the board itself is the content (design document, section 7).
// The camera faces the board and the real notes are laid over the 3D. Hovering (or focusing) a
// note lifts it and shows a short line; clicking it brings it forward with everything about it.
// The index-card tabs along the top filter the notes. Wyclef's interests are sticky notes, one
// colour per category.
//
// Under the board is the desk, where visitors leave a note: write one, or just say "I was here".
// Notes are index cards lying on the desk among the sheet music. A visitor can drag their own card
// (during the visit they wrote it) and cards stack, the last one moved on top; any card can be
// opened to read, and an open card shows the others stacked with it.
//
// Esc puts an open note back, then goes from the desk up to the board, then back to the hall.
export function boardScreen({ world }) {
  const api = world.api;
  const { tabs, notes } = boardLayout();

  const el = document.createElement('section');
  el.className = 'screen board-screen';
  el.setAttribute('aria-labelledby', 'board-title');
  el.innerHTML = `
    <h1 class="sr-only" id="board-title" tabindex="-1">Notice board</h1>
    <p class="sr-only" data-bind="about">What I am listening to, watching, playing and reading right now. Each note is a button; open one to read it.</p>
    <div class="board-dock">
      <a class="btn btn-secondary board-back" href="${pathFor('home')}">${ICON.hall}<span>Back to the hall</span></a>
      <div class="board-mode" data-mode="board">
        <button class="btn btn-primary board-go" type="button" data-act="desk">Leave a note at the desk <span aria-hidden="true">↓</span></button>
        <p class="board-hint">Hover a note to read it. Click it to open it.</p>
      </div>
      <div class="board-mode" data-mode="desk" hidden>
        <button class="btn btn-secondary board-go" type="button" data-act="board"><span aria-hidden="true">↑</span> Back to the board</button>
        <button class="btn btn-primary board-go" type="button" data-act="write">Write a note</button>
        <button class="btn btn-secondary board-go" type="button" data-act="here">Just say “${esc(DEFAULT_NOTE)}”</button>
        <p class="board-hint">Click a card to read it. Drag your own to move it.</p>
      </div>
    </div>
    <p class="sr-only" role="status" data-bind="said"></p>
    <div class="note-scrim" hidden></div>
    <article class="note-card" role="dialog" aria-modal="true" aria-labelledby="note-card-title" hidden></article>
  `;

  const $ = (s) => el.querySelector(s);
  const card = $('.note-card');
  const scrim = $('.note-scrim');
  const said = $('[data-bind="said"]');
  let mode = 'board';

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

  /* ------------------------------------------------------------- the desk */

  const [cw, ch] = DESK.card;
  let cards = []; // { data, el, handle }

  const who = (c) => c.name || 'Someone';
  function cardEl(c) {
    const wrap = document.createElement('div');
    wrap.className = 'board-item';
    wrap.innerHTML = `
      <button class="desk-card${c.own ? ' is-own' : ''}${c.movable ? ' is-movable' : ''}" type="button" data-id="${esc(c.id)}"
        style="--turn:${(c.turn ?? 0).toFixed(3)}rad;width:${Math.round(cw * PX)}px;height:${Math.round(ch * PX)}px"
        aria-label="A note from ${esc(who(c))}${c.movable ? '. Yours: move it with the arrow keys' : ''}">
        <span class="desk-card-text" aria-hidden="true">${esc(c.text)}</span>
        <span class="desk-card-name" aria-hidden="true">${esc(who(c))}</span>
      </button>`;
    return wrap;
  }

  // Lay the cards out on the desk, bottom to top.
  function showDesk(focusId) {
    const list = desk.list();
    const items = list.map((c, i) => ({ el: cardEl(c), u: c.u, v: c.v, lift: 0.0012 * (i + 1) }));
    const handles = api.showBoard(items, 'desk');
    cards = list.map((data, i) => ({ data, el: items[i].el, handle: handles[i] }));
    for (const c of cards) c.el.addEventListener('pointerdown', onCardDown);
    if (focusId) cards.find((c) => c.data.id === focusId)?.el.querySelector('.desk-card').focus({ preventScroll: true });
  }

  // The cards lying over (or under) a card: its stack, bottom to top.
  function stackOf(c) {
    const [w, h] = [cw * 0.9, ch * 0.9];
    return cards.filter((o) => Math.abs(o.data.u - c.data.u) < w && Math.abs(o.data.v - c.data.v) < h);
  }

  // Dragging your own card: it follows the pointer across the desk and lands on top.
  let drag = null;
  function onCardDown(e) {
    const c = cards.find((k) => k.el === e.currentTarget);
    if (!c || e.button !== 0) return;
    drag = { c, x: e.clientX, y: e.clientY, moved: false, start: api.deskPoint(e.clientX, e.clientY), u: c.data.u, v: c.data.v };
    if (c.data.movable) e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  el.ownerDocument.addEventListener('pointermove', onMove);
  el.ownerDocument.addEventListener('pointerup', onUp);
  function onMove(e) {
    if (!drag || !drag.c.data.movable) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    drag.moved = true;
    const p = api.deskPoint(e.clientX, e.clientY);
    if (!p || !drag.start) return;
    const { u, v } = DESK.area;
    drag.c.data.u = Math.min(u[1], Math.max(u[0], drag.u + p.u - drag.start.u));
    drag.c.data.v = Math.min(v[1], Math.max(v[0], drag.v + p.v - drag.start.v));
    drag.c.handle.move(drag.c.data.u, drag.c.data.v, 0.0012 * (cards.length + 1));
  }
  function onUp() {
    if (!drag) return;
    const { c, moved } = drag;
    drag = null;
    if (moved) {
      desk.move(c.data.id, c.data.u, c.data.v);
      showDesk(c.data.id);
    } else openCard(c.data.id);
  }
  // The arrow keys move your own card too (2 cm a press), so it can be done without a mouse.
  el.ownerDocument.addEventListener('keydown', onCardKey);
  function onCardKey(e) {
    const btn = e.target.closest?.('.desk-card.is-movable');
    const step = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, 0.02], ArrowDown: [0, -0.02] }[e.key];
    if (!btn || !step || mode !== 'desk') return;
    e.preventDefault();
    const c = cards.find((k) => k.data.id === btn.dataset.id);
    desk.move(c.data.id, c.data.u + step[0], c.data.v + step[1]);
    showDesk(c.data.id);
  }

  /* ------------------------------------------------- switching board and desk */

  function setMode(next) {
    mode = next;
    el.querySelectorAll('.board-mode').forEach((m) => (m.hidden = m.dataset.mode !== next));
    $('[data-bind="about"]').textContent =
      next === 'desk'
        ? 'The desk under the board. Visitors leave notes here as cards; open one to read it. You can write a note or just say you were here.'
        : 'What I am listening to, watching, playing and reading right now. Each note is a button; open one to read it.';
    if (next === 'desk') {
      api.setView('desk');
      showDesk();
    } else {
      api.setView('wall');
      api.showBoard([...tabEls, ...noteEls], 'board');
      filter('all');
    }
    el.querySelector(`.board-mode[data-mode="${next}"] .board-go`).focus({ preventScroll: true });
  }

  /* --------------------------------------------------- a note brought forward */

  let openFrom = null;

  function bringForward(colour, tilt, html) {
    card.style.setProperty('--note', colour);
    card.innerHTML = html;
    scrim.hidden = false;
    card.hidden = false;
    // It comes forward from where it lies: start at its place and size, then grow.
    if (!reduceMotion() && openFrom) {
      const from = openFrom.getBoundingClientRect();
      const to = card.getBoundingClientRect();
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      card.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width}) rotate(${tilt}rad)`, opacity: 0.6 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 320, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
      );
    }
    (card.querySelector('[data-first]') ?? card.querySelector('[data-act="close"]')).focus({ preventScroll: true });
  }

  function openPin(i) {
    const n = notes[i];
    const p = n.pin;
    openFrom = noteButtons[i];
    bringForward(
      n.colour,
      n.tilt,
      `
      <p class="note-card-cat">${esc(categories[p.category] ?? 'Note')}</p>
      <h2 id="note-card-title">${esc(p.title)}</h2>
      ${p.creator ? `<p class="note-card-by">${esc(p.creator)}</p>` : ''}
      ${p.note ? `<p class="note-card-note">${esc(p.note)}</p>` : ''}
      <p class="note-card-date">Pinned ${esc(dateWords(p.pinned))}</p>
      <div class="note-card-actions">
        ${p.link ? `<a class="btn btn-secondary" href="${esc(p.link)}" target="_blank" rel="noopener">Open link</a>` : ''}
        <button class="btn btn-secondary" type="button" data-act="close">Put it back</button>
      </div>`,
    );
  }

  // A card from the desk, with the others in its stack a click away.
  function openCard(id) {
    const c = cards.find((k) => k.data.id === id);
    if (!c) return;
    const stack = stackOf(c);
    const at = stack.indexOf(c);
    const d = c.data;
    openFrom = c.el.querySelector('.desk-card');
    bringForward(
      '#fbf7ef',
      d.turn ?? 0,
      `
      <p class="note-card-cat">A note on the desk</p>
      <h2 id="note-card-title" class="note-card-text">${esc(d.text)}</h2>
      <p class="note-card-by">${esc(who(d))}</p>
      <div class="note-card-actions">
        ${
          stack.length > 1
            ? `<button class="btn btn-secondary" type="button" data-act="card" data-id="${esc(stack[(at + stack.length - 1) % stack.length].data.id)}" aria-label="The card below">${ICON.left}</button>
               <span class="note-card-count">${at + 1} of ${stack.length} in this stack</span>
               <button class="btn btn-secondary" type="button" data-act="card" data-id="${esc(stack[(at + 1) % stack.length].data.id)}" aria-label="The card above">${ICON.right}</button>`
            : ''
        }
        <button class="btn btn-secondary" type="button" data-act="close">Put it back</button>
      </div>`,
    );
  }

  // Writing a note: a blank card from the pad.
  function openWrite() {
    openFrom = null;
    bringForward(
      '#fbf7ef',
      0,
      `
      <h2 id="note-card-title">Leave a note</h2>
      <form class="desk-form" novalidate>
        <label for="desk-text">Your note</label>
        <textarea id="desk-text" maxlength="${LIMITS.text}" rows="4" data-first placeholder="${esc(DEFAULT_NOTE)}"></textarea>
        <p class="desk-count" aria-live="polite"><span data-bind="left">${LIMITS.text}</span> characters left</p>
        <label for="desk-name">Sign it <span class="desk-optional">(optional: a name or initials)</span></label>
        <input id="desk-name" maxlength="${LIMITS.name}" autocomplete="nickname" />
        <p class="desk-privacy">For now your note stays in this browser. Only what you write here is kept.</p>
        <div class="note-card-actions">
          <button class="btn btn-primary" type="submit">Leave it on the desk</button>
          <button class="btn btn-secondary" type="button" data-act="close">Cancel</button>
        </div>
      </form>`,
    );
    const form = card.querySelector('.desk-form');
    const text = form.querySelector('#desk-text');
    const left = form.querySelector('[data-bind="left"]');
    text.addEventListener('input', () => (left.textContent = String(LIMITS.text - text.value.length)));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      leave({ text: text.value, name: form.querySelector('#desk-name').value });
    });
  }

  function leave(note) {
    const c = desk.add(note);
    close(false);
    showDesk(c.id);
    said.textContent = `Your note is on the desk. You can move it with the arrow keys.`;
  }

  function close(refocus = true) {
    if (card.hidden) return;
    card.hidden = true;
    scrim.hidden = true;
    if (refocus) openFrom?.focus({ preventScroll: true });
    openFrom = null;
  }

  /* ------------------------------------------------------------------ events */

  function onBoardClick(e) {
    const tab = e.target.closest('.board-tab');
    if (tab) return filter(tab.dataset.filter);
    const note = e.target.closest('.note');
    if (note && !note.classList.contains('is-dim')) openPin(Number(note.dataset.i));
  }
  for (const item of [...tabEls, ...noteEls]) item.el.addEventListener('click', onBoardClick);
  el.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (e.target === scrim || act?.dataset.act === 'close') return close();
    if (!act) return;
    if (act.dataset.act === 'desk') setMode('desk');
    if (act.dataset.act === 'board') setMode('board');
    if (act.dataset.act === 'write') openWrite();
    if (act.dataset.act === 'here') leave({ text: DEFAULT_NOTE });
    if (act.dataset.act === 'card') openCard(act.dataset.id);
  });
  // Esc puts an open note back first, then goes from the desk up to the board; only from the
  // board does it leave for the hall.
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    if (!card.hidden) close();
    else if (mode === 'desk') setMode('board');
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  // Keep focus inside the card while it is open.
  card.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = [...card.querySelectorAll('a, button, input, textarea')];
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
      window.addEventListener('keydown', onKey, true);
      setMode('board');
      $('#board-title').focus({ preventScroll: true });
    },
    destroy() {
      window.removeEventListener('keydown', onKey, true);
      el.ownerDocument.removeEventListener('pointermove', onMove);
      el.ownerDocument.removeEventListener('pointerup', onUp);
      el.ownerDocument.removeEventListener('keydown', onCardKey);
      api.hideBoard();
    },
  };
}
