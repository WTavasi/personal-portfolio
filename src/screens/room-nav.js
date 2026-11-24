// The arrows between rooms, shown at the top of every room (over the hall and as a page): the
// previous room, back to the hall, the next room. Each arrow says where it goes. The keyboard's
// left and right arrows do the same (main.js). The notice board is not in the loop: it only has
// the way back to the hall. Pure, so the build can write it into every page.
import { neighbours, pathFor } from '../lib/router.js';
import { esc } from './resume-markup.js';

const svg = (d) => `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const ICON = {
  left: svg('M12.5 4.5 7 10l5.5 5.5'),
  right: svg('M7.5 4.5 13 10l-5.5 5.5'),
  hall: svg('M3.5 9.5 10 4l6.5 5.5M5.5 8v7.5h9V8'),
};

const arrow = (dir, href, label, hint, rel = '') =>
  `<a class="nav-arrow nav-${dir}" href="${href}"${rel ? ` rel="${rel}"` : ''}>${dir === 'next' ? '' : ICON[dir === 'prev' ? 'left' : 'hall']}<span class="nav-text"><span class="nav-hint">${esc(hint)}</span> ${esc(label)}</span>${dir === 'next' ? ICON.right : ''}</a>`;

// Back to the hall: "Back to the hall" where there is room, "Hall" on phones.
const hall = () =>
  `<a class="nav-arrow nav-hall" href="${pathFor('home')}">${ICON.hall}<span class="nav-text"><span class="nav-long">Back to the hall</span><span class="nav-short" aria-hidden="true">Hall</span></span></a>`;

export function roomNav(key) {
  const n = neighbours(key);
  return `
    <nav class="room-nav" aria-label="Rooms">
      ${n ? arrow('prev', pathFor(n.prev.key), n.prev.label, 'Previous:', 'prev') : '<span></span>'}
      ${hall()}
      ${n ? arrow('next', pathFor(n.next.key), n.next.label, 'Next:', 'next') : '<span></span>'}
    </nav>`;
}

// For a case study: all the work, the hall, and the next case study (or on to Music after the last).
export function caseNav(prev, next) {
  return `
    <nav class="room-nav" aria-label="Case studies">
      ${prev ? arrow('prev', pathFor('project', prev.slug), prev.name, 'Previous:', 'prev') : arrow('prev', pathFor('work'), 'Work', 'All of')}
      ${hall()}
      ${next ? arrow('next', pathFor('project', next.slug), next.name, 'Next:', 'next') : arrow('next', pathFor('music'), 'Music', 'Next:', 'next')}
    </nav>`;
}
