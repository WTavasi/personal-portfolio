import { person, experience, projects, skills } from '../content.js';
import { getState, getTempo, setState } from '../lib/state.js';
import { ensureAudio } from '../lib/audio.js';
import { music } from '../lib/music.js';
import { MOVEMENTS, PASS_MARK, buildChart, isCleared, isOpen, hallCast } from '../game/movements.js';
import { createJudge } from '../game/judge.js';
import { playHallMusic } from '../game/hallmusic.js';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const FEEDBACK = {
  perfect: 'Perfect',
  good: 'Good',
  early: 'Early',
  late: 'Late',
  miss: 'Missed',
  stray: 'Not yet',
  shipped: 'Deployed a failed build',
  held: 'Held',
};
const CAL_BPM = 100;
const CAL_TAPS = 12;
// Debug aid: add ?autoplay to the address and the game plays itself perfectly.
const AUTOPLAY = new URLSearchParams(location.search).has('autoplay');
const DEBUG = new URLSearchParams(location.search).has('stats');

// What each cleared movement tells the visitor, taken from the same content as the résumé.
function programNote(id) {
  if (id === 'overture') {
    return [person.description, person.availability, person.musicLine].map((t) => `<p>${esc(t)}</p>`).join('');
  }
  const cloud = skills.find(([k]) => k === 'Cloud and DevOps');
  const intern = experience.find((e) => e.org.startsWith('Delta'));
  const k8s = projects.find((p) => p.name.startsWith('Kubernetes'));
  return [
    cloud && `<p>${esc(cloud[1])}.</p>`,
    intern && `<p>${esc(intern.role)}, ${esc(intern.org)}: ${esc(intern.bullets[1])}</p>`,
    k8s && `<p>${esc(k8s.bullets[0])}</p>`,
  ]
    .filter(Boolean)
    .join('');
}

export function concertScreen({ go, world }) {
  const el = document.createElement('section');
  el.className = 'screen concert';
  el.setAttribute('aria-label', 'The concert');
  el.innerHTML = `
    <div class="scrim scrim-top" aria-hidden="true"></div>
    <div class="scrim scrim-bottom" aria-hidden="true"></div>
    <header class="home-top">
      <div class="wordmark">
        <h1 data-bind="title">The concert</h1>
        <p data-bind="sub"></p>
      </div>
      <button class="btn btn-secondary hud-pause" data-act="pause" hidden>Pause</button>
    </header>

    <div class="hud" hidden>
      <p class="hud-feedback" data-bind="feedback" aria-hidden="true"></p>
      <div class="panel hud-panel">
        <div class="hud-row">
          <p class="hud-label" data-bind="label"></p>
          <p class="hud-stats"><span data-bind="count"></span><span data-bind="pct"></span></p>
        </div>
        <canvas class="track" aria-hidden="true"></canvas>
        <p class="hud-keys">Press Space or Enter, click or tap on the beat. Esc pauses.</p>
      </div>
    </div>

    <div class="panel card" data-bind="card"></div>
    <p class="sr-only" aria-live="polite" data-bind="live"></p>
  `;

  const $ = (s) => el.querySelector(s);
  const card = $('[data-bind="card"]');
  const hud = $('.hud');
  const pauseBtn = $('.hud-pause');
  const live = $('[data-bind="live"]');
  const canvas = $('.track');
  const g = canvas.getContext('2d');

  let view = 'select';
  let run = null; // the movement being played
  let cal = null; // calibration in progress
  let raf = 0;
  let colors = null;

  function header(title, sub) {
    $('[data-bind="title"]').textContent = title;
    $('[data-bind="sub"]').textContent = sub;
  }
  function showCard(html, focus = '.btn-primary') {
    card.innerHTML = html;
    card.hidden = false;
    card.querySelector(focus)?.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------- the views */

  function showSelect() {
    view = 'select';
    run = null;
    hud.hidden = true;
    pauseBtn.hidden = true;
    world.api?.setMode('podium');
    world.api?.setCast(hallCast());
    playHallMusic();
    const t = getTempo();
    header('The concert', `${t.name}, ${t.bpm} BPM`);
    const rows = MOVEMENTS.map((m) => {
      const best = getState().cleared[m.id];
      const required = MOVEMENTS.find((x) => x.id === m.requires);
      let status = 'Play';
      if (m.soon) status = 'In rehearsal';
      else if (!isOpen(m)) status = `Clear ${required.title} first`;
      else if (isCleared(m.id)) status = `Cleared, best ${best}%`;
      else if (best != null) status = `Best ${best}%, ${PASS_MARK}% clears it`;
      return `
        <li>
          <button class="mv" data-mv="${m.id}" ${isOpen(m) ? '' : 'aria-disabled="true"'}>
            <span class="mv-num">${m.numeral}</span>
            <span class="mv-name"><span class="mv-title">${m.title}</span><span class="mv-topic">${m.topic}</span></span>
            <span class="mv-status">${status}</span>
          </button>
        </li>`;
    }).join('');
    showCard(
      `
      <h2 class="card-h">Four movements, one for each part of my work</h2>
      <ol class="mv-list">${rows}</ol>
      <div class="card-actions">
        <button class="btn btn-secondary" data-act="calibrate">Calibrate timing</button>
        <button class="btn btn-secondary" data-act="hall">Back to hall</button>
      </div>`,
      '.mv:not([aria-disabled])',
    );
  }

  function showIntro(mv) {
    view = 'intro';
    run = { mv };
    header(`${mv.numeral}. ${mv.title}`, mv.topic);
    showCard(`
      <h2 class="card-h">How to play</h2>
      <ul class="card-list">${mv.howTo.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
      <p class="card-note">One button: Space, Enter, a click or a tap. The first round is played for you.</p>
      <div class="card-actions">
        <button class="btn btn-primary" data-act="start">Start</button>
        <button class="btn btn-secondary" data-act="select">Back</button>
      </div>`);
  }

  async function startRun(mv) {
    const { bpm } = getTempo();
    const chart = buildChart(mv);
    run = { mv, chart, bpm, judge: createJudge(chart, bpm), paused: false, lastLabel: null };
    if (DEBUG) Object.assign(window, { __run: run, __music: music });
    view = 'play';
    card.hidden = true;
    hud.hidden = false;
    pauseBtn.hidden = false;
    document.activeElement?.blur?.();
    header(`${mv.numeral}. ${mv.title}`, mv.topic);
    setFeedback('');
    world.api?.setMode('play');
    ensureAudio();
    await music.start({
      tag: 'game',
      bpm,
      layers: mv.layers,
      level: 0.7,
      events: chart.events,
      songOffset: chart.countIn,
      songEnd: chart.endBeat,
    });
    live.textContent = `${mv.title} started.`;
  }

  function pauseRun() {
    if (view !== 'play' || run.paused) return;
    run.paused = true;
    music.pause('game');
    pauseBtn.hidden = true;
    showCard(`
      <h2 class="card-h">Paused</h2>
      <div class="card-actions">
        <button class="btn btn-primary" data-act="resume">Resume</button>
        <button class="btn btn-secondary" data-act="restart">Restart</button>
        <button class="btn btn-secondary" data-act="select">Leave movement</button>
      </div>`);
  }
  function resumeRun() {
    if (view !== 'play' || !run.paused) return;
    run.paused = false;
    card.hidden = true;
    pauseBtn.hidden = false;
    document.activeElement?.blur?.();
    music.resume('game');
  }

  function finishRun() {
    const { mv, judge } = run;
    const pct = judge.percent;
    const passed = pct >= PASS_MARK;
    const before = getState().cleared[mv.id] ?? -1;
    const firstClear = passed && before < PASS_MARK;
    if (pct > before) setState({ cleared: { ...getState().cleared, [mv.id]: pct } });
    view = 'results';
    hud.hidden = true;
    pauseBtn.hidden = true;
    music.stop(1.2);
    world.api?.setMode('podium');
    world.api?.setCast(hallCast());
    setTimeout(() => view === 'results' && playHallMusic(), 1400);

    const c = judge.counts;
    const stats = [`Perfect ${c.perfect}`, `Good ${c.good}`, c.held ? `Held ${c.held}` : '', `Missed ${c.miss}`]
      .filter(Boolean)
      .join(' · ');
    const next = MOVEMENTS[MOVEMENTS.findIndex((m) => m.id === mv.id) + 1];
    const nextOpen = next && isOpen(next);
    if (passed) {
      showCard(`
        <h2 class="card-h">${pct}%. ${mv.title} cleared</h2>
        <p class="card-stats">${stats}</p>
        ${firstClear ? `<p>${esc(mv.joins)}</p>` : ''}
        <div class="note">
          <h3>${esc(mv.topic)}</h3>
          ${programNote(mv.id)}
        </div>
        <div class="card-actions">
          ${
            nextOpen
              ? `<button class="btn btn-primary" data-mv="${next.id}">Next: ${next.numeral}. ${next.title}</button>`
              : `<button class="btn btn-primary" data-act="hall">Back to hall</button>`
          }
          <button class="btn btn-secondary" data-act="again">Play again</button>
          <button class="btn btn-secondary" data-act="resume-page">View résumé</button>
        </div>
        ${nextOpen ? '' : '<p class="card-note">Movements III and IV are still in rehearsal.</p>'}`);
    } else {
      showCard(`
        <h2 class="card-h">${pct}%. ${PASS_MARK}% clears ${mv.title}</h2>
        <p class="card-stats">${stats}</p>
        <p>If every press reads Early or Late, calibrate your timing. A slower tempo in the hall also helps.</p>
        <div class="card-actions">
          <button class="btn btn-primary" data-act="again">Try again</button>
          <button class="btn btn-secondary" data-act="calibrate">Calibrate timing</button>
          <button class="btn btn-secondary" data-act="select">Back</button>
        </div>`);
    }
    live.textContent = passed ? `${mv.title} cleared with ${pct} per cent.` : `${pct} per cent. ${PASS_MARK} clears it.`;
  }

  /* ------------------------------------------------------------ calibration */

  function showCalibrate(result = null) {
    view = 'calibrate';
    hud.hidden = true;
    header('Calibrate timing', 'Screens, speakers and Bluetooth all add delay');
    const now = getState().latencyMs;
    if (result === null) {
      cal = { taps: [] };
      music.start({
        tag: 'calibrate',
        bpm: CAL_BPM,
        layers: {},
        events: Array.from({ length: 240 }, (_, i) => ({ beat: i, sound: 'block', high: i % 4 === 0 })),
      });
      showCard(
        `
        <h2 class="card-h">Tap along with the click</h2>
        <p>Press Space or Enter, or click, on every click you hear. ${CAL_TAPS} taps is enough.</p>
        <p class="card-stats" data-bind="taps">0 / ${CAL_TAPS}</p>
        <div class="card-actions">
          <button class="btn btn-secondary" data-act="cal-done">Cancel</button>
        </div>
        <p class="card-note">Current setting: ${now} ms.</p>`,
        'none',
      );
      document.activeElement?.blur?.();
    } else {
      cal = null;
      music.stop(0.2);
      const where = result === 0 ? 'right on the click' : `${Math.abs(result)} ms ${result > 0 ? 'after' : 'before'} the click`;
      showCard(`
        <h2 class="card-h">Your taps land ${where}</h2>
        <p>Saved. The game now allows for that when it judges your timing.</p>
        <div class="card-actions">
          <button class="btn btn-primary" data-act="cal-done">Done</button>
          <button class="btn btn-secondary" data-act="calibrate">Try again</button>
          <button class="btn btn-secondary" data-act="cal-reset">Reset to 0 ms</button>
        </div>`);
      live.textContent = `Saved ${result} milliseconds.`;
    }
  }

  function calTap(ts) {
    const b = music.heardBeats(ts);
    if (b < 1) return;
    cal.taps.push((b - Math.round(b)) * (60 / CAL_BPM));
    music.hit('block', { vel: 0.2, high: true });
    const out = card.querySelector('[data-bind="taps"]');
    if (out) out.textContent = `${Math.min(cal.taps.length, CAL_TAPS)} / ${CAL_TAPS}`;
    if (cal.taps.length >= CAL_TAPS) {
      const kept = cal.taps.slice(2).sort((a, b2) => a - b2); // the first taps are people finding the beat
      const median = (kept[4] + kept[5]) / 2;
      const ms = Math.max(-150, Math.min(300, Math.round(median * 1000)));
      setState({ latencyMs: ms });
      showCalibrate(ms);
    }
  }

  /* ------------------------------------------------------------------ input */

  function setFeedback(kind) {
    const out = $('[data-bind="feedback"]');
    out.textContent = FEEDBACK[kind] ?? '';
    out.dataset.kind = kind;
    out.classList.remove('pop');
    void out.offsetWidth; // restart the pop
    if (kind) out.classList.add('pop');
  }

  function react(res) {
    if (!res) return;
    setFeedback(res.kind);
    if (res.kind === 'perfect' || res.kind === 'good') {
      music.hit('bell', { midi: res.target.midi, vel: 0.5 });
      world.api?.flash(res.kind === 'perfect' ? 1 : 0.5);
    } else if (res.kind === 'early' || res.kind === 'late') {
      music.hit('bell', { midi: res.target.midi, vel: 0.2 });
    } else if (res.kind === 'stray' || res.kind === 'shipped') {
      music.hit('thud');
    } else if (res.kind === 'held') {
      world.api?.flash(0.5);
    }
  }

  // The beat the player meant: what they heard when they pressed, minus their calibrated delay.
  const pressBeat = (ts) => music.heardBeats(ts) - ((getState().latencyMs / 1000) * run.bpm) / 60;

  function press(ts) {
    if (view === 'calibrate' && cal) calTap(ts);
    else if (view === 'play' && !run.paused && !AUTOPLAY) react(run.judge.press(pressBeat(ts)));
  }

  const onKey = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (view === 'play') run.paused ? resumeRun() : pauseRun();
      else if (view === 'calibrate') leaveCalibrate();
      return;
    }
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (e.target.closest?.('button, a')) return; // let buttons behave like buttons
    if ((view === 'play' && !run.paused) || (view === 'calibrate' && cal)) {
      e.preventDefault();
      if (!e.repeat) press(e.timeStamp);
    }
  };
  const onPointer = (e) => {
    if (e.target.closest('button, a, .card')) return;
    if ((view === 'play' && !run.paused) || (view === 'calibrate' && cal)) press(e.timeStamp);
  };
  const onHidden = () => document.hidden && pauseRun();

  function leaveCalibrate() {
    cal = null;
    music.stop(0.2);
    if (run?.mv) showIntro(run.mv);
    else showSelect();
  }

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.getAttribute('aria-disabled') === 'true') return;
    const mv = MOVEMENTS.find((m) => m.id === btn.dataset.mv);
    if (mv) return showIntro(mv);
    switch (btn.dataset.act) {
      case 'start':
      case 'again':
      case 'restart':
        return startRun(run.mv);
      case 'pause':
        return pauseRun();
      case 'resume':
        return resumeRun();
      case 'select':
        if (music.tag !== 'hall') music.stop(0.4);
        return showSelect();
      case 'calibrate':
        return showCalibrate();
      case 'cal-done':
        return leaveCalibrate();
      case 'cal-reset':
        setState({ latencyMs: 0 });
        return leaveCalibrate();
      case 'hall':
        return go('home');
      case 'resume-page':
        return go('resume');
    }
  });

  /* ---------------------------------------------------------------- drawing */

  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [w, h];
  }

  function cross(x, y, r) {
    g.beginPath();
    g.moveTo(x - r, y - r);
    g.lineTo(x + r, y + r);
    g.moveTo(x + r, y - r);
    g.lineTo(x - r, y + r);
    g.stroke();
  }

  function drawTrack(P, hb) {
    const [w, h] = sizeCanvas();
    const c = colors;
    const pad = 30;
    const y = 34;
    const x = (b) => pad + ((b - P.start) / P.len) * (w - pad * 2);
    g.clearRect(0, 0, w, h);
    g.font = '600 13px "Figtree Variable", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    g.strokeStyle = c.line;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x(P.start), y);
    g.lineTo(x(P.start + P.len), y);
    g.stroke();
    for (let i = 0; i <= P.len; i++) {
      const bx = x(P.start + i);
      const tall = i % 4 === 0;
      g.beginPath();
      g.moveTo(bx, y - (tall ? 12 : 6));
      g.lineTo(bx, y + (tall ? 12 : 6));
      g.stroke();
    }
    const named = new Set();
    const caption = (b, text, color) => {
      g.fillStyle = color;
      g.fillText(text, x(b), y + 30);
      named.add(b);
    };

    for (const cue of P.cues) {
      const cx = x(cue.beat);
      const on = hb >= cue.beat;
      g.lineWidth = 2;
      g.strokeStyle = on ? c.text : c.text2;
      g.fillStyle = on ? c.text : c.surface;
      if (cue.kind === 'fail') {
        g.lineWidth = 3;
        cross(cx, y, 7);
      } else if (cue.kind === 'count') {
        g.beginPath();
        g.arc(cx, y, 5, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      } else {
        g.beginPath();
        g.moveTo(cx, y - 8);
        g.lineTo(cx + 8, y);
        g.lineTo(cx, y + 8);
        g.lineTo(cx - 8, y);
        g.closePath();
        g.fill();
        g.stroke();
      }
      if (cue.label) caption(cue.beat, cue.label, on ? c.text : c.text2);
    }

    for (const t of P.targets) {
      const tx = x(t.beat);
      const res = t.demo ? (hb >= t.beat ? 'perfect' : null) : t.result;
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(tx, y, 11, 0, Math.PI * 2);
      if (res === 'perfect' || res === 'good') {
        g.fillStyle = res === 'perfect' ? c.accent : c.text;
        g.fill();
      } else {
        g.fillStyle = c.surface;
        g.fill();
        g.strokeStyle = res ? c.text3 : c.accent;
        g.stroke();
        if (res) cross(tx, y, 4);
      }
      if (t.label) caption(t.beat, t.label, c.accent);
    }

    // Beat numbers where nothing else is written, section names underneath
    g.font = '500 13px "Figtree Variable", system-ui, sans-serif';
    if (!P.sections) {
      for (let i = 0; i < P.len; i++) {
        if (named.has(P.start + i)) continue;
        g.fillStyle = c.text3;
        g.fillText(String((i % 4) + 1), x(P.start + i), y + 30);
      }
    } else {
      for (const s of P.sections) {
        g.fillStyle = hb >= P.start + s.from && hb < P.start + s.to ? c.text : c.text3;
        g.fillText(s.label, x(P.start + (s.from + s.to) / 2), y + 30);
      }
    }

    const px = x(Math.max(P.start, Math.min(P.start + P.len, hb)));
    g.strokeStyle = c.text;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(px, y - 22);
    g.lineTo(px, y + 22);
    g.stroke();
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    if (view !== 'play' || !run.chart || run.paused || !music.playing) return;
    const { chart, judge } = run;
    const hb = music.heardBeats() - ((getState().latencyMs / 1000) * run.bpm) / 60;

    if (AUTOPLAY) {
      for (const t of chart.targets) if (!t.result && !t.demo && hb >= t.beat) react(judge.press(t.beat));
    }
    for (const res of judge.update(hb)) react(res);

    let P = chart.patterns.find((p) => hb < p.start + p.len) ?? chart.patterns[chart.patterns.length - 1];
    if (hb < chart.countIn) {
      P = {
        start: 0,
        len: chart.countIn,
        label: 'Count-in',
        cues: Array.from({ length: chart.countIn }, (_, i) => ({ beat: i, kind: 'count' })),
        targets: [],
        index: -1,
      };
    }
    if (P !== run.lastLabel) {
      run.lastLabel = P;
      $('[data-bind="label"]').textContent = P.label;
      $('[data-bind="count"]').textContent = `${Math.max(1, P.index + 1)} / ${chart.patterns.length}`;
    }
    $('[data-bind="pct"]').textContent = `${judge.percent}%`;
    drawTrack(P, hb);
    if (hb >= chart.finishBeat) finishRun();
  }

  return {
    el,
    title: `The concert | ${person.name}`,
    mount() {
      const css = getComputedStyle(document.documentElement);
      const v = (n) => css.getPropertyValue(n).trim();
      colors = {
        text: v('--text'),
        text2: v('--text-2'),
        text3: v('--text-3'),
        accent: v('--accent'),
        line: v('--line'),
        surface: v('--surface'),
      };
      world.show?.();
      world.api?.start();
      window.addEventListener('keydown', onKey);
      el.addEventListener('pointerdown', onPointer);
      document.addEventListener('visibilitychange', onHidden);
      showSelect();
      raf = requestAnimationFrame(frame);
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHidden);
      if (music.tag !== 'hall') music.stop(0.4);
    },
  };
}
