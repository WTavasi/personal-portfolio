import { defineConfig } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Pages have real paths (/resume), so asset URLs must be absolute. BASE_PATH is '/' on AWS
// (the default) and '/personal-portfolio/' on GitHub Pages (set in its workflow).
const base = process.env.BASE_PATH || '/';
process.env.BASE_PATH = base; // the prerender step's router reads it
// Where the site is served from, such as https://example.github.io (no trailing slash). Link
// previews need full addresses; without it pages still get their description, not the preview.
const site = (process.env.SITE_URL || '').replace(/\/$/, '');

const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// The head of a page: its own description, and how a link to it previews (LinkedIn, WhatsApp,
// Slack and the like), plus structured data that matches what the page says.
function headTags({ title, description, path, data }) {
  const url = site && site + path + (path.endsWith('/') ? '' : '/'); // Pages serves each page as a folder
  const tags = [
    `<meta name="description" content="${attr(description)}" />`,
    url && `<link rel="canonical" href="${attr(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${attr(title)}" />`,
    `<meta property="og:description" content="${attr(description)}" />`,
    url && `<meta property="og:url" content="${attr(url)}" />`,
    site && `<meta property="og:image" content="${attr(`${site}${base}og-image.jpg`)}" />`,
    site && `<meta property="og:image:width" content="1200" />`,
    site && `<meta property="og:image:height" content="630" />`,
    site && `<meta property="og:image:alt" content="The concert hall: an orchestra and choir on stage, red seats and organ pipes." />`,
    `<meta name="twitter:card" content="${site ? 'summary_large_image' : 'summary'}" />`,
    data && `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`,
  ];
  return tags.filter(Boolean).join('\n    ');
}
const withHead = (html, head) => html.replace(/\s*<meta\s+name="description"[\s\S]*?\/>/, '').replace('\n  </head>', `\n    ${head}\n  </head>`);
// "Cloud, DevOps and software engineer" in the middle of a sentence.
const midSentence = (s) => s[0].toLowerCase() + s.slice(1);

// After the build, write every page that can be rendered without the 3D hall (the first screen,
// the résumé and all the rooms) as its own HTML file,
// so it can be read (and indexed) before or without JavaScript, and add a 404 page that loads the
// app for any other address.
function prerender() {
  let outDir = 'dist';
  return {
    name: 'prerender-pages',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const shell = await readFile(resolve(outDir, 'index.html'), 'utf8');
      const { aboutMarkup } = await import('./src/screens/resume-markup.js');
      const { roomMarkup, roomTitle, roomAbout, roomPages } = await import('./src/screens/rooms-markup.js');
      const { person, contact } = await import('./src/content.js');

      // Who the site is about, as search engines and AI assistants read it: only what the pages say.
      const who = {
        '@type': 'Person',
        name: person.name,
        jobTitle: person.headline,
        description: person.description,
        address: { '@type': 'PostalAddress', addressLocality: person.location.split(', ')[0], addressRegion: person.location.split(', ')[1] },
        sameAs: [contact.github, contact.linkedin].filter(Boolean),
        ...(site && { url: `${site}${base}about/` }),
      };
      const aboutText = `${person.name}, ${midSentence(person.headline)} in ${person.location}: experience, projects, education and music. ${person.availability}`;

      const write = async (path, { title, description, screen, html, data }) => {
        const page = withHead(shell, headTags({ title, description, path, data }))
          .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
          .replace('<body>', `<body data-screen="${screen}" data-surface="paper">`)
          .replace('id="world"', 'id="world" hidden')
          .replace('class="world-region"', 'class="world-region" hidden')
          .replace('<div id="app"></div>', `<div id="app"><div class="screen room">${html}</div></div>`);
        if (page === shell || !page.includes(`<div class="screen`)) throw new Error('prerender: index.html did not match');
        const dir = resolve(outDir, path.slice(base.length));
        await mkdir(dir, { recursive: true });
        await writeFile(resolve(dir, 'index.html'), page);
      };

      // About me holds the résumé; /resume is the same page (the app opens it at the résumé part).
      const profile = { '@context': 'https://schema.org', '@type': 'ProfilePage', mainEntity: who };
      await write(`${base}about`, { title: `About me | ${person.name}`, description: aboutText, screen: 'about', html: aboutMarkup(), data: profile });
      await write(`${base}resume`, { title: `Résumé | ${person.name}`, description: aboutText, screen: 'resume', html: aboutMarkup() });
      for (const { key, param, path } of roomPages()) {
        await write(path, { title: roomTitle(key, param), description: roomAbout(key, param), screen: key, html: roomMarkup(key, param) });
      }
      await writeFile(resolve(outDir, '404.html'), shell);

      // The home page: the first screen and the still of the hall, so the first paint needs no JS.
      const { homeMarkup, stillMarkup } = await import('./src/screens/home-markup.js');
      const homeTitle = shell.match(/<title>([^<]*)<\/title>/)[1];
      const homeAbout = `${person.name}, ${midSentence(person.headline)}: a portfolio presented as an interactive concert hall, with his engineering work, his music and a way to get in touch.`;
      const site_ = { '@context': 'https://schema.org', '@type': 'WebSite', name: person.name, ...(site && { url: `${site}${base}` }), about: who };
      const home = withHead(shell, headTags({ title: homeTitle, description: homeAbout, path: base, data: site_ }))
        .replace('<body>', '<body data-screen="home" data-surface="hall">')
        .replace(
          '<div id="app"></div>',
          `${stillMarkup().replace('<img ', '<img data-prerendered ')}<div id="app"><section class="screen home" aria-label="Home" data-prerendered>${homeMarkup()}</section></div>`,
        );
      if (home === shell) throw new Error('prerender: index.html did not match');
      await writeFile(resolve(outDir, 'index.html'), home);
    },
  };
}

export default defineConfig({
  base,
  plugins: [prerender()],
  // The 3D hall is one lazy-loaded chunk (about 165 KB gzipped); the résumé never loads it.
  build: { target: 'es2020', chunkSizeWarningLimit: 800 },
});
