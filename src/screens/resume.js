import { person, contact } from '../content.js';
import { aboutMarkup } from './resume-markup.js';
import { pathFor } from '../lib/router.js';

function mailtoFor(to) {
  const site = new URL(pathFor('home'), window.location.origin).href;
  const resumeUrl = new URL(pathFor('resume'), window.location.origin).href;
  const lines = [
    'Hello,',
    '',
    `Here is the résumé of ${person.name}, a cloud, DevOps and software engineer based in ${person.location}.`,
    person.availability,
    '',
    `Résumé (web): ${resumeUrl}`,
    `Interactive portfolio: ${site}`,
    '',
    `Contact: ${[contact.email, contact.linkedin].filter(Boolean).join(' | ')}`,
  ].filter((l) => l !== null);
  const q = (v) => encodeURIComponent(v);
  return `mailto:${q(to)}?subject=${q(`Résumé: ${person.name}, cloud, DevOps and software engineer`)}&body=${q(lines.join('\n'))}`;
}

// About me, with the full résumé: plain HTML you can read, search, print and link to directly. It
// does not depend on the 3D hall or on playing anything. Opened as /resume (the top bar's Résumé
// button), it starts at the résumé part.
export function aboutScreen({ world, over = false, jump = false }) {
  const el = document.createElement('div');
  el.className = 'screen resume';

  el.innerHTML = aboutMarkup();

  const form = el.querySelector('.mail-form');
  const mailBtn = el.querySelector('[data-act="mail"]');
  const toInput = el.querySelector('#mail-to');

  el.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'mail') {
      form.hidden = !form.hidden;
      mailBtn.setAttribute('aria-expanded', String(!form.hidden));
      if (!form.hidden) toInput.focus();
    }
    // There is deliberately no PDF on the site (it would publish contact details to anyone);
    // printing uses this page's own print styles.
    if (act === 'print') window.print();
  });

  const note = el.querySelector('[data-bind="mail-note"]');
  const NOTE = note.textContent;
  toInput.addEventListener('input', () => {
    toInput.removeAttribute('aria-invalid');
    note.textContent = NOTE;
  });

  // A mailto: link written in the browser. The visitor's own mail app sends it, so nothing
  // leaves this page and no address is kept. Mail apps cannot take attachments this way, so the
  // message links to the web résumé instead.
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const to = toInput.value.trim();
    if (!toInput.checkValidity() || !to) {
      toInput.setAttribute('aria-invalid', 'true');
      note.textContent = 'Please enter an email address, like name@company.com.';
      return toInput.focus();
    }
    toInput.removeAttribute('aria-invalid');
    window.location.href = mailtoFor(to);
  });

  return {
    el,
    title: jump ? `Résumé | ${person.name}` : `About me | ${person.name}`,
    surface: 'paper',
    mount() {
      if (!over) world.hide?.();
      window.scrollTo(0, 0);
      if (jump) {
        // Once the page has finished turning in (its animation moves it), go to the résumé.
        const part = el.querySelector('#resume');
        const go = () => {
          part.scrollIntoView({ block: 'start' });
          part.focus({ preventScroll: true });
        };
        const moving = el.getAnimations?.({ subtree: true }) ?? [];
        if (moving.length) Promise.all(moving.map((a) => a.finished.catch(() => {}))).then(go);
        else go();
      }
    },
    destroy() {},
  };
}
