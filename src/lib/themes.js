// The hall's music: one piece split into stems, one per orchestra section, all playing in sync.
// Between sections every stem plays quietly (the full theme). Opening a section brings its own
// stem forward and fades the rest out, so only those instruments are heard. The podium (About)
// brings the whole orchestra up.
//
// The files in src/assets/themes/ are generated placeholders. To use your own piece, replace them
// with your stems under the same names. Every stem must be the same length and tempo and loop
// cleanly; set BPM below to your piece's tempo so the conductor keeps time with it.
import { audioOut } from './audio.js';

export const BPM = 80;
export const STEMS = ['piano', 'strings', 'woodwinds', 'brass', 'percussion', 'choir'];
const FOCUS = {
  about: STEMS,
  experience: ['strings'],
  projects: ['woodwinds'],
  skills: ['brass'],
  certifications: ['percussion'],
  education: ['choir'],
};
const IDLE_LEVEL = 0.45;

const FILES = import.meta.glob('../assets/themes/*.{mp3,m4a,ogg,wav}', { eager: true, query: '?url', import: 'default' });
const fileFor = (id) => {
  const key = Object.keys(FILES).find((k) => k.split('/').pop().replace(/\.\w+$/, '') === id);
  return key ? FILES[key] : null;
};

let decoded = null; // Promise of { name: AudioBuffer }
let ctx = null;
let watching = false;
let playingSet = null; // { t0, sources, gains }
let focus = null;

// Fetch and decode every stem. Safe to call before the visitor has clicked: decoding uses an
// offline context, which browsers allow without a gesture. Called while the hall builds.
export function preloadThemes() {
  if (decoded) return decoded;
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) return (decoded = Promise.resolve({}));
  const dec = new Offline(2, 1, 44100);
  decoded = Promise.all(
    STEMS.map(async (name) => {
      const url = fileFor(name);
      if (!url) return [name, null];
      try {
        const data = await fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))));
        return [name, await dec.decodeAudioData(data)];
      } catch {
        return [name, null];
      }
    }),
  ).then((pairs) => Object.fromEntries(pairs.filter(([, b]) => b)));
  return decoded;
}

function output() {
  const out = audioOut();
  if (!out) return null;
  ctx = out.context;
  if (!watching) {
    watching = true;
    // Pause with the tab; the stems stay in step because the whole clock stops.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend();
      else ctx.resume();
    });
  }
  return out;
}

const levelFor = (name) => {
  if (!focus) return IDLE_LEVEL;
  return FOCUS[focus]?.includes(name) ? 1 : 0;
};

function applyLevels(seconds) {
  if (!playingSet) return;
  const t = ctx.currentTime;
  for (const [name, g] of Object.entries(playingSet.gains)) {
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(levelFor(name), t, seconds / 3);
  }
}

export const themes = {
  // Start the theme (if it is not already playing) and set which section is in focus.
  async play(section = null, { fade = 1.2 } = {}) {
    focus = section;
    if (playingSet) return applyLevels(0.7);
    const out = output();
    if (!out) return;
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
    const buffers = await preloadThemes();
    if (playingSet || !Object.keys(buffers).length) return applyLevels(0.7);
    const t0 = ctx.currentTime + 0.1;
    const set = { t0, sources: [], gains: {} };
    for (const [name, buffer] of Object.entries(buffers)) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(out);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(g);
      src.start(t0); // every stem starts on the same sample, so they stay locked together
      set.sources.push(src);
      set.gains[name] = g;
    }
    playingSet = set;
    applyLevels(fade);
  },

  stop(fade = 0.9) {
    if (!playingSet || !ctx) return;
    const { sources, gains } = playingSet;
    playingSet = null;
    const t = ctx.currentTime;
    for (const g of Object.values(gains)) {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(0, t, fade / 3);
    }
    for (const s of sources) s.stop(t + fade * 2);
  },

  get playing() {
    return !!playingSet;
  },

  // Position in beats, for the conductor's baton. Null when nothing is playing.
  beats() {
    if (!playingSet || !ctx || ctx.state !== 'running') return null;
    return ((ctx.currentTime - playingSet.t0) * BPM) / 60;
  },

  // A round of applause, once every section has been explored.
  applause(seconds = 4.5) {
    const out = output();
    if (!out) return;
    const t0 = ctx.currentTime + 0.05;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.5, t0 + 0.6);
    g.gain.setValueAtTime(0.5, t0 + seconds - 1.4);
    g.gain.linearRampToValueAtTime(0.0001, t0 + seconds);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1700;
    f.Q.value = 0.6;
    f.connect(g).connect(out);
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (let i = 0; i < seconds * 70; i++) {
      const t = t0 + Math.random() * seconds;
      const s = ctx.createBufferSource();
      s.buffer = noise;
      const e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.linearRampToValueAtTime(0.12 + Math.random() * 0.25, t + 0.003);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random() * 0.04);
      s.connect(e).connect(f);
      s.start(t, Math.random() * 1.5, 0.1);
    }
  },
};
