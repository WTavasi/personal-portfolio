// Visitors' notes on the desk (design document, section 13).
//
// For now, until the guestbook has a server, a note is kept in this browser only: the visitor sees
// it on the desk, and nobody else does. Once there is a server, add() will send the note there and
// list() will also return everyone else's notes. Nothing here identifies the visitor: a note has only the
// name they choose to sign with.
//
// A visitor can move only their own notes, and only during the visit they wrote them in (a random
// code kept for the visit, in sessionStorage). Notes stack: the last one moved lies on top.
import deskFile from '../content/desk.json' with { type: 'json' };
import { DESK } from './board.js';

const KEY = 'wyclef.portfolio.desk.v1';
const SESSION_KEY = 'wyclef.portfolio.visit';
export const LIMITS = { name: 40, text: 280 };
export const DEFAULT_NOTE = 'I was here.';

const store = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false; // storage can be unavailable (private mode): the note lasts for this visit
    }
  },
};

const random = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function visitCode() {
  try {
    let code = sessionStorage.getItem(SESSION_KEY);
    if (!code) sessionStorage.setItem(SESSION_KEY, (code = random()));
    return code;
  } catch {
    return (visitCode.fallback ??= random());
  }
}

const clamp = (n, [a, b]) => Math.min(b, Math.max(a, n));
let memory = null; // the notes, if storage is unavailable

function mine() {
  return memory ?? store.get(KEY, []);
}
function save(list) {
  if (!store.set(KEY, list)) memory = list;
}

export const desk = {
  // Every note on the desk, bottom to top: Wyclef's, then the visitor's own (in the order last
  // moved). Each has { id, name, text, u, v, turn, order, own, movable }.
  list() {
    const visit = visitCode();
    const fixed = deskFile.cards.map((c, i) => ({ id: `wyclef-${i}`, ...c, order: i, own: false, movable: false }));
    const own = mine().map((c) => ({ ...c, own: true, movable: c.visit === visit }));
    return [...fixed, ...own.sort((a, b) => a.order - b.order)];
  },

  // Leave a note. Returns it, or null if there is nothing to leave.
  add({ name = '', text = '' }) {
    const note = String(text).trim().slice(0, LIMITS.text) || DEFAULT_NOTE;
    const list = mine();
    const top = Math.max(deskFile.cards.length, ...list.map((c) => c.order + 1));
    const { u, v } = DESK.area;
    const card = {
      id: random(),
      name: String(name).trim().slice(0, LIMITS.name),
      text: note,
      // Near the pad, a little askew.
      u: clamp(u[1] - 0.12 + (Math.random() - 0.5) * 0.12, u),
      v: clamp((Math.random() - 0.5) * 0.24, v),
      turn: (Math.random() - 0.5) * 0.3,
      order: top,
      at: new Date().toISOString(),
      visit: visitCode(),
    };
    save([...list, card]);
    return { ...card, own: true, movable: true };
  },

  // Move one of the visitor's own notes (this visit's only) and put it on top of the stack.
  move(id, u, v) {
    const list = mine();
    const card = list.find((c) => c.id === id);
    if (!card || card.visit !== visitCode()) return false;
    card.u = clamp(u, DESK.area.u);
    card.v = clamp(v, DESK.area.v);
    card.order = Math.max(deskFile.cards.length, ...list.map((c) => c.order + 1));
    save(list);
    return true;
  },
};
