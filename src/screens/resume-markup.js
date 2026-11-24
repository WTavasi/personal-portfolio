// About me: a short introduction, then the full résumé (design document: About and Résumé are one
// room, at the podium). Its markup is a pure function of the site's content, with no browser APIs:
// the page uses it at runtime, and the build uses the same function to write /about and /resume,
// so it can be read, printed and indexed even before (or without) JavaScript. Printing prints the
// résumé part only. Instead of repeating other rooms, it links to them.
import { person, contact, experience, leadership, projects, skills, education, certifications, honors, interests } from '../content.js';
import { pathFor } from '../lib/router.js';
import { roomNav, pageFoot } from './room-nav.js';

export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ext = (href, label) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`;

const list = (items) => `<ul>${items.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`;

const see = (key, label) => `<p class="see-also"><a href="${pathFor(key)}">${esc(label)} <span aria-hidden="true">→</span></a></p>`;

// The résumé itself: on the page under About me, and on its own when printed (shell.js). On screen
// it is headed "Résumé" (the page has already said who and what); printed, it opens with the name.
export function resumePart() {
  const contactLinks = [
    contact.email && `<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>`,
    contact.github && ext(contact.github, 'GitHub'),
    contact.linkedin && ext(contact.linkedin, 'LinkedIn'),
  ].filter(Boolean);
  return `
      <section class="resume-part" id="resume" aria-label="Résumé" tabindex="-1">
      <header class="doc-head">
        <h2 class="resume-name"><span class="screen-only">Résumé</span><span class="print-only">${esc(person.name)}</span></h2>
        <p class="doc-full print-only">${esc(person.headline)} · ${esc(person.location)}</p>
        <p class="doc-avail">${esc(person.availability)}</p>
        <p class="doc-links">${contactLinks.join('')}</p>
      </header>

      <section aria-labelledby="h-exp">
        <h2 id="h-exp">Experience</h2>
        ${experience
          .map(
            (e) => `
          <article class="entry">
            <h3>${esc(e.role)}, ${esc(e.org)}</h3>
            <p class="when">${esc(e.when)}</p>
            ${list(e.bullets)}
          </article>`,
          )
          .join('')}
      </section>

      <section aria-labelledby="h-lead">
        <h2 id="h-lead">Leadership, music and community</h2>
        ${leadership
          .map(
            (e) => `
          <article class="entry">
            <h3>${esc(e.role)}, ${esc(e.org)}</h3>
            <p class="when">${esc(e.when)}</p>
            ${list(e.bullets)}
          </article>`,
          )
          .join('')}
        ${see('music', 'Hear the music, and the conducting video, in Music')}
      </section>

      <section aria-labelledby="h-proj">
        <h2 id="h-proj">Projects</h2>
        ${projects
          .map(
            (p) => `
          <article class="entry">
            <h3>${esc(p.name)}</h3>
            <p class="when">${esc(p.stack)} · ${esc(p.year)}</p>
            ${list(p.bullets)}
            ${p.href ? `<p class="entry-link">${ext(p.href, p.href.replace('https://', ''))}</p>` : ''}
          </article>`,
          )
          .join('')}
      </section>

      <section aria-labelledby="h-skills">
        <h2 id="h-skills">Skills</h2>
        <dl class="skills">
          ${skills.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
        </dl>
      </section>

      <section aria-labelledby="h-edu">
        <h2 id="h-edu">Education and certifications</h2>
        ${education
          .map(
            (e) => `
          <article class="entry">
            <h3>${esc(e.title)}</h3>
            <p class="when">${esc(e.when)}</p>
            ${
              e.coursework
                ? `<dl class="skills coursework">${e.coursework
                    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
                    .join('')}</dl>`
                : ''
            }
          </article>`,
          )
          .join('')}
        <h3 class="sub-h">Certifications and training</h3>
        ${list(certifications)}
      </section>

      <section aria-labelledby="h-honors">
        <h2 id="h-honors">Honors and interests</h2>
        ${list(honors)}
        <p class="interests">${esc(interests)}</p>
      </section>

      </section>

`;
}

export function aboutMarkup() {
  return `
    <main class="doc room-doc">
      ${roomNav('about')}
      <header class="doc-head about-head">
        <h1 tabindex="-1">About me</h1>
        <p class="doc-lead">${esc(person.description)}</p>
        <ul class="about-links">
          <li><a href="${pathFor('work')}">See my work <span aria-hidden="true">→</span></a></li>
          <li><a href="${pathFor('music')}">Hear the music <span aria-hidden="true">→</span></a></li>
          <li><a href="${pathFor('services')}">Services and quotes <span aria-hidden="true">→</span></a></li>
        </ul>
      </header>
      ${resumePart()}
      ${pageFoot()}
    </main>
  `;
}
