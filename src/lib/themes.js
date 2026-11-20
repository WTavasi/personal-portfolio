// The hall's music: one piece split into stems, one per orchestra section, all playing in sync.
//
// How it is mixed:
// - Between sections every stem plays at a moderate level: the full theme, quietly.
// - Opening a section *features* it: its stem comes up to full and the others drop well under it,
//   so the harmony never cuts out but the chosen section clearly leads. The podium (About)
//   brings the whole orchestra up.
// - Every change lands on the beat (or on the next bar line when that is close), so sections
//   come in on cue instead of mid-phrase.
// - Everything goes through one bus and a limiter, so the full orchestra plus applause never clips.
// - Leaving the hall pauses the music and coming back picks it up where it left off.
//
// The files in src/assets/themes/ are generated placeholders. To use your own piece, replace them
// with your stems under the same names. Every stem must be the same length and tempo and loop
// cleanly; set BPM below to your piece's tempo so the conductor keeps time with it, and set
// MATCH_LOUDNESS to false so your own balance between the sections is kept.
import { audioOut } from './audio.js';
import { prepareApplause } from './applause.js';
export { prepareApplause };

export const BPM = 80;
export const BEATS_PER_BAR = 4;
const BEAT = 60 / BPM;
const BAR = BEAT * BEATS_PER_BAR;

export const STEMS = ['piano', 'strings', 'woodwinds', 'brass', 'percussion', 'choir'];
const FOCUS = {
  about: STEMS,
  experience: ['strings'],
  projects: ['woodwinds'],
  skills: ['brass'],
  certifications: ['percussion'],
  education: ['choir'],
};

// Mix levels, as gains applied after loudness matching.
const LEVEL = {
  idle: 0.5, // between sections: the whole orchestra, quietly
  full: 1, // About: everyone up
  featured: 1, // the open section
  under: 0.17, // everyone else while a section is featured (about -15 dB)
};

// The placeholder stems were rendered at quite different loudnesses (up to 9 dB apart), which
// made the volume jump between sections. Matching each stem to one loudness fixes that. Turn it
// off for a properly mixed piece, where the balance between sections is the composer's choice.
const MATCH_LOUDNESS = true;
const TARGET_RMS = 0.06; // about -24 dBFS per stem

// A change waits for the next beat; if the next bar line is this close, it waits for that instead.
const MIN_LEAD = 0.3; // seconds: never cut a change shorter than this
const BAR_IF_WITHIN = 1.5; // seconds

const FILES = import.meta.glob('../assets/themes/*.{mp3,m4a,ogg,wav}', { eager: true, query: '?url', import: 'default' });
const fileFor = (id) => {
  const key = Object.keys(FILES).find((k) => k.split('/').pop().replace(/\.\w+$/, '') === id);
  return key ? FILES[key] : null;
};

let decoded = null; // Promise of { name: { buffer, trim } }
let ctx = null;
let bus = null; // every stem and the applause go through here, then the limiter
let watching = false;
let set = null; // what is playing: { t0, length, sources, gains, stopping, timer }
let starting = null; // Promise while the first play() is waiting for the stems
let focus = null;
let resumeAt = 0; // position in the loop, in seconds, to pick up from after a pause

function rmsOf(buffer) {
  let sum = 0;
  let n = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i += 4) {
      sum += d[i] * d[i];
      n++;
    }
  }
  return Math.sqrt(sum / Math.max(1, n));
}

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
        const buffer = await dec.decodeAudioData(data);
        const rms = rmsOf(buffer);
        const trim = MATCH_LOUDNESS && rms > 1e-4 ? Math.min(4, Math.max(0.25, TARGET_RMS / rms)) : 1;
        return [name, { buffer, trim }];
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
  if (!bus) {
    // A gentle limiter: transparent at normal levels, it only catches peaks.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value = 4;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.2;
    bus = ctx.createGain();
    bus.gain.value = 0.8; // headroom for the limiter's own make-up gain
    bus.connect(limiter).connect(out);
  }
  if (!watching) {
    watching = true;
    // Pause with the tab; the stems stay in step because the whole clock stops.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend();
      else ctx.resume();
    });
  }
  return bus;
}

const levelFor = (name) => {
  if (!focus) return LEVEL.idle;
  if (focus === 'about') return LEVEL.full;
  return FOCUS[focus]?.includes(name) ? LEVEL.featured : LEVEL.under;
};

// Freeze a parameter at its current value so a new ramp starts from where it is.
function hold(param, t) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
  else {
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
  }
}

// When the next change should land: on the next beat, or on the next bar line if that is close.
function nextCue() {
  const now = ctx.currentTime;
  if (!set) return now + MIN_LEAD;
  const from = now + MIN_LEAD - set.t0;
  if (from <= 0) return set.t0; // still counting in: land on the downbeat
  const beat = set.t0 + Math.ceil(from / BEAT) * BEAT;
  const bar = set.t0 + Math.ceil(from / BAR) * BAR;
  return bar - now <= BAR_IF_WITHIN ? bar : beat;
}

function applyLevels() {
  if (!set) return;
  const now = ctx.currentTime;
  const at = nextCue();
  for (const [name, g] of Object.entries(set.gains)) {
    hold(g.gain, now);
    g.gain.linearRampToValueAtTime(levelFor(name) * set.trim[name], at);
  }
}

// A pause that has not finished fading yet can be called back without a second copy starting.
function revive() {
  clearTimeout(set.timer);
  set.stopping = false;
}

function start(stems, countIn) {
  const names = Object.keys(stems);
  const length = Math.min(...names.map((n) => stems[n].buffer.duration));
  const now = ctx.currentTime;
  const when = now + Math.max(0.05, countIn);
  const offset = ((resumeAt % length) + length) % length;
  const fresh = offset < 0.01;
  // Picking up mid-phrase fades in; a fresh start comes in cleanly on the downbeat.
  const fadeIn = fresh ? 0.06 : 0.9;
  const next = { t0: when - offset, length, sources: [], gains: {}, trim: {}, stopping: false, timer: 0 };
  for (const name of names) {
    const { buffer, trim } = stems[name];
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(levelFor(name) * trim, when + fadeIn);
    g.connect(bus);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(g);
    src.start(when, offset); // every stem starts on the same sample, so they stay locked together
    next.sources.push(src);
    next.gains[name] = g;
    next.trim[name] = trim;
  }
  set = next;
}

export const themes = {
  // Start the theme (or carry on with it) and set which section is in focus. `countIn` is how
  // long to wait before the downbeat, so the conductor can raise the baton and give the upbeat.
  async play(section = null, { countIn = 0.1 } = {}) {
    focus = section;
    if (set) {
      if (set.stopping) revive();
      return applyLevels();
    }
    if (starting) {
      await starting;
      return applyLevels();
    }
    if (!output()) return;
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
    starting = preloadThemes().then((stems) => {
      if (!set && Object.keys(stems).length) start(stems, countIn);
    });
    await starting;
    starting = null;
  },

  // Fade out and remember where the music was, so play() picks up from there.
  pause(fade = 0.8) {
    if (!set || !ctx || set.stopping) return;
    const now = ctx.currentTime;
    set.stopping = true;
    for (const g of Object.values(set.gains)) {
      hold(g.gain, now);
      g.gain.linearRampToValueAtTime(0, now + fade);
    }
    const was = set;
    was.timer = setTimeout(() => {
      if (set !== was || !was.stopping) return;
      resumeAt = ctx.currentTime - was.t0;
      for (const s of was.sources) s.stop();
      for (const g of Object.values(was.gains)) g.disconnect();
      set = null;
    }, (fade + 0.05) * 1000);
  },

  get playing() {
    return !!set && !set.stopping;
  },

  // Position in beats, for the conductor's baton: negative while counting in, null when nothing
  // is playing. Corrected for output latency so the baton lands with the sound, not before it.
  beats() {
    if (!set || set.stopping || !ctx || ctx.state !== 'running') return null;
    const latency = ctx.outputLatency || ctx.baseLatency || 0;
    return ((ctx.currentTime - latency - set.t0) * BPM) / 60;
  },

  // A round of applause with cheers, once every section has been explored. It plays over the
  // music, which carries on underneath.
  async applause() {
    if (!output()) return;
    const buffer = await prepareApplause();
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = 2.6; // the crowd sits just under the full orchestra
    src.connect(g).connect(bus);
    src.start(ctx.currentTime + 0.05);
  },
};
