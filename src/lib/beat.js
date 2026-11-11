// Visual beat clock. Every animated thing on the site reads from one of these so
// the whole page pulses in time. In the game (v0.2) the same class will be driven
// by the Web Audio clock instead of performance.now() so hits line up with sound.

export class BeatClock {
  constructor(bpm) {
    this.bpm = bpm;
    this.origin = performance.now();
  }

  // Change tempo without a visible jump: keep the current beat position.
  setBpm(bpm) {
    const now = performance.now();
    const beats = this.beats(now);
    this.bpm = bpm;
    this.origin = now - (beats * 60000) / bpm;
  }

  beats(now = performance.now()) {
    return ((now - this.origin) * this.bpm) / 60000;
  }

  // 1 right on the beat, decaying toward 0 before the next one.
  pulse(now = performance.now()) {
    const b = this.beats(now);
    return Math.exp(-(b - Math.floor(b)) * 5);
  }

  // 1 on the downbeat of each 4-beat bar, 0 otherwise-ish; used for accents.
  barPulse(now = performance.now()) {
    const b = this.beats(now);
    const inBar = b % 4;
    return inBar < 1 ? Math.exp(-(inBar) * 4) : 0;
  }
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Writes --beat (0..1), --bar (0..1) and --ring (degrees) onto `el` every frame.
export function startBeatLoop(clock, el) {
  let raf = 0;
  const still = reduceMotion();
  const tick = (now) => {
    el.style.setProperty('--beat', still ? '0' : clock.pulse(now).toFixed(3));
    el.style.setProperty('--bar', still ? '0' : clock.barPulse(now).toFixed(3));
    // One full turn of the ring every 32 beats, so it speeds up with the tempo.
    el.style.setProperty('--ring', `${still ? 0 : ((clock.beats(now) * 360) / 32) % 360}deg`);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
