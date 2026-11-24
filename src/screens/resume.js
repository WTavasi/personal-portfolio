import { person } from '../content.js';
import { aboutMarkup } from './resume-markup.js';

// About me, with the full résumé: plain HTML you can read, search and link to directly. It does
// not depend on the 3D hall or on playing anything. Opened as /resume, it starts at the résumé.
// (Printing and emailing the résumé are in the top bar's Résumé menu, shell.js.)
export function aboutScreen({ world, over = false, jump = false }) {
  const el = document.createElement('div');
  el.className = 'screen room';
  el.innerHTML = aboutMarkup();

  return {
    el,
    title: jump ? `Résumé | ${person.name}` : `About me | ${person.name}`,
    surface: 'paper',
    mount() {
      if (!over) world.hide?.();
      window.scrollTo(0, 0);
      if (!jump) return void el.querySelector('h1')?.focus({ preventScroll: true });
      // Once the page has finished turning in (its animation moves it), go to the résumé.
      const part = el.querySelector('#resume');
      const go = () => {
        part.scrollIntoView({ block: 'start' });
        part.focus({ preventScroll: true });
      };
      const moving = el.getAnimations?.({ subtree: true }) ?? [];
      if (moving.length) Promise.all(moving.map((a) => a.finished.catch(() => {}))).then(go);
      else go();
    },
    destroy() {},
  };
}
