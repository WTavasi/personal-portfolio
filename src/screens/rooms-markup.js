// Every room page's markup as a pure function of the site's content, with no browser APIs. The app
// renders it at runtime, and the build writes each page as its own HTML file (vite.config.js), so
// every room can be read, shared and indexed without JavaScript. Pages follow one template
// (design document, section 11): plain title, lead, content, next track, footer.
import { person, contact, leadership, projects, music, services, credits } from '../content.js';
import pinsFile from '../content/pins.json' with { type: 'json' };
import deskFile from '../content/desk.json' with { type: 'json' };
import { LIMITS, DEFAULT_NOTE } from '../lib/desk.js';
import { esc } from './resume-markup.js';
import { pathFor } from '../lib/router.js';
import { roomNav, caseNav, pageFoot } from './room-nav.js';

const ext = (href, label) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`;
const list = (items) => `<ul>${items.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`;
const dateWords = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// The arrows between rooms, then the title and the lead.
function head(key, title, lead = '') {
  return `
    ${roomNav(key)}
    <header class="room-head">
      <h1 tabindex="-1">${esc(title)}</h1>
      ${lead ? `<p class="doc-lead">${esc(lead)}</p>` : ''}
    </header>`;
}

// The end of every room: the footer (the arrows are at the top).
const foot = () => footer();

const footer = pageFoot;

const entry = (e) => `
  <article class="entry">
    <h3>${esc(e.role)}, ${esc(e.org)}</h3>
    <p class="when">${esc(e.when)}</p>
    ${list(e.bullets)}
  </article>`;

const definitions = (pairs, cls = 'skills') => `<dl class="${cls}">${pairs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

/* ------------------------------------------------------------------ 01 The Booth */

function work() {
  return `
    ${head('work', 'Work', 'Cloud, back-end and mobile projects, strongest first. Each case study links to its code.')}
    <ol class="cases">
      ${projects
        .map(
          (p) => `
        <li class="case">
          <h2><a href="${pathFor('project', p.slug)}">${esc(p.name)}</a></h2>
          <p>${esc(p.oneLine)}</p>
          <p class="when">${esc(p.stack)} · ${esc(p.year)}</p>
        </li>`,
        )
        .join('')}
    </ol>
    ${foot('work')}`;
}

function project(slug) {
  const i = projects.findIndex((p) => p.slug === slug);
  const p = projects[i];
  const prev = projects[i - 1];
  const next = projects[i + 1];
  const credits = [
    p.role && ['Role', esc(p.role)],
    ['Stack', esc(p.stack)],
    ['Year', esc(p.year)],
    p.href && ['Code', ext(p.href, p.href.replace('https://', ''))],
  ].filter(Boolean);
  return `
    ${caseNav(prev, next)}
    <header class="room-head">
      <h1 tabindex="-1">${esc(p.name)}</h1>
      <p class="doc-lead">${esc(p.oneLine)}</p>
    </header>
    ${definitions(credits, 'skills credits')}
    <section aria-labelledby="h-built"><h2 id="h-built">What I built</h2>${list(p.bullets)}</section>
    ${p.results ? `<section aria-labelledby="h-results"><h2 id="h-results">Results</h2>${list(p.results)}</section>` : ''}
    ${footer()}`;
}

/* ------------------------------------------------------------------ 02 The Studio */

function studio() {
  const [orchestras, mentoring, band, choirs] = leadership;
  return `
    ${head('music', 'Music', 'Principal clarinet, conductor, choral singer, mentor and arranger.')}
    <section aria-labelledby="h-orch"><h2 id="h-orch">Orchestral playing</h2>${entry(orchestras)}</section>
    <section aria-labelledby="h-cond">
      <h2 id="h-cond">Conducting</h2>
      ${entry(band)}
      <p class="entry-link">${ext(music.conductingVideo.href, music.conductingVideo.label)}</p>
      <p class="entry-link">${ext(music.bandPage.href, music.bandPage.label)}</p>
    </section>
    <section aria-labelledby="h-choir"><h2 id="h-choir">Choral singing</h2>${entry(choirs)}</section>
    <section aria-labelledby="h-chamber"><h2 id="h-chamber">Chamber and solo</h2><p>${esc(music.chamber)}</p></section>
    <section aria-labelledby="h-teach"><h2 id="h-teach">Teaching</h2>${entry(mentoring)}</section>
    <section aria-labelledby="h-rep">
      <h2 id="h-rep">Repertoire</h2>
      <h3 class="sub-h">Classical</h3>${list(music.repertoire.classical)}
      <h3 class="sub-h">Contemporary, film and stage</h3>${list(music.repertoire.contemporary)}
    </section>
    ${foot('music')}`;
}

/* ------------------------------------------------------------------ 03 Box Office */

function boxOffice() {
  const quote = `mailto:${contact.email}?subject=${encodeURIComponent('Quote request')}`;
  const offers = (items, proofHref, proofLabel) => `
    ${definitions(items.map(([k, v]) => [k, esc(v)]), 'skills offers')}
    <p class="entry-link"><a href="${proofHref}">${esc(proofLabel)}</a></p>`;
  return `
    ${head('services', 'Services')}
    <p class="doc-avail">${esc(person.availability)} Alongside that, I take on the freelance work and commissions below.</p>
    <section aria-labelledby="h-eng"><h2 id="h-eng">Engineering</h2>${offers(services.engineering, pathFor('work'), 'See the engineering work')}</section>
    <section aria-labelledby="h-mus"><h2 id="h-mus">Music</h2>${offers(services.music, pathFor('music'), 'See the music')}</section>
    <section aria-labelledby="h-how">
      <h2 id="h-how">How we work</h2>
      <ol class="steps">${services.process.map(([k, v]) => `<li><strong>${esc(k)}.</strong> ${esc(v)}</li>`).join('')}</ol>
      <p class="interests">${esc(services.international)}</p>
    </section>
    <section aria-labelledby="h-quote" class="quote">
      <h2 id="h-quote">Get a quote</h2>
      <p>Tell me what you need and by when. Prices are by quote only.</p>
      <p><a class="btn btn-primary room-btn" href="${quote}">Email for a quote</a></p>
      <p class="mail-note">Opens your email app, addressed to ${esc(contact.email)}.</p>
    </section>
    ${foot('services', { primaryNext: false })}`;
}

/* ------------------------------------------------------------------ 05 The Notice Board */

// A note on the desk, as the plain page lists it.
export const deskNote = (c) => `
  <li class="desk-note">
    <p class="desk-note-text">${esc(c.text)}</p>
    <p class="desk-note-by">${esc(c.name || 'Someone')}</p>
  </li>`;

function noticeBoard() {
  const { categories, pins } = pinsFile;
  const ordered = [...pins].sort((a, b) => Number(!!b.feature) - Number(!!a.feature));
  return `
    ${head('wall', 'Notice board', 'What I am listening to, watching, playing and reading right now.')}
    <div class="pin-filters" role="group" aria-label="Show">
      <button class="btn btn-secondary pin-filter" type="button" data-filter="all" aria-pressed="true">All</button>
      ${Object.entries(categories)
        .map(([k, v]) => `<button class="btn btn-secondary pin-filter" type="button" data-filter="${esc(k)}" aria-pressed="false">${esc(v)}</button>`)
        .join('')}
    </div>
    <ul class="pins">
      ${ordered
        .map(
          (p) => `
        <li class="pin${p.feature ? ' pin-feature' : ''}" data-category="${esc(p.category)}">
          <h2>${p.link ? ext(p.link, p.title) : esc(p.title)}</h2>
          <p class="pin-meta">${esc(categories[p.category])}${p.creator ? ` · ${esc(p.creator)}` : ''}</p>
          ${p.note ? `<p>${esc(p.note)}</p>` : ''}
          <p class="pin-date">Pinned ${esc(dateWords(p.pinned))}</p>
        </li>`,
        )
        .join('')}
    </ul>
    <section class="desk-plain" aria-labelledby="h-desk">
      <h2 id="h-desk">The desk</h2>
      <p>Leave a note, or just say you were here.</p>
      <ul class="desk-notes" data-bind="desk-notes">
        ${deskFile.cards.map((c) => deskNote(c)).join('')}
      </ul>
      <form class="desk-form" data-bind="desk-form" novalidate>
        <label for="desk-text">Your note</label>
        <textarea id="desk-text" maxlength="${LIMITS.text}" rows="4" placeholder="${esc(DEFAULT_NOTE)}"></textarea>
        <label for="desk-name">Sign it <span class="desk-optional">(optional: a name or initials)</span></label>
        <input id="desk-name" maxlength="${LIMITS.name}" autocomplete="nickname" />
        <p class="desk-privacy">For now your note stays in this browser. Only what you write here is kept.</p>
        <div class="desk-actions">
          <button class="btn btn-primary" type="submit">Leave it on the desk</button>
          <button class="btn btn-secondary" type="button" data-act="here">Just say “${esc(DEFAULT_NOTE)}”</button>
        </div>
        <p class="sr-only" role="status" data-bind="desk-said"></p>
      </form>
    </section>
    ${foot('wall')}`;
}

/* ------------------------------------------------------------------ Privacy */

function privacy() {
  return `
    ${head('privacy', 'Privacy and credits')}
    <p class="doc-lead">This site sets no cookies, runs no analytics and loads nothing from other companies.</p>
    <section aria-labelledby="h-stored">
      <h2 id="h-stored">What is stored, and where</h2>
      <p>Your sound setting and volume are saved in your own browser, so the site remembers them next time. They never leave your device. Clearing this site’s data in your browser removes them.</p>
      <p>A note you leave on the desk by the notice board (the words and the name you sign with, nothing else) is also saved in your browser only, for now. Before notes start being sent anywhere, this page will say where they go, who sees them and how to have one removed.</p>
    </section>
    <section aria-labelledby="h-not">
      <h2 id="h-not">What is not collected</h2>
      <p>No names, email addresses, IP addresses or browsing history. Links to other sites, such as GitHub, LinkedIn, YouTube or Instagram, open those sites, whose own privacy policies then apply.</p>
    </section>
    <section aria-labelledby="h-changes">
      <h2 id="h-changes">Changes</h2>
      <p>Before any feature that stores data goes live, such as notes on the notice board, this page will say exactly what is kept, why and for how long. Questions: ${esc(contact.email)}.</p>
      <p class="when">Last updated 24 November 2026.</p>
    </section>
    <section aria-labelledby="h-credits">
      <h2 id="h-credits">Credits</h2>
      ${list(credits)}
    </section>
    ${footer()}`;
}

/* ------------------------------------------------------------------ registry */

// Each room's title, and the one-sentence description search engines and link previews show.
const ROOMS = {
  work: { title: () => 'Work', about: () => `Cloud, back-end and mobile projects by ${person.name}, strongest first. Each case study links to its code.`, markup: work },
  project: {
    title: (slug) => projects.find((p) => p.slug === slug)?.name ?? 'Work',
    about: (slug) => projects.find((p) => p.slug === slug)?.oneLine ?? '',
    markup: project,
  },
  music: { title: () => 'Music', about: () => `${person.name} in music: principal clarinet, conductor, choral singer, mentor and arranger.`, markup: studio },
  services: {
    title: () => 'Services',
    about: () => `Freelance work and commissions from ${person.name}: websites, cloud set-up, mobile apps, system design reviews, arrangement and composition.`,
    markup: boxOffice,
  },
  wall: { title: () => 'Notice board', about: () => `What ${person.name} is listening to, watching, playing and reading right now.`, markup: noticeBoard },
  privacy: { title: () => 'Privacy and credits', about: () => 'This site sets no cookies, runs no analytics and loads nothing from other companies.', markup: privacy },
};

export const roomTitle = (key, param) => `${ROOMS[key].title(param)} | ${person.name}`;
export const roomAbout = (key, param) => ROOMS[key].about(param);
export const roomMarkup = (key, param) => `<main class="doc room-doc">${ROOMS[key].markup(param)}</main>`;

// Every room address, for the build to write as its own HTML file.
export const roomPages = () => [
  ...Object.keys(ROOMS)
    .filter((k) => k !== 'project')
    .map((key) => ({ key, path: pathFor(key) })),
  ...projects.map((p) => ({ key: 'project', param: p.slug, path: pathFor('project', p.slug) })),
];
