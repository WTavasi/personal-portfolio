// Section themes. Every part of the hall has its own short looping piece.
//
// To use your own recording for a section, put an audio file in src/assets/themes/ named after
// the section, for example experience.mp3. It replaces the generated placeholder automatically.
// Names: hall, about, experience, projects, skills, education, finale (the full orchestra, once
// every section has been explored). mp3, m4a, ogg and wav all work. Files should loop cleanly.
import { audioOut } from './audio.js';

const FILES = import.meta.glob('../assets/themes/*.{mp3,m4a,ogg,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
});
const fileFor = (id) => {
  const key = Object.keys(FILES).find((k) => k.split('/').pop().replace(/\.\w+$/, '') === id);
  return key ? FILES[key] : null;
};

/* ------------------------------------------------------------------ voices */

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

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
function env(ctx, dest, t, attack, level, hold, release) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(level, t + attack);
  g.gain.setValueAtTime(level, t + Math.max(attack, hold));
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack, hold) + release);
  g.connect(dest);
  return g;
}
function vibrato(ctx, o, t, stop, rate = 5.4, cents = 7) {
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  lfo.frequency.value = rate;
  depth.gain.value = cents;
  lfo.connect(depth).connect(o.detune);
  lfo.start(t);
  lfo.stop(stop);
}
let noiseBuf = null;
function noise(ctx) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

const VOICES = {
  piano(ctx, dest, t, { midi, dur, vel }) {
    const len = Math.max(dur, 0.3) + 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    g.connect(lowpass(ctx, dest, 2800));
    osc(ctx, g, 'triangle', hz(midi), t, t + len);
    const g2 = ctx.createGain();
    g2.gain.value = 0.22;
    g2.connect(g);
    osc(ctx, g2, 'sine', hz(midi) * 2, t, t + len);
  },
  pad(ctx, dest, t, { midi, dur, vel }) {
    const g = env(ctx, lowpass(ctx, dest, 1300), t, Math.min(0.5, dur / 3), vel, dur, 0.7);
    for (const d of [-8, 8]) osc(ctx, g, 'sawtooth', hz(midi), t, t + dur + 0.8, d);
  },
  violin(ctx, dest, t, { midi, dur, vel }) {
    const g = env(ctx, lowpass(ctx, dest, 2600, 1.1), t, 0.09, vel, dur * 0.95, 0.25);
    const o = osc(ctx, g, 'sawtooth', hz(midi), t, t + dur + 0.3);
    vibrato(ctx, o, t, t + dur + 0.3);
  },
  cello(ctx, dest, t, { midi, dur, vel }) {
    const g = env(ctx, lowpass(ctx, dest, 1100, 0.9), t, 0.12, vel, dur * 0.95, 0.35);
    const o = osc(ctx, g, 'sawtooth', hz(midi), t, t + dur + 0.4);
    vibrato(ctx, o, t, t + dur + 0.4, 4.8, 6);
  },
  pizz(ctx, dest, t, { midi, vel }) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    g.connect(lowpass(ctx, dest, 1800));
    osc(ctx, g, 'triangle', hz(midi), t, t + 0.4);
  },
  flute(ctx, dest, t, { midi, dur, vel }) {
    const g = env(ctx, dest, t, 0.05, vel, dur * 0.85, 0.12);
    const o = osc(ctx, g, 'sine', hz(midi), t, t + dur + 0.2);
    vibrato(ctx, o, t, t + dur + 0.2, 5, 9);
    const b = ctx.createBufferSource();
    b.buffer = noise(ctx);
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = hz(midi) * 2;
    bf.Q.value = 6;
    const bg = env(ctx, g, t, 0.02, 0.25, 0.05, 0.1);
    b.connect(bf).connect(bg);
    b.start(t);
    b.stop(t + 0.2);
  },
  reed(ctx, dest, t, { midi, dur, vel }) {
    const g = env(ctx, lowpass(ctx, dest, 1800, 1.2), t, 0.04, vel, dur * 0.9, 0.12);
    const o = osc(ctx, g, 'square', hz(midi), t, t + dur + 0.2);
    vibrato(ctx, o, t, t + dur + 0.2, 5.2, 5);
  },
  brass(ctx, dest, t, { midi, dur, vel }) {
    const f = lowpass(ctx, dest, 700, 1);
    f.frequency.setValueAtTime(600, t);
    f.frequency.linearRampToValueAtTime(2400, t + 0.07);
    f.frequency.linearRampToValueAtTime(1300, t + dur);
    const g = env(ctx, f, t, 0.04, vel, dur * 0.9, 0.18);
    osc(ctx, g, 'sawtooth', hz(midi), t, t + dur + 0.3);
  },
  timp(ctx, dest, t, { midi = 38, vel }) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    g.connect(dest);
    const o = osc(ctx, g, 'sine', hz(midi) * 1.5, t, t + 1.15);
    o.frequency.exponentialRampToValueAtTime(hz(midi), t + 0.06);
  },
  organ(ctx, dest, t, { midi, dur, vel }) {
    const g = env(ctx, lowpass(ctx, dest, 3200), t, 0.12, vel, dur, 0.4);
    [1, 2, 3, 4, 6].forEach((h, i) => {
      const gg = ctx.createGain();
      gg.gain.value = [1, 0.5, 0.28, 0.2, 0.1][i];
      gg.connect(g);
      osc(ctx, gg, 'sine', hz(midi) * h, t, t + dur + 0.5);
    });
  },
};

/* ------------------------------------------------------- placeholder themes */

// Written in beats. Each theme is an 8-bar loop in D major so they sit together as one piece.
const CH = [
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
const n = (beat, dur, midi, vel, voice) => ({ beat, dur, midi, vel, voice });
const MELODY = [
  [0, 2, 78], [2, 1, 81], [3, 1, 78], [4, 2, 74], [6, 2, 78], [8, 1.5, 79], [9.5, 0.5, 78], [10, 1, 76],
  [11, 1, 74], [12, 3, 76], [16, 1, 78], [17, 1, 81], [18, 2, 86], [20, 2, 85], [22, 2, 81], [24, 1, 83],
  [25, 1, 81], [26, 1, 79], [27, 1, 78], [28, 1.5, 76], [29.5, 0.5, 78], [30, 2, 76],
];

function each(fn) {
  const out = [];
  CH.forEach((c, bar) => fn(out, c, bar * 4, BASS[bar], bar));
  return out;
}
const arpeggio = (out, c, b, vel) =>
  [c[0], c[2], c[1] + 12, c[2]].forEach((m, i) => out.push(n(b + i, 1, m, vel, 'piano')));

const THEMES = {
  // Between sections: soft piano and a string pad.
  hall: {
    bpm: 72,
    notes: each((o, c, b, bass) => {
      o.push(n(b, 4, bass, 0.22, 'piano'));
      arpeggio(o, c, b, 0.1);
      c.forEach((m) => o.push(n(b, 4, m + 12, 0.035, 'pad')));
    }),
  },
  // The podium: the whole ensemble, gently.
  about: {
    bpm: 80,
    notes: each((o, c, b, bass) => {
      o.push(n(b, 4, bass, 0.2, 'cello'));
      c.forEach((m) => o.push(n(b, 4, m + 12, 0.04, 'pad')));
      arpeggio(o, c, b, 0.09);
    }).concat(MELODY.map(([b, d, m]) => n(b, d, m, 0.12, 'flute'))),
  },
  // Strings: cellos below, violins singing the line, pizzicato in between.
  experience: {
    bpm: 88,
    notes: each((o, c, b, bass) => {
      o.push(n(b, 4, bass, 0.2, 'cello'));
      for (let i = 0; i < 8; i++) o.push(n(b + i / 2, 0.3, c[i % 3] + 12, 0.1, 'pizz'));
    }).concat(MELODY.map(([b, d, m]) => n(b, d, m, 0.09, 'violin'))),
  },
  // Woodwinds: a light, bouncing tune over clarinet arpeggios.
  projects: {
    bpm: 104,
    notes: each((o, c, b, bass) => {
      o.push(n(b, 2, bass + 12, 0.16, 'piano'));
      for (let i = 0; i < 8; i++) o.push(n(b + i / 2, 0.35, [c[0], c[1], c[2], c[1]][i % 4], 0.07, 'reed'));
    }).concat(MELODY.map(([b, d, m]) => n(b, Math.min(d, 0.75), m, 0.13, 'flute'))),
  },
  // Brass and timpani: a fanfare.
  skills: {
    bpm: 96,
    notes: each((o, c, b, bass, bar) => {
      for (const [off, d] of [
        [0, 1.5],
        [1.5, 0.5],
        [2, 2],
      ]) {
        c.forEach((m) => o.push(n(b + off, d, m, 0.07, 'brass')));
      }
      o.push(n(b, 4, bass - 12, 0.12, 'cello'));
      o.push({ beat: b, dur: 1, midi: bar % 2 ? 45 : 38, vel: 0.45, voice: 'timp' });
      if (bar % 4 === 3) o.push({ beat: b + 3, dur: 1, midi: 45, vel: 0.35, voice: 'timp' });
    }),
  },
  // Organ: slow chords over a pedal note.
  education: {
    bpm: 60,
    notes: each((o, c, b, bass) => {
      o.push(n(b, 4, bass - 12, 0.08, 'organ'));
      c.forEach((m) => o.push(n(b, 4, m, 0.035, 'organ')));
      o.push(n(b + 2, 2, c[2] + 12, 0.04, 'organ'));
    }),
  },
  // Every section explored: the whole orchestra together.
  finale: {
    bpm: 88,
    notes: each((o, c, b, bass, bar) => {
      o.push(n(b, 4, bass, 0.18, 'cello'));
      c.forEach((m) => o.push(n(b, 4, m + 12, 0.035, 'pad')));
      arpeggio(o, c, b, 0.08);
      if (bar % 2 === 0) c.forEach((m) => o.push(n(b, 1.5, m, 0.05, 'brass')));
      if (bar % 4 === 0) o.push({ beat: b, dur: 1, midi: 38, vel: 0.4, voice: 'timp' });
    })
      .concat(MELODY.map(([b, d, m]) => n(b, d, m, 0.08, 'violin')))
      .concat(MELODY.map(([b, d, m]) => n(b, d, m, 0.07, 'flute'))),
  },
};
const LOOP_BEATS = 32;

/* ------------------------------------------------------------------ player */

let ctx = null;
let watching = false;
let current = null; // { id, quiet, gain, stop() }
const buffers = new Map();

function output() {
  const out = audioOut();
  if (!out) return null;
  ctx = out.context;
  if (!watching) {
    watching = true;
    // Pause everything with the tab: timers are throttled in background tabs.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend();
      else ctx.resume();
    });
  }
  return out;
}

async function loadFile(url) {
  if (!buffers.has(url)) {
    buffers.set(
      url,
      fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
        .then((data) => ctx.decodeAudioData(data))
        .catch(() => null),
    );
  }
  return buffers.get(url);
}

function startSynth(def, dest) {
  const spb = 60 / def.bpm;
  const t0 = ctx.currentTime + 0.06;
  let next = 0;
  const tick = () => {
    const until = (ctx.currentTime + 0.25 - t0) / spb;
    for (let loop = Math.floor(next / LOOP_BEATS); loop * LOOP_BEATS < until; loop++) {
      for (const e of def.notes) {
        const b = loop * LOOP_BEATS + e.beat;
        if (b < next || b >= until) continue;
        VOICES[e.voice](ctx, dest, t0 + b * spb, { ...e, dur: e.dur * spb });
      }
    }
    next = until;
  };
  tick();
  const timer = setInterval(tick, 40);
  return () => clearInterval(timer);
}

export const themes = {
  // Crossfade to a theme. `quiet` is the background level used between sections.
  async play(id, { quiet = false, fade = 0.9 } = {}) {
    if (current?.id === id && current.quiet === quiet) return;
    const out = output();
    if (!out) return;
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
    if (current?.id === id) {
      current.quiet = quiet;
      current.gain.gain.setTargetAtTime(quiet ? 0.4 : 1, ctx.currentTime, fade / 3);
      return;
    }
    this.stop(fade);
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(out);
    const voice = { id, quiet, gain, stop: () => {} };
    current = voice;

    const url = fileFor(id);
    const buffer = url ? await loadFile(url) : null;
    if (current !== voice) return; // something else was chosen while the file loaded
    if (buffer) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(gain);
      src.start();
      voice.stop = (at) => src.stop(at);
    } else {
      const stopSynth = startSynth(THEMES[id] ?? THEMES.hall, gain);
      voice.stop = () => stopSynth();
    }
    gain.gain.setTargetAtTime(quiet ? 0.4 : 1, ctx.currentTime, fade / 3);
  },

  stop(fade = 0.9) {
    if (!current || !ctx) return;
    const { gain, stop } = current;
    current = null;
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0, t, fade / 3);
    stop(t + fade * 2);
    setTimeout(() => gain.disconnect(), fade * 2000 + 1500);
  },

  get playing() {
    return current?.id ?? null;
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
    for (let i = 0; i < seconds * 70; i++) {
      const t = t0 + Math.random() * seconds;
      const s = ctx.createBufferSource();
      s.buffer = noise(ctx);
      const e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.linearRampToValueAtTime(0.12 + Math.random() * 0.25, t + 0.003);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random() * 0.04);
      s.connect(e).connect(f);
      s.start(t, Math.random() * 1.5, 0.1);
    }
  },
};
