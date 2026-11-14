// Scores key presses against a chart. Works in beats, with windows given in seconds so the
// game is equally strict at every tempo.
const WINDOW = { perfect: 0.06, good: 0.125, reach: 0.2 };
const POINTS = { perfect: 1, good: 0.7, held: 1 };

export function createJudge(chart, bpm) {
  const perBeat = 60 / bpm;
  const w = { perfect: WINDOW.perfect / perBeat, good: WINDOW.good / perBeat, reach: WINDOW.reach / perBeat };
  const counts = { perfect: 0, good: 0, miss: 0, held: 0 };
  let score = 0;
  let total = 0;

  const tally = (kind) => {
    total++;
    if (kind in POINTS) {
      score += POINTS[kind];
      counts[kind]++;
    } else counts.miss++;
  };
  const patternAt = (b) => chart.patterns.find((p) => b >= p.start && b < p.start + p.len);

  return {
    counts,
    get percent() {
      return total ? Math.round((score / total) * 100) : 0;
    },

    // A press at beat b. Returns what happened, or null if the press does not count.
    press(b) {
      const here = patternAt(b);
      // The oldest open note still in range wins, so a slightly late press on fast notes
      // is never mistaken for an early press on the next one.
      let best = null;
      let gap = Infinity;
      for (const t of chart.targets) {
        if (t.result || t.demo) continue;
        const d = Math.abs(b - t.beat);
        if (d <= w.good) {
          gap = d;
          best = t;
          break;
        }
        if (d < gap) {
          gap = d;
          best = t;
        }
      }
      if (best && gap <= w.reach) {
        const kind = gap <= w.perfect ? 'perfect' : gap <= w.good ? 'good' : b < best.beat ? 'early' : 'late';
        best.result = kind;
        tally(kind);
        return { kind, target: best, ms: Math.round((b - best.beat) * perBeat * 1000) };
      }
      if (!here || here.demo) return null; // count-in, demonstration, or after the last bar
      if (here.hold) {
        if (here.failed) return null;
        here.failed = true;
        tally('miss');
        return { kind: 'shipped' };
      }
      tally('miss');
      return { kind: 'stray' };
    },

    // Called every frame: anything the playhead has left behind is settled.
    update(b) {
      const out = [];
      for (const t of chart.targets) {
        if (!t.result && !t.demo && b > t.beat + w.reach) {
          t.result = 'miss';
          tally('miss');
          out.push({ kind: 'miss', target: t });
        }
      }
      for (const p of chart.patterns) {
        if (p.hold && !p.settled && b >= p.start + p.len) {
          p.settled = true;
          if (!p.failed) {
            tally('held');
            out.push({ kind: 'held' });
          }
        }
      }
      return out;
    },
  };
}
