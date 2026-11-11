import { person, contact, experience, projects, skills, education, music, credits } from '../content.js';

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
    contact.resumeUrl && ext(contact.resumeUrl, 'Résumé (PDF)'),
  ].filter(Boolean);

  el.innerHTML = `
    <nav class="p-bar" aria-label="Résumé">
      <button class="btn btn-secondary" data-act="home">Enter the hall</button>
      <button class="btn btn-secondary" data-act="print">Print</button>
    </nav>

    <main class="doc">
      <header class="doc-head">
        <h1>${esc(person.name)}</h1>
        <p class="doc-full">${esc(person.fullName)}</p>
        <p class="doc-lead">${esc(person.description)}</p>
        <p class="doc-music">${esc(person.musicLine)}</p>
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
            <p>${esc(p.detail)}</p>
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
        <h2 id="h-edu">Education and certification</h2>
        ${education
          .map((e) => `<article class="entry"><h3>${esc(e.title)}</h3><p class="when">${esc(e.when)}</p></article>`)
          .join('')}
      </section>

      <section aria-labelledby="h-music">
        <h2 id="h-music">Music and leadership</h2>
        ${list(music.bullets)}
        <h3 class="sub-h">Honors</h3>
        ${list(music.honors)}
      </section>

      <footer class="doc-foot">
        <p>This site sets no cookies and has no analytics. It saves your tempo and sound choice on your own device only.</p>
        ${credits.map((c) => `<p>${esc(c)}</p>`).join('')}
      </footer>
    </main>
  `;

  el.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'home') go('home');
    if (act === 'print') window.print();
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
