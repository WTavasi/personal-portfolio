// Real paths (/, /resume) instead of hash routes (#/resume), so every page has an address that
// can be shared, bookmarked and indexed. Works under any base path: the site is served from / on
// AWS and from /personal-portfolio/ on GitHub Pages (Vite's BASE_URL, set at build time).

const BASE = import.meta.env.BASE_URL; // always ends with '/'

// Path (relative to the base) -> route key. Rooms join this list as they are built.
const ROUTES = { '': 'home', resume: 'resume' };
const PATHS = Object.fromEntries(Object.entries(ROUTES).map(([path, key]) => [key, path]));

// Hash links from v0.6 (#/resume, #/program, #/hall, ...) still work: they are rewritten once.
const LEGACY = { resume: 'resume', program: 'resume', hall: 'home', home: 'home', concert: 'home', boot: 'home' };

// The Tracklist menu: every page, numbered like an album, with its venue name and plain label.
// Rooms join this list as they are built.
export const TRACKS = [
  { key: 'home', no: '00', venue: 'The Hall', label: 'Home' },
  { key: 'resume', no: '∞', venue: 'Encore', label: 'Résumé' },
];

export const pathFor = (key) => BASE + (PATHS[key] ?? '');

// The route key for the address in the bar, or null for an unknown path.
export function currentRoute() {
  let path = location.pathname;
  path = path.startsWith(BASE) ? path.slice(BASE.length) : path.replace(/^\//, '');
  path = path.replace(/(^|\/)index\.html$/, '').replace(/\/+$/, '');
  return ROUTES[path] ?? null;
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
