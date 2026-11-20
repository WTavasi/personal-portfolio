// A full house applauding: many people clapping at their own pace, cheers, a few whistles and
// the roar of the room. Synthesised, not recorded, and rendered in the background (offline
// rendering needs no user gesture), so playing it later costs nothing.
//
// Two recordings are made: the ovation (a swell, a long hold and a die-away), and a steady
// applause that loops without a seam, which carries on after the ovation for as long as the
// visitor stays in the hall.

const RATE = 44100;
const OVATION = 8.5;
const LOOP = 9;
const SEAM = 1.2; // seconds crossfaded where the loop joins itself
let ovation = null; // Promise of an AudioBuffer
let loop = null;

const rnd = (a, b) => a + Math.random() * (b - a);

// The ovation: a quick swell, a long hold, a slow die-away.
const ovationLevel = (t) => Math.min(1, t / 0.7) * (t < 5.6 ? 1 : Math.max(0, 1 - (t - 5.6) / 2.6));

export function prepareApplause() {
  ovation ??= renderCrowd({ seconds: OVATION, crowdLevel: ovationLevel, cheers: 22, whistles: 4, from: 0.3, to: 5.2 });
  return ovation;
}

// Steady applause with the odd cheer. Rendered a little long, then the extra tail is crossfaded
// over the start so the end runs straight into the beginning.
export function prepareApplauseLoop() {
  loop ??= renderCrowd({ seconds: LOOP + SEAM, crowdLevel: () => 1, cheers: 5, whistles: 1, from: 0.4, to: LOOP - 1 }).then(
    (b) => {
      if (!b) return null;
      const n = Math.round(LOOP * RATE);
      const seam = Math.round(SEAM * RATE);
      const out = new AudioBuffer({ numberOfChannels: b.numberOfChannels, length: n, sampleRate: RATE });
      for (let c = 0; c < b.numberOfChannels; c++) {
        const src = b.getChannelData(c);
        const dst = out.getChannelData(c);
        dst.set(src.subarray(0, n));
        for (let i = 0; i < seam; i++) {
          const w = i / seam; // equal-power crossfade from the tail into the head
          dst[i] = src[i] * Math.sin((w * Math.PI) / 2) + src[n + i] * Math.cos((w * Math.PI) / 2);
        }
      }
      return out;
    },
  );
  return loop;
}

// Render a crowd: `seconds` long, `crowdLevel(t)` its loudness over time (0 to 1), with `cheers`
// voices and `whistles` scattered between `from` and `to` seconds.
function renderCrowd({ seconds: SECONDS, crowdLevel, cheers, whistles, from, to }) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) return Promise.resolve(null);
  const ctx = new Offline(2, Math.round(SECONDS * RATE), RATE);

  // The room: a short noise-tail reverb shared by everything.
  const ir = ctx.createBuffer(2, Math.round(1.8 * RATE), RATE);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (0.42 * RATE));
  }
  const verb = ctx.createConvolver();
  verb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  verb.connect(wet).connect(ctx.destination);
  const dry = ctx.createGain();
  dry.gain.value = 0.8;
  dry.connect(ctx.destination);
  dry.connect(verb);

  // A few clap sounds: a burst of noise that dies away within a few hundredths of a second.
  const claps = Array.from({ length: 6 }, () => {
    const len = Math.round(0.07 * RATE);
    const b = ctx.createBuffer(1, len, RATE);
    const d = b.getChannelData(0);
    const decay = rnd(0.008, 0.016) * RATE;
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / decay) * Math.min(1, i / 30);
    return b;
  });

  // Clappers: each with their own hands (a filter), seat (a pan), pace and loudness.
  for (let p = 0; p < 70; p++) {
    const tone = ctx.createBiquadFilter();
    tone.type = 'bandpass';
    tone.frequency.value = rnd(900, 2600);
    tone.Q.value = rnd(0.6, 1.4);
    const pan = ctx.createStereoPanner();
    pan.pan.value = rnd(-0.9, 0.9);
    const level = ctx.createGain();
    level.gain.value = rnd(0.05, 0.13);
    tone.connect(pan).connect(level).connect(dry);
    const gap = 1 / rnd(3.6, 5.6);
    let t = rnd(0, 0.6);
    while (t < SECONDS) {
      const loud = crowdLevel(t);
      if (loud > 0.02 && Math.random() < 0.3 + 0.7 * loud) {
        const src = ctx.createBufferSource();
        src.buffer = claps[Math.floor(Math.random() * claps.length)];
        src.playbackRate.value = rnd(0.85, 1.2);
        const g = ctx.createGain();
        g.gain.value = loud * rnd(0.6, 1);
        src.connect(g).connect(tone);
        src.start(t);
      }
      t += gap * rnd(0.88, 1.12);
    }
  }

  // The roar: broadband room noise following the crowd's level.
  {
    const len = Math.round(SECONDS * RATE);
    const b = ctx.createBuffer(1, len, RATE);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = b;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 700;
    band.Q.value = 0.5;
    const g = ctx.createGain();
    for (let t = 0; t <= SECONDS; t += 0.1) g.gain.setValueAtTime(0.05 * crowdLevel(t), t);
    src.connect(band).connect(g).connect(dry);
    src.start(0);
  }

  // Cheers: a voice rising and falling through a vowel ("woo", "yeah", "hey").
  const VOWELS = [
    [
      [330, 0.9],
      [800, 0.5],
    ],
    [
      [620, 0.9],
      [1700, 0.5],
    ],
    [
      [700, 0.9],
      [1150, 0.6],
    ],
  ];
  for (let v = 0; v < cheers; v++) {
    const start = rnd(from, to);
    const dur = rnd(0.55, 1.2);
    const low = Math.random() < 0.5;
    const f0 = low ? rnd(120, 180) : rnd(230, 340);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, start);
    osc.frequency.linearRampToValueAtTime(f0 * rnd(1.5, 1.9), start + dur * 0.35);
    osc.frequency.linearRampToValueAtTime(f0 * rnd(1.0, 1.25), start + dur);
    const vib = ctx.createOscillator();
    vib.frequency.value = rnd(5, 7);
    const vibAmt = ctx.createGain();
    vibAmt.gain.value = f0 * 0.02;
    vib.connect(vibAmt).connect(osc.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(rnd(0.05, 0.09), start + 0.08);
    env.gain.setValueAtTime(rnd(0.05, 0.08), start + dur * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    const pan = ctx.createStereoPanner();
    pan.pan.value = rnd(-0.8, 0.8);
    const voice = ctx.createGain();
    voice.gain.value = 1;
    for (const [freq, gain] of VOWELS[Math.floor(Math.random() * VOWELS.length)]) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq * (low ? 0.9 : 1.1);
      f.Q.value = 6;
      const g = ctx.createGain();
      g.gain.value = gain * 3;
      osc.connect(f).connect(g).connect(env);
    }
    env.connect(pan).connect(voice).connect(dry);
    osc.start(start);
    vib.start(start);
    osc.stop(start + dur + 0.05);
    vib.stop(start + dur + 0.05);
  }

  // Whistles: a bright rising pitch with a fast warble.
  for (let w = 0; w < whistles; w++) {
    const start = rnd(from + 0.3, to - 0.6);
    const dur = rnd(0.6, 1.0);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(rnd(1500, 1900), start);
    osc.frequency.linearRampToValueAtTime(rnd(2500, 3000), start + dur * 0.4);
    osc.frequency.linearRampToValueAtTime(rnd(2100, 2500), start + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(0.035, start + 0.05);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    const pan = ctx.createStereoPanner();
    pan.pan.value = rnd(-0.7, 0.7);
    osc.connect(env).connect(pan).connect(dry);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  return ctx.startRendering().catch(() => null);
}
