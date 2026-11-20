import { person, contact, experience, projects, skills, education, certifications, honors, interests, credits } from '../content.js';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ext = (href, label) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`;

const list = (items) => `<ul>${items.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`;

function mailtoFor(to) {
  const site = new URL(window.location.pathname, window.location.origin).href;
  const lines = [
    'Hello,',
    '',
    `Here is the résumé of ${person.name}, a cloud, DevOps and mobile engineer based in ${person.location}.`,
    person.availability,
    '',
    `Résumé (web): ${site}#/resume`,
    `Interactive portfolio: ${site}`,
    '',
    `Contact: ${[contact.email, contact.linkedin].filter(Boolean).join(' | ')}`,
  ].filter((l) => l !== null);
  const q = (v) => encodeURIComponent(v);
  return `mailto:${q(to)}?subject=${q(`Résumé: ${person.name}, cloud, DevOps and mobile engineer`)}&body=${q(lines.join('\n'))}`;
}

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
      <div class="p-actions">
        <button class="btn btn-secondary" data-act="print">Print</button>
        <button class="btn btn-secondary" data-act="mail" aria-expanded="false" aria-controls="mail-form">Mail</button>
      </div>
    </nav>

    <form class="mail-form" id="mail-form" hidden novalidate>
      <label for="mail-to">Send this résumé to</label>
      <div class="mail-row">
        <input id="mail-to" type="email" aria-describedby="mail-note" autocomplete="email" placeholder="name@company.com" required />
        <button class="btn btn-primary" type="submit">Write the email</button>
      </div>
      <p class="mail-note" id="mail-note" data-bind="mail-note" aria-live="polite">This opens your own mail app with a message ready to send. The address you type stays on your device; this site does not store or send it.</p>
    </form>

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

  const form = el.querySelector('.mail-form');
  const mailBtn = el.querySelector('[data-act="mail"]');
  const toInput = el.querySelector('#mail-to');

  el.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'home') go('hall');
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
    title: `${person.name} | Résumé`,
    mount() {
      world.hide?.();
      window.scrollTo(0, 0);
      el.querySelector('h1').setAttribute('tabindex', '-1');
    },
    destroy() {},
  };
}
