// Web Audio helpers. Browsers only allow audio after a user gesture, so nothing here
// makes a sound until ensureAudio() is called from a key press or click.
import { getState, subscribe } from './state.js';
import tuningUrl from '../assets/audio/orchestra-tuning.mp3';

let ctx = null;
let master = null;

const level = () => (getState().sound ? getState().volume : 0);

export function ensureAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // Every sound on the site goes through this one gain, so sound and volume apply to all of it.
    master = ctx.createGain();
    master.gain.value = level();
    master.connect(ctx.destination);
    subscribe(() => master.gain.setTargetAtTime(level(), ctx.currentTime, 0.04));
  }
  if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
  return ctx;
}

// The shared output, created on first use.
export function audioOut() {
  return ensureAudio() ? master : null;
}

/* ---------- How loud something is playing, for the players' movement ---------- */

// A meter on a sound, read each frame. It listens before the volume control, so the orchestra
// keeps playing in step with the conductor when the sound is turned down.
const meterData = new Float32Array(2048);
export function meter(c) {
  const a = c.createAnalyser();
  a.fftSize = meterData.length;
  return a;
}
// How hard the players should be working, 0 to 1, from a meter: silent at `quiet` dB and below,
// full at `loud` dB and above.
export function effort(a, quiet, loud) {
  a.getFloatTimeDomainData(meterData);
  let sum = 0;
  for (let i = 0; i < meterData.length; i += 2) sum += meterData[i] * meterData[i];
  const db = 10 * Math.log10(sum / (meterData.length / 2) + 1e-12);
  return Math.min(1, Math.max(0, (db - quiet) / (loud - quiet)));
}

/* ---------- The orchestra tuning, with the audience talking, while the hall builds ---------- */

// The audience's chatter: any recording in src/assets/audio/ whose name contains "chatter",
// "dialogue" or "murmur" (for example hall-chatter.mp3). It loops quietly under the tuning and
// dies away with it, the way a hall hushes. Without a file, only the tuning plays.
const CHATTER_FILES = import.meta.glob('../assets/audio/*{chatter,dialogue,murmur}*.{mp3,m4a,ogg,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
});
const chatterUrl = Object.values(CHATTER_FILES)[0] ?? null;
const CHATTER = { level: 0.16, fadeIn: 1.2 };
let chatterData = null;
let chatterBuffer = null;
let chatterVoice = null;

// The file starts with almost a second of silence and stops without a fade, so playback
// skips the silence and fades out over the last two seconds.
const TUNING = { offset: 0.85, level: 0.6, fadeIn: 0.25, fadeOut: 2 };
let tuningData = null; // Promise of the raw file, fetched while the hall loads
let tuningBuffer = null; // decoded audio, ready to play
let tuningVoice = null; // what is playing now, so it can be faded out
let tuningWanted = false;
let tuningMeter = null; // the tuning (and its fallback A), not the audience's chatter
const tuningTap = (c) => (tuningMeter ??= meter(c));

const fetchAudio = (url) =>
  fetch(url)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .catch(() => null);

// Start downloading the recordings. Called while the first screen is idle; the résumé never does.
export function preloadTuning() {
  tuningData ??= fetchAudio(tuningUrl);
  if (chatterUrl) chatterData ??= fetchAudio(chatterUrl);
  return tuningData;
}

// The chatter under the tuning: in over `fadeIn`, held, then out over the tuning's last seconds.
async function playChatter(c, until, fadeOut) {
  if (!chatterUrl || chatterVoice) return;
  try {
    if (!chatterBuffer) {
      preloadTuning();
      const data = await chatterData;
      if (!data) return;
      chatterBuffer = await c.decodeAudioData(data.slice(0));
    }
  } catch {
    return;
  }
  if (!tuningWanted || !getState().sound || chatterVoice) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = chatterBuffer;
  src.loop = true;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(CHATTER.level, t + CHATTER.fadeIn);
  const end = Math.max(until, t + CHATTER.fadeIn + 0.1);
  gain.gain.setValueAtTime(CHATTER.level, Math.max(t + CHATTER.fadeIn, end - fadeOut));
  gain.gain.linearRampToValueAtTime(0, end);
  src.connect(gain).connect(master);
  src.start(t);
  src.stop(end + 0.05);
  src.onended = () => {
    if (chatterVoice?.src === src) chatterVoice = null;
  };
  chatterVoice = { src, gain };
}

// Resolves with the number of seconds until the recording starts to fade (0 if it is not playing),
// so the hall music can come in underneath it.
export async function playTuning() {
  if (!getState().sound) return 0;
  const c = ensureAudio();
  if (!c) return 0;
  tuningWanted = true;
  try {
    if (!tuningBuffer) {
      const data = await preloadTuning();
      if (!data) throw new Error('recording unavailable');
      tuningBuffer = await c.decodeAudioData(data.slice(0));
    }
  } catch {
    if (tuningWanted && getState().sound) playTuningA(); // fall back to a synthesised A
    return 0;
  }
  // The person may have left the menu or turned sound off while the file was decoding.
  if (!tuningWanted || !getState().sound || tuningVoice) return 0;

  const t = c.currentTime;
  const length = tuningBuffer.duration - TUNING.offset;
  const src = c.createBufferSource();
  src.buffer = tuningBuffer;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(TUNING.level, t + TUNING.fadeIn);
  gain.gain.setValueAtTime(TUNING.level, t + length - TUNING.fadeOut);
  gain.gain.linearRampToValueAtTime(0, t + length);
  src.connect(gain).connect(master);
  gain.connect(tuningTap(c));
  src.onended = () => {
    if (tuningVoice?.src === src) tuningVoice = null;
  };
  src.start(t, TUNING.offset);
  tuningVoice = { src, gain, startedAt: t };
  playChatter(c, t + length, TUNING.fadeOut);
  return length - TUNING.fadeOut;
}

// True while the tuning recording is playing or about to.
export const tuningActive = () => tuningWanted && !!tuningVoice;

// How hard the orchestra is tuning, 0 to 1, as it sounds (fading in and out with the recording).
// The recording sits around -20 dB.
export function tuningLevel() {
  if (!tuningMeter || ctx.state !== 'running') return 0;
  return effort(tuningMeter, -44, -23);
}

// Fade the recording out, for example when leaving the menu or turning sound off.
export function stopTuning(seconds = 0.6) {
  tuningWanted = false;
  if (!ctx) return;
  for (const voice of [tuningVoice, chatterVoice]) {
    if (!voice) continue;
    const { src, gain } = voice;
    const t = ctx.currentTime;
    const g = gain.gain;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t);
    else {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
    }
    g.linearRampToValueAtTime(0, t + seconds);
    src.stop(t + seconds + 0.05);
  }
  tuningVoice = null;
  chatterVoice = null;
}

// Fallback if the recording cannot load: a soft, oboe-like A4, the note orchestras tune to.
export function playTuningA() {
  if (!getState().sound) return;
  const c = ensureAudio();
  if (!c) return;
  const t = c.currentTime;

  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.18, t + 0.12);
  out.gain.setValueAtTime(0.18, t + 0.9);
  out.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);

  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;

  out.connect(lp).connect(master);
  lp.connect(tuningTap(c));

  // A few harmonics with a gentle vibrato give a reedy tone without samples.
  [
    [440, 'triangle', 1],
    [880, 'sine', 0.35],
    [1320, 'sine', 0.12],
  ].forEach(([freq, type, amp]) => {
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = amp;
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.2;
    const lfoGain = c.createGain();
    lfoGain.gain.value = freq * 0.004;
    lfo.connect(lfoGain).connect(osc.frequency);
    osc.connect(g).connect(out);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 2.3);
    lfo.stop(t + 2.3);
  });
}

// Short woodblock-style click for menu moves and selections.
export function playClick(high = false) {
  if (!getState().sound) return;
  const c = ensureAudio();
  if (!c) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(high ? 1200 : 820, t);
  g.gain.setValueAtTime(0.05, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + 0.07);
}
