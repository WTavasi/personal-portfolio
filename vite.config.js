import { defineConfig } from 'vite';

// base './' keeps asset paths relative so the build works on GitHub Pages
// (repo subpath) and on a custom domain without changes.
export default defineConfig({
  base: './',
  // The 3D hall is one lazy-loaded chunk (about 150 KB gzipped); the résumé never loads it.
  build: { target: 'es2020', chunkSizeWarningLimit: 800 },
});
