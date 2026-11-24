// A room page (Work, a case study, Music, Services, About, the Notice Board, Privacy): score paper,
// rendered from the same markup the build writes as static HTML.
import { roomMarkup, roomTitle, deskNote } from './rooms-markup.js';
import { desk } from '../lib/desk.js';

export function roomScreen({ world, key, param, over = false }) {
  const el = document.createElement('div');
  el.className = 'screen room';
  el.innerHTML = roomMarkup(key, param);

  // Notice board filters: show one category, or all.
  el.addEventListener('click', (e) => {
    const chosen = e.target.closest('[data-filter]');
    if (!chosen) return;
    const want = chosen.dataset.filter;
    el.querySelectorAll('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b === chosen)));
    el.querySelectorAll('.pin').forEach((p) => {
      p.hidden = want !== 'all' && p.dataset.category !== want;
    });
  });

  // The desk, on the plain notice board page (phones, direct links): the notes as a list, and a
  // form to leave one. The same notes as the desk in the hall.
  const notes = el.querySelector('[data-bind="desk-notes"]');
  const form = el.querySelector('[data-bind="desk-form"]');
  if (notes && form) {
    const render = () => (notes.innerHTML = desk.list().map(deskNote).join(''));
    const leave = (note) => {
      desk.add(note);
      form.reset();
      render();
      form.querySelector('[data-bind="desk-said"]').textContent = 'Your note is on the desk.';
    };
    render();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      leave({ text: form.querySelector('#desk-text').value, name: form.querySelector('#desk-name').value });
    });
    form.querySelector('[data-act="here"]').addEventListener('click', () => leave({}));
  }

  return {
    el,
    title: roomTitle(key, param),
    surface: 'paper',
    mount() {
      if (!over) world.hide?.();
      window.scrollTo(0, 0);
      // Move focus to the new page's heading, so keyboard and screen reader users start there.
      el.querySelector('h1')?.focus({ preventScroll: true });
    },
    destroy() {},
  };
}
