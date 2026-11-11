// Tiny persisted settings store (tempo + sound). No framework needed.

export const TEMPOS = [
  { id: 'andante', name: 'Andante', bpm: 80 },
  { id: 'moderato', name: 'Moderato', bpm: 120 },
  { id: 'vivace', name: 'Vivace', bpm: 160 },
];

const KEY = 'wyclef.portfolio.settings.v1';
const defaults = { tempo: 'moderato', sound: true };

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const tempo = TEMPOS.some((t) => t.id === raw.tempo) ? raw.tempo : defaults.tempo;
    const sound = typeof raw.sound === 'boolean' ? raw.sound : defaults.sound;
    return { tempo, sound };
  } catch {
    return { ...defaults };
  }
}

let state = load();
const listeners = new Set();

export const getState = () => state;
export const getTempo = () => TEMPOS.find((t) => t.id === state.tempo) ?? TEMPOS[1];

export function setState(patch) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage can be unavailable (private mode); settings just won't persist */
  }
  listeners.forEach((fn) => fn(state));
}

export function cycleTempo(dir) {
  const i = TEMPOS.findIndex((t) => t.id === state.tempo);
  const next = TEMPOS[(i + dir + TEMPOS.length) % TEMPOS.length];
  setState({ tempo: next.id });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
