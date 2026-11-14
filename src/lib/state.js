// Tiny persisted store: tempo, sound, timing calibration and which movements are cleared.
// It lives in localStorage on the visitor's own device and is never sent anywhere.

export const TEMPOS = [
  { id: 'andante', name: 'Andante', bpm: 80 },
  { id: 'moderato', name: 'Moderato', bpm: 120 },
  { id: 'vivace', name: 'Vivace', bpm: 160 },
];

const KEY = 'wyclef.portfolio.settings.v1';
const defaults = { tempo: 'moderato', sound: true, latencyMs: 0, cleared: {} };

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const tempo = TEMPOS.some((t) => t.id === raw.tempo) ? raw.tempo : defaults.tempo;
    const sound = typeof raw.sound === 'boolean' ? raw.sound : defaults.sound;
    const latencyMs = Number.isFinite(raw.latencyMs) ? Math.max(-150, Math.min(300, raw.latencyMs)) : 0;
    const cleared = {};
    for (const [id, pct] of Object.entries(raw.cleared && typeof raw.cleared === 'object' ? raw.cleared : {})) {
      if (Number.isFinite(pct)) cleared[id] = pct;
    }
    return { tempo, sound, latencyMs, cleared };
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
