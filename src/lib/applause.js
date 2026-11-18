// A full house applauding: many people clapping at their own pace, cheers, a few whistles and
// the roar of the room. Synthesised, not recorded, and rendered once in the background
// (offline rendering needs no user gesture), so playing it later costs nothing.

const SECONDS = 8.5;
const RATE = 44100;
let rendered = null; // Promise of an AudioBuffer

const rnd = (a, b) => a + Math.random() * (b - a);

// How loud the whole crowd is at time t: a quick swell, a long hold, a slow die-away.
const crowdLevel = (t) => Math.min(1, t / 0.7) * (t < 5.6 ? 1 : Math.max(0, 1 - (t - 5.6) / 2.6));

export function prepareApplause() {
  if (rendered) return rendered;
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) return (rendered = Promise.resolve(null));
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
  for (let v = 0; v < 22; v++) {
    const start = rnd(0.3, 5.2);
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
  for (let w = 0; w < 4; w++) {
    const start = rnd(0.6, 4.6);
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

  rendered = ctx.startRendering().catch(() => null);
  return rendered;
}
