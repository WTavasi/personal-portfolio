import { person, contact, experience, projects, skills, education, certifications, honors, interests, credits } from '../content.js';
import { pdfLink, resumePdf } from '../lib/pdf.js';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ext = (href, label) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`;

const list = (items) => `<ul>${items.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`;

// The résumé is the recruiter view: plain HTML you can read, search, print and link to
// directly at /#/resume. It does not depend on the 3D hall or on playing anything.
export function resumeScreen({ go, world }) {
  const el = document.createElement('div');
  el.className = 'screen resume';

  const contactLinks = [
    contact.email && `<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>`,
    contact.github && ext(contact.github, 'GitHub'),
    contact.linkedin && ext(contact.linkedin, 'LinkedIn'),
  ].filter(Boolean);

  el.innerHTML = `
    <nav class="p-bar" aria-label="Résumé">
      <button class="btn btn-secondary" data-act="home">Back to the hall</button>
      ${pdfLink()}
      <button class="btn btn-secondary" data-act="print">Print</button>
    </nav>

    <main class="doc">
      <header class="doc-head">
        <h1>${esc(person.name)}</h1>
        <p class="doc-full">${esc(person.headline)} · ${esc(person.location)}</p>
        <p class="doc-lead">${esc(person.description)}</p>
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

      <footer class="doc-foot">
        <p>This site sets no cookies and has no analytics. It saves your sound settings on your own device only.</p>
        ${credits.map((c) => `<p>${esc(c)}</p>`).join('')}
      </footer>
    </main>
  `;

  el.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'home') go('hall');
    // Print the one-page PDF when there is one (the browser's PDF viewer prints it as designed);
    // otherwise print this page, which has its own print styles.
    if (act === 'print') resumePdf ? window.open(resumePdf, '_blank', 'noopener') : window.print();
  });

  return {
    el,
    title: `${person.name} | Résumé`,
    mount() {
      world.hide?.();
      window.scrollTo(0, 0);
      el.querySelector('h1').setAttribute('tabindex', '-1');
    },
    destroy() {},
  };
}
