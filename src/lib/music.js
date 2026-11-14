// The music engine: one transport (the clock everything follows), a small synthesiser,
// and a song written in beats so it plays at any tempo.
//
// Each orchestra section is a "layer" with its own volume. Today every layer is synthesised
// from the note lists in PARTS. To swap in recorded stems later, give a layer an audio file
// cut to the same 32-beat loop and start it from scheduleSong() instead of calling a voice;
// the transport, the game and the hall do not need to change.
import { ensureAudio } from './audio.js';
import { getState, subscribe } from './state.js';

const LOOKAHEAD = 0.18; // seconds of audio scheduled ahead of the clock
const TICK_MS = 25;
export const LOOP_BEATS = 32; // the song is an 8-bar loop in 4/4

/* ------------------------------------------------------------------ the song */

// D major: D, Bm, G, A, D, F#m, G, A7. One chord per bar.
export const CHORDS = [
  [62, 66, 69],
  [59, 62, 66],
  [55, 59, 62],
  [57, 61, 64],
  [62, 66, 69],
  [54, 57, 61],
  [55, 59, 62],
  [57, 61, 67],
];
const BASS = [50, 47, 43, 45, 50, 42, 43, 45];

function buildParts() {
  const piano = [];
  const strings = [];
  const brass = [];
  CHORDS.forEach((c, bar) => {
    const b = bar * 4;
    piano.push({ beat: b, dur: 3.5, midi: BASS[bar], vel: 0.42 });
    [c[0], c[2], c[1] + 12, c[2], c[0] + 12, c[2], c[1] + 12, c[2]].forEach((m, i) =>
      piano.push({ beat: b + i / 2, dur: 0.6, midi: m, vel: i % 2 ? 0.16 : 0.24 }),
    );
    c.forEach((m) => strings.push({ beat: b, dur: 4, midi: m + 12, vel: 0.1 }));
    strings.push({ beat: b, dur: 4, midi: BASS[bar], vel: 0.12 });
    if (bar % 4 === 0) {
      c.forEach((m) => brass.push({ beat: b, dur: 1.5, midi: m, vel: 0.16, voice: 'brass' }));
      brass.push({ beat: b, dur: 2, midi: 38, vel: 0.5, voice: 'timp' });
    }
    if (bar % 4 === 3) {
      for (const off of [3, 3.5]) c.forEach((m) => brass.push({ beat: b + off, dur: 0.35, midi: m, vel: 0.14, voice: 'brass' }));
      for (const off of [2, 3]) brass.push({ beat: b + off, dur: 1, midi: 45, vel: 0.4, voice: 'timp' });
    }
  });
  // Woodwind melody: [beat, length, note]
  const winds = [
    [0, 2, 78], [2, 1, 81], [3, 1, 78],
    [4, 2, 74], [6, 2, 78],
    [8, 1.5, 79], [9.5, 0.5, 78], [10, 1, 76], [11, 1, 74],
    [12, 3, 76],
    [16, 1, 78], [17, 1, 81], [18, 2, 86],
    [20, 2, 85], [22, 2, 81],
    [24, 1, 83], [25, 1, 81], [26, 1, 79], [27, 1, 78],
    [28, 1.5, 76], [29.5, 0.5, 78], [30, 2, 76],
  ].map(([beat, dur, midi]) => ({ beat, dur, midi, vel: 0.2 }));
  return { piano, strings, winds, brass };
}
const PARTS = buildParts();
const LAYER_VOICE = { piano: 'piano', strings: 'strings', winds: 'reed', brass: 'brass' };
const LAYER_LEVEL = { piano: 1, strings: 1, winds: 1, brass: 1 };

/* ------------------------------------------------------------------- voices */

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

function env(ctx, dest, t, attack, level, hold, release) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(level, t + attack);
  g.gain.setValueAtTime(level, t + Math.max(attack, hold));
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack, hold) + release);
  g.connect(dest);
  return g;
}
function osc(ctx, dest, type, freq, t, stop, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  o.connect(dest);
  o.start(t);
  o.stop(stop);
  return o;
}
function lowpass(ctx, dest, freq, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  f.Q.value = q;
  f.connect(dest);
  return f;
}

const VOICES = {
  piano(ctx, dest, t, { midi, dur = 0.5, vel = 0.3 }) {
    const len = Math.max(dur, 0.25) + 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    g.connect(lowpass(ctx, dest, 3200));
    osc(ctx, g, 'triangle', hz(midi), t, t + len);
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    g2.connect(g);
    osc(ctx, g2, 'sine', hz(midi) * 2, t, t + len);
  },
  strings(ctx, dest, t, { midi, dur = 1, vel = 0.1 }) {
    const g = env(ctx, lowpass(ctx, dest, 1500), t, 0.22, vel, dur, 0.5);
    osc(ctx, g, 'sawtooth', hz(midi), t, t + dur + 0.6, -7);
    osc(ctx, g, 'sawtooth', hz(midi), t, t + dur + 0.6, 7);
  },
  reed(ctx, dest, t, { midi, dur = 0.5, vel = 0.2 }) {
    const g = env(ctx, lowpass(ctx, dest, 1900, 1.2), t, 0.04, vel, dur * 0.92, 0.12);
    const o = osc(ctx, g, 'square', hz(midi), t, t + dur + 0.2);
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 5.2;
    depth.gain.value = 5;
    lfo.connect(depth).connect(o.detune);
    lfo.start(t);
    lfo.stop(t + dur + 0.2);
  },
  brass(ctx, dest, t, { midi, dur = 0.5, vel = 0.15 }) {
    const f = lowpass(ctx, dest, 700, 1);
    f.frequency.setValueAtTime(700, t);
    f.frequency.linearRampToValueAtTime(2600, t + 0.06);
    f.frequency.linearRampToValueAtTime(1300, t + dur);
    const g = env(ctx, f, t, 0.03, vel, dur * 0.9, 0.15);
    osc(ctx, g, 'sawtooth', hz(midi), t, t + dur + 0.25);
  },
  timp(ctx, dest, t, { midi = 38, vel = 0.5 }) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    g.connect(dest);
    const o = osc(ctx, g, 'sine', hz(midi) * 1.5, t, t + 0.85);
    o.frequency.exponentialRampToValueAtTime(hz(midi), t + 0.06);
  },
  // Cues and the player's own notes: a clear, bell-like tone that stands apart from the piano.
  bell(ctx, dest, t, { midi, vel = 0.4, dur = 0.5 }) {
    const len = dur + 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    g.connect(dest);
    osc(ctx, g, 'sine', hz(midi), t, t + len);
    const g2 = ctx.createGain();
    g2.gain.value = 0.28;
    g2.connect(g);
    osc(ctx, g2, 'sine', hz(midi) * 3, t, t + len);
  },
  chord(ctx, dest, t, { notes, vel = 0.3, dur = 1.5 }) {
    for (const midi of notes) VOICES.piano(ctx, dest, t, { midi, vel, dur });
  },
  block(ctx, dest, t, { high = false, vel = 0.5 }) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    g.connect(dest);
    osc(ctx, g, 'triangle', high ? 1500 : 1000, t, t + 0.08);
  },
  buzz(ctx, dest, t, { vel = 0.3 }) {
    const g = env(ctx, lowpass(ctx, dest, 650), t, 0.01, vel, 0.24, 0.08);
    osc(ctx, g, 'sawtooth', 98, t, t + 0.4);
    osc(ctx, g, 'sawtooth', 104, t, t + 0.4);
  },
  thud(ctx, dest, t, { vel = 0.35 }) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    g.connect(dest);
    const o = osc(ctx, g, 'sine', 130, t, t + 0.16);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
  },
};

/* ---------------------------------------------------------------- transport */

let ctx = null;
let master = null;
let useAudio = false; // false: no Web Audio, so the wall clock keeps time and nothing sounds
let token = 0;
let timer = 0;

const T = {
  running: false,
  bpm: 120,
  t0: 0, // clock time of beat 0
  pauses: new Set(),
  pausedAt: 0,
  nextBeat: 0,
  layers: {},
  events: [],
  eventIdx: 0,
  songOffset: 0,
  songEnd: null,
  bus: null,
  tag: '',
};

function output() {
  ctx = ensureAudio();
  if (!ctx) return null;
  if (!master) {
    master = ctx.createGain();
    master.gain.value = getState().sound ? 1 : 0;
    master.connect(ctx.destination);
    subscribe((s) => master.gain.setTargetAtTime(s.sound ? 1 : 0, ctx.currentTime, 0.03));
  }
  return master;
}

const clock = () => (useAudio ? ctx.currentTime : performance.now() / 1000);
const beatsAt = (t) => ((t - T.t0) * T.bpm) / 60;
const timeOfBeat = (b) => T.t0 + (b * 60) / T.bpm;
const frozen = () => T.pauses.size > 0;

// The transport time of what is coming out of the speakers at `perfMs` (a performance.now()
// or event timestamp). This is what input and visuals are judged against.
function heardTime(perfMs) {
  if (frozen()) return T.pausedAt;
  if (!useAudio) return perfMs / 1000;
  const ts = ctx.getOutputTimestamp?.();
  if (ts && ts.performanceTime > 0) {
    const t = ts.contextTime + (perfMs - ts.performanceTime) / 1000;
    if (Math.abs(t - ctx.currentTime) < 0.5) return t;
  }
  return ctx.currentTime - (ctx.outputLatency || 0) - Math.max(0, performance.now() - perfMs) / 1000;
}

function scheduleSong(from, to) {
  for (const name of Object.keys(PARTS)) {
    if (!T.layers[name]) continue;
    const dest = T.bus.layer[name];
    const first = Math.floor((from - T.songOffset) / LOOP_BEATS);
    const last = Math.floor((to - T.songOffset) / LOOP_BEATS);
    for (let k = Math.max(0, first); k <= last; k++) {
      for (const e of PARTS[name]) {
        const b = T.songOffset + k * LOOP_BEATS + e.beat;
        if (b < from || b >= to) continue;
        if (T.songEnd != null && b >= T.songEnd) continue;
        VOICES[e.voice ?? LAYER_VOICE[name]](ctx, dest, timeOfBeat(b), { ...e, dur: (e.dur * 60) / T.bpm });
      }
    }
  }
}

function tick() {
  if (!T.running || frozen()) return;
  const now = clock();
  const until = beatsAt(now + LOOKAHEAD);
  if (useAudio) {
    scheduleSong(T.nextBeat, until);
    while (T.eventIdx < T.events.length && T.events[T.eventIdx].beat < until) {
      const e = T.events[T.eventIdx++];
      const t = timeOfBeat(e.beat);
      if (t > now - 0.05) VOICES[e.sound]?.(ctx, master, Math.max(t, now), e);
    }
  }
  T.nextBeat = Math.max(T.nextBeat, until);
}

function setLayerGains(seconds = 0.4) {
  if (!T.bus || !useAudio) return;
  for (const name of Object.keys(PARTS)) {
    const v = (T.layers[name] ? 1 : 0) * LAYER_LEVEL[name];
    T.bus.layer[name].gain.setTargetAtTime(v, ctx.currentTime, seconds / 3);
  }
}

export const music = {
  // Start the transport. `layers` says which sections play, `events` are one-off sounds at
  // given beats (cues, count-in), `songOffset` is the beat where the song itself begins.
  async start({ tag = '', bpm, layers = { piano: 1 }, level = 0.8, events = [], songOffset = 0, songEnd = null } = {}) {
    this.stop(0.15);
    const mine = ++token;
    const out = output();
    if (ctx && ctx.state !== 'running') {
      try {
        await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 400))]);
      } catch {
        /* stay on the wall clock */
      }
    }
    if (mine !== token) return;
    useAudio = !!out && ctx.state === 'running';
    if (useAudio) {
      const main = ctx.createGain();
      main.gain.value = level;
      main.connect(master);
      const layer = {};
      for (const name of Object.keys(PARTS)) {
        layer[name] = ctx.createGain();
        layer[name].gain.value = (layers[name] ? 1 : 0) * LAYER_LEVEL[name];
        layer[name].connect(main);
      }
      T.bus = { main, layer };
    }
    Object.assign(T, {
      running: true,
      tag,
      bpm,
      layers: { ...layers },
      events: [...events].sort((a, b) => a.beat - b.beat),
      eventIdx: 0,
      nextBeat: 0,
      songOffset,
      songEnd,
    });
    T.pauses.clear();
    if (document.hidden) T.pauses.add('hidden');
    T.t0 = clock() + 0.12;
    T.pausedAt = T.t0;
    clearInterval(timer);
    timer = setInterval(tick, TICK_MS);
    tick();
  },

  stop(fade = 0.6) {
    token++;
    clearInterval(timer);
    if (T.bus && useAudio) {
      const { main } = T.bus;
      main.gain.setTargetAtTime(0, ctx.currentTime, Math.max(fade, 0.03) / 3);
      setTimeout(() => main.disconnect(), fade * 1000 + 1500);
    }
    T.bus = null;
    T.running = false;
    T.pauses.clear();
  },

  // Pauses stack by reason, so a hidden tab and the pause menu do not undo each other.
  pause(reason = 'user') {
    if (!T.running) return;
    if (!frozen()) T.pausedAt = clock();
    T.pauses.add(reason);
  },
  resume(reason = 'user') {
    if (!T.running || !T.pauses.delete(reason) || frozen()) return;
    T.t0 += clock() - T.pausedAt;
    T.nextBeat = Math.max(T.nextBeat, beatsAt(clock()));
    tick();
  },

  setBpm(bpm) {
    if (!T.running || bpm === T.bpm) return;
    const now = frozen() ? T.pausedAt : clock();
    const b = beatsAt(now);
    T.bpm = bpm;
    T.t0 = now - (b * 60) / bpm;
  },
  setLayers(layers) {
    T.layers = { ...layers };
    setLayerGains();
  },

  get playing() {
    return T.running;
  },
  get bpm() {
    return T.bpm;
  },
  get tag() {
    return T.running ? T.tag : '';
  },
  // Current beat for visuals that only need to pulse in time, or null when nothing is playing.
  beats() {
    if (!T.running) return null;
    return beatsAt(frozen() ? T.pausedAt : heardTime(performance.now()));
  },
  // Beat that was sounding at a given event timestamp. Used to judge key presses.
  heardBeats(perfMs = performance.now()) {
    return beatsAt(heardTime(perfMs));
  },

  // Play a sound right now (the player's own note, a miss thud).
  hit(sound, opts = {}) {
    if (!useAudio || !master) return;
    VOICES[sound]?.(ctx, master, ctx.currentTime, opts);
  },
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden) music.pause('hidden');
  else music.resume('hidden');
});
