import { person, contact, experience, projects, skills, education, certifications, honors } from '../content.js';
import { ensureAudio, stopTuning, tuningActive } from '../lib/audio.js';
import { themes, prepareApplauseAll } from '../lib/themes.js';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ext = (href, label) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`;
const list = (items) => `<ul>${items.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`;

// Each part of the stage stands for one part of the résumé. The subtitle only
// appear in the panel, once the camera has moved in on that section.
const SECTIONS = [
  {
    id: 'about',
    label: 'About',
    title: 'About',
    with: 'from the podium',
  },
  {
    id: 'experience',
    label: 'Experience',
    title: 'Experience',
    with: 'with the strings',
  },
  {
    id: 'projects',
    label: 'Projects',
    title: 'Projects',
    with: 'with the woodwinds',
  },
  {
    id: 'skills',
    label: 'Skills',
    title: 'Skills',
    with: 'with the brass',
  },
  {
    id: 'certifications',
    label: 'Certifications',
    title: 'Certifications and honors',
    with: 'with the percussion',
  },
  {
    id: 'education',
    label: 'Education',
    title: 'Education',
    with: 'with the choir',
  },
];
const byId = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));

function body(id) {
  if (id === 'about') {
    const links = [
      contact.email && `<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>`,
      contact.linkedin && ext(contact.linkedin, 'LinkedIn'),
      contact.github && ext(contact.github, 'GitHub'),
    ].filter(Boolean);
    return `
      <p class="sheet-lead">${esc(person.headline)}</p>
      <p>${esc(person.description)}</p>
      <p>${esc(person.availability)} Based in ${esc(person.location)}.</p>
      <p class="sheet-links">${links.join('')}</p>`;
  }
  if (id === 'experience') {
    return experience
      .map(
        (e) => `
      <article class="item">
        <h3>${esc(e.role)}</h3>
        <p class="meta">${esc(e.org)} · ${esc(e.when)}</p>
        ${list(e.bullets)}
      </article>`,
      )
      .join('');
  }
  if (id === 'projects') {
    return projects
      .map(
        (p) => `
      <article class="item">
        <h3>${esc(p.name)}</h3>
        <p class="meta">${esc(p.stack)} · ${esc(p.year)}</p>
        ${list(p.bullets)}
        ${p.href ? `<p class="item-link">${ext(p.href, 'Code on GitHub')}</p>` : ''}
      </article>`,
      )
      .join('');
  }
  if (id === 'skills') {
    return `<dl class="skills">${skills.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
  }
  return `
    ${education
      .map(
        (e) => `
      <article class="item">
        <h3>${esc(e.title)}</h3>
        <p class="meta">${esc(e.when)}</p>
        ${
          e.coursework
            ? `<dl class="skills">${e.coursework.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`
            : ''
        }
      </article>`,
      )
      .join('')}`;
}

function sectionBody(id) {
  if (id === 'certifications') {
    return `
    <article class="item"><h3>Certifications and training</h3>${list(certifications)}</article>
    <article class="item"><h3>Honors</h3>${list(honors)}</article>`;
  }
  return body(id);
}

// Remembered for the visit, so coming back from the résumé keeps what was explored.
const visited = new Set();
let fullHouse = false;
const audienceShare = () => 0.12 + (0.88 * visited.size) / SECTIONS.length;

export function hallScreen({ go, world }) {
  const api = world.api;
  const el = document.createElement('section');
  el.className = 'screen hall';
  el.setAttribute('aria-label', 'The concert hall');
  el.innerHTML = `
    <div class="scrim scrim-top" aria-hidden="true"></div>
    <div class="scrim scrim-bottom" aria-hidden="true"></div>
    <h1 class="sr-only">${esc(person.name)}, ${esc(person.headline)}</h1>

    <div class="markers" aria-hidden="true">
      ${SECTIONS.map(
        (s) => `<button class="marker" data-open="${s.id}" tabindex="-1"><span class="marker-ring"></span><span class="marker-label">${s.label}</span></button>`,
      ).join('')}
    </div>

    ${world.fallback ? '<p class="hall-note">The 3D hall is not available on this device. Every section is in the list below.</p>' : ''}

    <div class="dock">
      <p class="hall-hint" data-bind="hint"></p>
      <nav class="sections panel" aria-label="Sections">
        ${SECTIONS.map(
          (s) => `<button class="sec" data-open="${s.id}"><span class="sec-label">${s.label}</span></button>`,
        ).join('')}
      </nav>
    </div>

    <aside class="sheet panel" hidden aria-labelledby="sheet-h">
      <header class="sheet-head">
        <div class="sheet-titles">
          <h2 id="sheet-h" tabindex="-1"></h2>
          <p class="sheet-with" data-bind="with"></p>
        </div>
        <button class="btn btn-secondary sheet-close" data-act="close">Close</button>
      </header>
      <div class="sheet-body"></div>
    </aside>
    <p class="sr-only" aria-live="polite" data-bind="live"></p>
  `;

  const $ = (s) => el.querySelector(s);
  const sheet = $('.sheet');
  const live = $('[data-bind="live"]');
  const markers = [...el.querySelectorAll('.marker')];
  let open = null;
  let hover = null;
  let lastOpener = null;

  function renderProgress() {
    el.querySelectorAll('.sec').forEach((b) => b.classList.toggle('is-visited', visited.has(b.dataset.open)));
    markers.forEach((m) => m.classList.toggle('is-visited', visited.has(m.dataset.open)));
    $('[data-bind="hint"]').textContent = fullHouse
      ? 'Full house. Thank you for exploring.'
      : visited.size
        ? `${visited.size} of ${SECTIONS.length} explored`
        : 'Click a glowing marker, or any part of the orchestra, to explore.';
  }

  function openSection(id, opener = null) {
    const s = byId[id];
    if (!s) return;
    lastOpener = opener;
    open = id;
    visited.add(id);
    api?.setView(id);
    api?.setSelected(id);
    api?.setAudience(audienceShare());
    api?.setActive(id);
    $('#sheet-h').textContent = s.title;
    $('[data-bind="with"]').textContent = s.with;
    $('.sheet-body').innerHTML = sectionBody(id);
    $('.sheet-body').scrollTop = 0;
    sheet.hidden = false;
    el.classList.add('has-sheet');
    el.querySelectorAll('.sec').forEach((b) => b.setAttribute('aria-current', String(b.dataset.open === id)));
    $('#sheet-h').focus({ preventScroll: true });

    ensureAudio();
    if (tuningActive()) stopTuning(0.6);
    if (!fullHouse && visited.size === SECTIONS.length) {
      fullHouse = true;
      themes.applause();
      api?.celebrate();
      live.textContent = `${s.label} opened. Every section explored: full house.`;
    } else {
      live.textContent = `${s.label} opened.`;
    }
    themes.play(id);
    renderProgress();
  }

  function closeSection() {
    if (!open) return;
    const was = open;
    open = null;
    sheet.hidden = true;
    el.classList.remove('has-sheet');
    el.querySelectorAll('.sec').forEach((b) => b.setAttribute('aria-current', 'false'));
    api?.setView('overview');
    api?.setSelected(null);
    api?.setActive(null);
    themes.play(null);
    (lastOpener && document.contains(lastOpener) ? lastOpener : el.querySelector(`.sec[data-open="${was}"]`))?.focus({
      preventScroll: true,
    });
  }

  /* --------------------------------------------- pointing at the 3D hall */

  let downAt = null;
  const overUi = (target) => target.closest('button, a, input, .sheet, .sections');

  el.addEventListener('pointermove', (e) => {
    if (!api || e.pointerType === 'touch') return;
    const id = overUi(e.target) ? null : api.pick(e.clientX, e.clientY);
    if (id !== hover) {
      hover = id;
      api.setHover(id);
      markers.forEach((m) => m.classList.toggle('is-hover', m.dataset.open === id));
      el.classList.toggle('is-pointing', !!id);
    }
  });
  el.addEventListener('pointerdown', (e) => {
    downAt = [e.clientX, e.clientY];
  });
  el.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open]');
    if (opener) return openSection(opener.dataset.open, opener.classList.contains('sec') ? opener : null);
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') return closeSection();
    if (overUi(e.target) || !api) return;
    // A click on the hall itself (not a drag): open what is under it, or close the panel.
    if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const id = api.pick(e.clientX, e.clientY);
    if (id) openSection(id);
    else closeSection();
  });

  const onKey = (e) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      closeSection();
    }
  };

  // Markers follow their section on screen every frame.
  function placeMarkers() {
    const show = api.revealed;
    el.classList.toggle('is-lit', show);
    for (const m of markers) {
      const p = show ? api.project(m.dataset.open) : null;
      const hidden = !p || m.dataset.open === open;
      m.hidden = hidden;
      if (!hidden) m.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    }
  }

  let unframe = () => {};
  return {
    el,
    title: `${person.name} | ${person.headline}`,
    mount() {
      renderProgress();
      window.addEventListener('keydown', onKey);
      world.show?.();
      if (api) {
        api.setAudience(audienceShare());
        api.setView('overview');
        unframe = api.onFrame(placeMarkers);
        api.start();
        if (!api.revealed) api.reveal();
      }
      // The applause is rendered in the background, ready for when the house is full.
      setTimeout(prepareApplauseAll, 3000);
      // Back from the résumé: pick the music up again.
      if (!themes.playing && !tuningActive()) themes.play(open);
      $('.sec')?.setAttribute('data-first', '');
    },
    // The top bar's sound control: turning sound back on picks the music up again.
    onSound(on) {
      if (on && !themes.playing && !tuningActive()) themes.play(open);
    },
    destroy() {
      unframe();
      window.removeEventListener('keydown', onKey);
      api?.setHover(null);
      api?.setSelected(null);
      api?.setView('overview');
      api?.setActive(null);
    },
  };
}
