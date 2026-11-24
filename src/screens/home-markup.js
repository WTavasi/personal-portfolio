// The first screen (design document, section 6): a welcome, what Wyclef does and the three ways
// forward, Enter the hall the main one, in the middle. Readable at once, before any 3D or audio
// has loaded. Pure, so the build can write it into index.html (vite.config.js) and the first
// paint needs no JavaScript (without it, Enter the hall stays hidden: it needs the 3D).
import { person } from '../content.js';
import { pathFor } from '../lib/router.js';
import { esc } from './resume-markup.js';

const BASE = import.meta.env?.BASE_URL ?? process.env.BASE_PATH ?? '/';

// The still image of the hall that sits behind the first screen until the real hall is lit.
export const stillMarkup = () =>
  `<img class="hall-still" src="${BASE}hall-still-1600.webp" srcset="${BASE}hall-still-960.webp 960w, ${BASE}hall-still-1600.webp 1600w" sizes="100vw" width="1600" height="1000" alt="" fetchpriority="high" decoding="async" />`;

export const homeMarkup = () => `
  <div class="home-hero">
    <h1>Welcome to the portfolio of ${esc(person.name)}.</h1>
    <p class="home-sub">${esc(person.headline)}</p>
    <div class="home-actions">
      <a class="btn btn-secondary home-btn" href="${pathFor('work')}">See my work</a>
      <button class="btn btn-primary home-btn home-enter" type="button" data-act="turn-on" data-bind="hall" hidden>Enter the hall</button>
      <a class="btn btn-secondary home-btn" href="${pathFor('services')}">Work with me</a>
    </div>
    <p class="home-note" data-bind="hall-status" aria-live="polite" hidden>Opens the 3D concert hall, with sound.</p>
  </div>
`;
