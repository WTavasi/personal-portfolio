// The concert programme. Each movement is a list of short patterns: the orchestra gives
// cues, the player answers on the beat with one button. Everything is written in beats,
// so the same charts work at 80, 120 and 160 BPM.
import { CHORDS } from '../lib/music.js';
import { getState } from '../lib/state.js';

export const PASS_MARK = 60; // per cent needed to clear a movement
const COUNT_IN = 4; // beats of clicks before the first pattern

// A note from the chord of a given song bar, climbing as i rises.
const tone = (bar, i) => CHORDS[bar % 8][i % 3] + 12 + 12 * Math.floor(i / 3);

/* I. Overture: echo. The call is one bar, the answer is the next bar. */
const ECHO_RHYTHMS = [
  [0, 2],
  [0, 2],
  [0, 1, 2],
  [0, 2, 3],
  [0, 1, 2, 3],
  [0, 2, 2.5, 3],
  [0, 1, 2],
  [0, 0.5, 1, 2],
  [0, 1, 2, 3],
  [0, 2],
];
function overturePatterns() {
  return ECHO_RHYTHMS.map((rhythm, k) => ({
    len: 8,
    demo: k === 0,
    label: k === 0 ? 'Watch: the bells call, then answer' : 'Listen, then play it back',
    sections: [
      { from: 0, to: 4, label: 'Listen' },
      { from: 4, to: 8, label: k === 0 ? 'Answer' : 'Play' },
    ],
    cues: rhythm.map((beat, i) => ({ beat, sound: 'bell', midi: tone(k * 2, i), vel: 0.34 })),
    hits: rhythm.map((beat, i) => ({ beat: 4 + beat, midi: tone(k * 2 + 1, i) })),
  }));
}

/* II. Pipeline: build, test, stage on beats 1 to 3, deploy on 4. A failed test means hold. */
const PIPELINE_ORDER = 'SSSSRSSRSTSTRSTSRTSS';
function pipelinePatterns() {
  let seenRed = false;
  let seenTwo = false;
  return [...PIPELINE_ORDER].map((type, k) => {
    if (type === 'R') {
      const first = !seenRed;
      seenRed = true;
      return {
        len: 4,
        hold: true,
        label: first ? 'A low buzz is a failed test. Do not deploy.' : 'Failed test: hold',
        cues: [
          { beat: 0, sound: 'bell', midi: 74, vel: 0.3, label: 'build' },
          { beat: 1, sound: 'buzz', kind: 'fail', label: 'failed' },
        ],
        hits: [],
      };
    }
    if (type === 'T') {
      const first = !seenTwo;
      seenTwo = true;
      return {
        len: 4,
        label: first ? 'A double chime means two releases: 3 and 4' : 'Two releases: 3 and 4',
        cues: [
          { beat: 0, sound: 'bell', midi: 74, vel: 0.3, label: 'build' },
          { beat: 1, sound: 'bell', midi: 78, vel: 0.3, label: 'test' },
          { beat: 1.5, sound: 'bell', midi: 81, vel: 0.3 },
        ],
        hits: [
          { beat: 2, midi: 81, label: 'deploy' },
          { beat: 3, midi: 86, label: 'deploy' },
        ],
      };
    }
    return {
      len: 4,
      demo: k === 0,
      label: k === 0 ? 'Watch: build, test, stage, deploy' : 'Build, test, stage: deploy on 4',
      cues: [
        { beat: 0, sound: 'bell', midi: 74, vel: 0.3, label: 'build' },
        { beat: 1, sound: 'bell', midi: 78, vel: 0.3, label: 'test' },
        { beat: 2, sound: 'bell', midi: 81, vel: 0.3, label: 'stage' },
      ],
      hits: [{ beat: 3, midi: 86, label: 'deploy' }],
    };
  });
}

export const MOVEMENTS = [
  {
    id: 'overture',
    numeral: 'I',
    title: 'Overture',
    topic: 'About me',
    layers: { piano: 1 },
    joins: 'The pianist takes the bench and the first of the audience find their seats.',
    howTo: [
      'The bells play a short rhythm for one bar.',
      'Play the same rhythm back in the next bar, one press per note.',
    ],
    patterns: overturePatterns,
  },
  {
    id: 'pipeline',
    numeral: 'II',
    title: 'Pipeline',
    topic: 'Cloud and DevOps',
    layers: { piano: 1, strings: 1 },
    requires: 'overture',
    joins: 'The strings take their seats and the hall is half full.',
    howTo: [
      'Three chimes are build, test and stage. Press on beat 4 to deploy.',
      'A low buzz is a failed test: do not press. A double chime means deploy on 3 and 4.',
    ],
    patterns: pipelinePatterns,
  },
  { id: 'balancer', numeral: 'III', title: 'Balancer', topic: 'Distributed systems', layers: {}, soon: true },
  { id: 'encore', numeral: 'IV', title: 'Encore', topic: 'Mobile and iOS', layers: {}, soon: true },
];

// Turn a movement into absolute beats: cue sounds for the music engine, targets for the judge.
export function buildChart(mv) {
  const patterns = [];
  const targets = [];
  const events = [];
  for (let i = 0; i < COUNT_IN; i++) events.push({ beat: i, sound: 'block', high: i === 0 });
  let beat = COUNT_IN;
  mv.patterns().forEach((p, index) => {
    const P = {
      index,
      start: beat,
      len: p.len,
      label: p.label,
      demo: !!p.demo,
      hold: !!p.hold,
      sections: p.sections ?? null,
      cues: p.cues.map((c) => ({ beat: beat + c.beat, kind: c.kind ?? 'cue', label: c.label })),
      targets: [],
    };
    p.cues.forEach((c) => events.push({ ...c, beat: beat + c.beat }));
    p.hits.forEach((h) => {
      const t = { beat: beat + h.beat, midi: h.midi, label: h.label, demo: P.demo, result: null };
      P.targets.push(t);
      targets.push(t);
      if (P.demo) events.push({ beat: t.beat, sound: 'bell', midi: h.midi, vel: 0.5 });
    });
    patterns.push(P);
    beat += p.len;
  });
  events.push({ beat, sound: 'chord', notes: [50, 62, 66, 69, 74], vel: 0.3, dur: 2 });
  return { patterns, targets, events, countIn: COUNT_IN, endBeat: beat, finishBeat: beat + 3 };
}

/* ------------------------------------------------------------ saved progress */

export const isCleared = (id) => (getState().cleared[id] ?? 0) >= PASS_MARK;
export const isOpen = (mv) => !mv.soon && (!mv.requires || isCleared(mv.requires));
export const nextMovement = () => MOVEMENTS.find((m) => isOpen(m) && !isCleared(m.id)) ?? null;

// Who is in the hall, and which sections play the hall music, for the movements cleared so far.
export function hallCast() {
  const o = isCleared('overture');
  const p = isCleared('pipeline');
  return { pianist: o, strings: p, winds: false, brass: false, audience: p ? 0.5 : o ? 0.25 : 0 };
}
export const hallLayers = () => ({ piano: 1, strings: isCleared('pipeline') ? 1 : 0 });
