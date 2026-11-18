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

// Browsers keep audio paused until the visitor interacts with the page. Sound that was set up
// before then (the tuning on the boot screen) starts on the first click, tap or key press.
const GESTURES = ['pointerdown', 'keydown', 'touchend'];
export function resumeOnGesture() {
  const wake = () => {
    GESTURES.forEach((g) => window.removeEventListener(g, wake, true));
    ensureAudio();
  };
  GESTURES.forEach((g) => window.addEventListener(g, wake, true));
}

// The shared output, created on first use.
export function audioOut() {
  return ensureAudio() ? master : null;
}

/* ---------- The orchestra tuning recording, played while the hall builds ---------- */

// The file starts with almost a second of silence and stops without a fade, so playback
// skips the silence and fades out over the last two seconds.
const TUNING = { offset: 0.85, level: 0.6, fadeIn: 0.25, fadeOut: 2 };
let tuningData = null; // Promise of the raw file, fetched while the hall loads
let tuningBuffer = null; // decoded audio, ready to play
let tuningVoice = null; // what is playing now, so it can be faded out
let tuningWanted = false;

// Start downloading the recording. Called during loading; the résumé page never calls it.
export function preloadTuning() {
  tuningData ??= fetch(tuningUrl)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .catch(() => null);
  return tuningData;
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
  src.onended = () => {
    if (tuningVoice?.src === src) tuningVoice = null;
  };
  src.start(t, TUNING.offset);
  tuningVoice = { src, gain };
  return length - TUNING.fadeOut;
}

// True while the tuning recording is playing or about to.
export const tuningActive = () => tuningWanted && !!tuningVoice;

// Fade the recording out, for example when leaving the menu or turning sound off.
export function stopTuning(seconds = 0.6) {
  tuningWanted = false;
  if (!tuningVoice || !ctx) return;
  const { src, gain } = tuningVoice;
  tuningVoice = null;
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
