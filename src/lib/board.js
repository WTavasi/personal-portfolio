// The Notice Board's layout, shared by the 3D hall (which paints the notes, seen from across the
// hall) and the board itself (the real notes, laid over the 3D when the camera faces the board),
// so both put every note in the same place. Plain numbers, in metres on the board's face: u runs
// left to right and v bottom to top, from the board's centre.
import pinsFile from '../content/pins.json' with { type: 'json' };

// The board on the right-hand wall of the hall, under the side gallery, facing into the hall.
export const BOARD = {
  x: 11.25, // the wall side of the frame
  y: 1.95, // centre height
  z: -14.4, // centre along the wall
  w: 2.6, // the frame
  h: 1.55,
  cork: [2.44, 1.39], // the cork inside the frame
};

// Sticky-note colours, one per category (Wyclef's pins), and white index cards for visitors.
export const NOTE_COLOURS = {
  listening: '#f4dc72',
  films: '#f3a35c',
  tv: '#8fc0ec',
  playing: '#a9d98f',
  reading: '#f2a2c0',
  visitor: '#fbf7ef',
};
export const PIN_COLOURS = ['#d8453b', '#3b78d8', '#e3b552', '#3fa36a', '#9b5bd1'];

export const { categories, pins } = pinsFile;

// Small, repeatable jitter, so the board looks hand-pinned but the same on every visit.
function jitter(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280 - 0.5;
  };
}

// Where the filter tabs and the notes go. The tabs are index cards along the top; the notes fill
// the rest in a loose grid, the featured pin first.
export function boardLayout(list = pins) {
  const [cw, ch] = BOARD.cork;
  const tabH = 0.16;
  const top = ch / 2 - 0.06;
  const tabs = ['all', ...Object.keys(categories)].map((key, i, all) => {
    const w = 0.3;
    const gap = 0.05;
    const span = all.length * w + (all.length - 1) * gap;
    return { key, label: key === 'all' ? 'All' : categories[key], u: -span / 2 + w / 2 + i * (w + gap), v: top - tabH / 2, w, h: tabH };
  });

  const ordered = [...list].sort((a, b) => Number(!!b.feature) - Number(!!a.feature));
  const n = ordered.length;
  const areaTop = top - tabH - 0.06;
  const areaH = areaTop + ch / 2 - 0.04;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * (cw / areaH))));
  const rows = Math.max(1, Math.ceil(n / cols));
  const slotW = (cw - 0.12) / cols;
  const slotH = areaH / rows;
  const size = Math.min(slotW, slotH) * 0.84;
  const rand = jitter(n + 7);
  const notes = ordered.map((pin, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // The last row is centred when it is not full.
    const inRow = row === rows - 1 ? n - row * cols : cols;
    const rowStart = -((inRow - 1) * slotW) / 2;
    return {
      pin,
      u: rowStart + col * slotW + rand() * slotW * 0.12,
      v: areaTop - slotH * (row + 0.5) + rand() * slotH * 0.1,
      size,
      tilt: rand() * 0.12, // radians, about the board's normal
      colour: NOTE_COLOURS[pin.visitor ? 'visitor' : pin.category] ?? NOTE_COLOURS.visitor,
      pinColour: PIN_COLOURS[i % PIN_COLOURS.length],
    };
  });
  return { tabs, notes };
}
