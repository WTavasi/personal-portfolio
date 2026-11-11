# Wyclef portfolio: The Conductor's Podium

Requires Node 18+.

```bash
npm install
npm run dev       # local dev server
npm run build     # production build into dist/
npm run preview   # serve the build locally
```

- Recruiter view: `/#/resume` (no 3D download). Old `/#/program` links redirect there.
- All copy lives in `src/content.js`. Contact fields are empty until you fill them in.
- Audio the site plays lives in `src/assets/audio/`. The top-level `audio/` folder is for original source files on your computer and is not committed.
- Design system: `src/styles/tokens.css`. Design brief and roadmap: `docs/DESIGN.md`.
- The 3D hall is built in code in `src/world/`. No model files. Add `?stats` to the URL to expose `__hallStats()` in the console (draw calls, triangles, pixel ratio).
- The build uses a relative base, so `dist/` works on GitHub Pages or a custom domain as is.
