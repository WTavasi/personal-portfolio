import { defineConfig } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Pages have real paths (/resume), so asset URLs must be absolute. BASE_PATH is '/' on AWS
// (the default) and '/personal-portfolio/' on GitHub Pages (set in its workflow).
const base = process.env.BASE_PATH || '/';

// After the build, write each page that can be rendered without the 3D hall as its own HTML file,
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
      const { resumeMarkup } = await import('./src/screens/resume-markup.js');
      const { person } = await import('./src/content.js');
      const page = shell
        .replace(/<title>[^<]*<\/title>/, `<title>${person.name} | Résumé</title>`)
        .replace('<body>', '<body data-screen="resume" data-surface="paper">')
        .replace('id="world"', 'id="world" hidden')
        .replace('<div id="app"></div>', `<div id="app"><div class="screen resume">${resumeMarkup()}</div></div>`);
      if (page === shell || !page.includes('class="screen resume"')) throw new Error('prerender: index.html did not match');
      await mkdir(resolve(outDir, 'resume'), { recursive: true });
      await writeFile(resolve(outDir, 'resume', 'index.html'), page);
      await writeFile(resolve(outDir, '404.html'), shell);
    },
  };
}

export default defineConfig({
  base,
  plugins: [prerender()],
  // The 3D hall is one lazy-loaded chunk (about 165 KB gzipped); the résumé never loads it.
  build: { target: 'es2020', chunkSizeWarningLimit: 800 },
});
