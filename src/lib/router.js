// Real paths (/, /resume, /work/mzazicare) instead of hash routes (#/resume), so every page has an
// address that can be shared, bookmarked and indexed. Works under any base path: the site is
// served from / on AWS and from /personal-portfolio/ on GitHub Pages (Vite's BASE_URL, set at
// build time; the prerender step in vite.config.js reads BASE_PATH instead).
import { projects } from '../content.js';

const BASE = import.meta.env?.BASE_URL ?? process.env.BASE_PATH ?? '/'; // always ends with '/'

// Path (relative to the base) -> route key.
const ROUTES = {
  '': 'home',
  work: 'work',
  music: 'music',
  services: 'services',
  about: 'about',
  wall: 'wall',
  resume: 'resume',
  privacy: 'privacy',
};
const PATHS = Object.fromEntries(Object.entries(ROUTES).map(([path, key]) => [key, path]));
const SLUGS = new Set(projects.map((p) => p.slug));

// Hash links from v0.6 (#/resume, #/program, #/hall, ...) still work: they are rewritten once.
const LEGACY = { resume: 'resume', program: 'resume', hall: 'home', home: 'home', concert: 'home', boot: 'home' };

// The Tracklist menu and tab bar: every room, numbered like an album, with its plain label (design
// document, section 5). "Next track" follows this order. The notice board is an extra: miscellaneous, not core to the
// portfolio, so it has no track number, sits apart in the Tracklist, has its own red marker in the
// hall and is left out of the bars of rooms.
export const TRACKS = [
  { key: 'home', no: '00', label: 'Home' },
  { key: 'work', no: '01', label: 'Work' },
  { key: 'music', no: '02', label: 'Music' },
  { key: 'services', no: '03', label: 'Services' },
  { key: 'about', no: '04', label: 'About' },
  { key: 'resume', no: '∞', label: 'Résumé' },
  { key: 'wall', no: '', label: 'Notice board', extra: true },
];

export const pathFor = (key, param) => (key === 'project' ? `${BASE}work/${param}` : BASE + (PATHS[key] ?? ''));

// The route for the address in the bar, as { key, param }, or null for an unknown path.
export function currentRoute() {
  let path = location.pathname;
  path = path.startsWith(BASE) ? path.slice(BASE.length) : path.replace(/^\//, '');
  path = path.replace(/(^|\/)index\.html$/, '').replace(/\/+$/, '');
  if (path in ROUTES) return { key: ROUTES[path] };
  const m = path.match(/^work\/([\w-]+)$/);
  return m && SLUGS.has(m[1]) ? { key: 'project', param: m[1] } : null;
}

let onChange = () => {};

export function navigate(key, { replace = false } = {}) {
  const url = pathFor(key);
  if (url !== location.pathname) history[replace ? 'replaceState' : 'pushState'](null, '', url);
  onChange();
}

// A plain left click on a link to a page of this site changes the page without reloading, so the
// 3D hall and any music keep running. Other clicks (new tab, download, external) are left alone.
function interceptLinks(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const a = event.target.closest?.('a[href]');
  if (!a || a.target || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith(BASE)) return;
  const before = location.pathname;
  history.pushState(null, '', url.pathname + url.search);
  if (currentRoute() === null) {
    history.replaceState(null, '', before); // not one of our pages: let the browser handle it
    return;
  }
  event.preventDefault();
  onChange();
}

export function startRouter(render) {
  onChange = render;
  const legacy = location.hash.match(/^#\/([\w-]*)/);
  if (legacy) history.replaceState(null, '', pathFor(LEGACY[legacy[1]] ?? 'home'));
  if (currentRoute() === null) history.replaceState(null, '', pathFor('home'));
  window.addEventListener('popstate', () => onChange());
  document.addEventListener('click', interceptLinks);
  onChange();
}
