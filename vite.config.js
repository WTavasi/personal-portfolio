import { defineConfig } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Pages have real paths (/resume), so asset URLs must be absolute. BASE_PATH is '/' on AWS
// (the default) and '/personal-portfolio/' on GitHub Pages (set in its workflow).
const base = process.env.BASE_PATH || '/';
process.env.BASE_PATH = base; // the prerender step's router reads it

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
      const { roomMarkup, roomTitle, roomPages } = await import('./src/screens/rooms-markup.js');
      const { person } = await import('./src/content.js');

      const write = async (path, { title, screen, html }) => {
        const page = shell
          .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
          .replace('<body>', `<body data-screen="${screen}" data-surface="paper">`)
          .replace('id="world"', 'id="world" hidden')
          .replace('<div id="app"></div>', `<div id="app"><div class="screen ${screen === 'resume' || screen === 'about' ? 'resume' : 'room'}">${html}</div></div>`);
        if (page === shell || !page.includes(`<div class="screen`)) throw new Error('prerender: index.html did not match');
        const dir = resolve(outDir, path.slice(base.length));
        await mkdir(dir, { recursive: true });
        await writeFile(resolve(dir, 'index.html'), page);
      };

      // About me holds the résumé; /resume is the same page (the app opens it at the résumé part).
      await write(`${base}about`, { title: `About me | ${person.name}`, screen: 'about', html: aboutMarkup() });
      await write(`${base}resume`, { title: `Résumé | ${person.name}`, screen: 'resume', html: aboutMarkup() });
      for (const { key, param, path } of roomPages()) {
        await write(path, { title: roomTitle(key, param), screen: key, html: roomMarkup(key, param) });
      }
      await writeFile(resolve(outDir, '404.html'), shell);

      // The home page: the first screen and the still of the hall, so the first paint needs no JS.
      const { homeMarkup, stillMarkup } = await import('./src/screens/home-markup.js');
      const home = shell
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
