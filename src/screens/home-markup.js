// The first screen (design document, section 6): who, what and the two ways forward, readable at
// once over a still of the hall, before any 3D or audio has loaded. Pure, so the build can write
// it into index.html (vite.config.js) and the first paint needs no JavaScript.
import { person } from '../content.js';
import { pathFor } from '../lib/router.js';
import { esc } from './resume-markup.js';

const BASE = import.meta.env?.BASE_URL ?? process.env.BASE_PATH ?? '/';

// The still image of the hall that sits behind the first screen until the real hall is lit.
export const stillMarkup = () =>
  `<img class="hall-still" src="${BASE}hall-still-1600.webp" srcset="${BASE}hall-still-960.webp 960w, ${BASE}hall-still-1600.webp 1600w" sizes="100vw" width="1600" height="1000" alt="" fetchpriority="high" decoding="async" />`;

export const homeMarkup = () => `
  <div class="home-hero">
    <h1><span class="sr-only">${esc(person.name)}: </span>${esc(person.headline)}.</h1>
    <p class="home-sub">Principal clarinet, conductor and arranger. Based in ${esc(person.location)}.</p>
    <p class="home-avail">${esc(person.availability)}</p>
    <div class="home-actions">
      <a class="btn btn-primary home-btn" href="${pathFor('work')}">See my work</a>
      <a class="btn btn-secondary home-btn" href="${pathFor('services')}">Work with me</a>
    </div>
    <div class="home-hall" data-bind="hall" hidden>
      <button class="btn btn-secondary home-btn" type="button" data-act="turn-on">Turn on the hall</button>
      <p class="home-note" data-bind="hall-status" aria-live="polite">Opens the 3D concert hall, with sound.</p>
    </div>
  </div>
`;
