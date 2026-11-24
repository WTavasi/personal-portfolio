// Tiny persisted store: sound on or off, volume, and whether chosen music keeps playing across
// pages. It lives in localStorage on the
// visitor's own device and is never sent anywhere.

const KEY = 'wyclef.portfolio.settings.v2';
const defaults = { sound: true, volume: 0.7, keepPlaying: true };

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const sound = typeof raw.sound === 'boolean' ? raw.sound : defaults.sound;
    const volume = Number.isFinite(raw.volume) ? Math.max(0, Math.min(1, raw.volume)) : defaults.volume;
    const keepPlaying = typeof raw.keepPlaying === 'boolean' ? raw.keepPlaying : defaults.keepPlaying;
    return { sound, volume, keepPlaying };
  } catch {
    return { ...defaults };
  }
}

let state = load();
const listeners = new Set();

export const getState = () => state;

export function setState(patch) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage can be unavailable (private mode); settings just won't persist */
  }
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
