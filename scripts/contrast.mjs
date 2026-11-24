// Checks every text and control colour pair in src/styles/tokens.css against WCAG 2.2 AA, for
// each surface (hall, paper light, paper dark). Prints a table and exits with an error if any pair
// falls short, so a token change that hurts readability fails the build.
//
//   npm run check:contrast

import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

// Token values per surface: the :root block, then each block that overrides it.
function block(selectorPattern, from = 0) {
  const start = css.slice(from).search(selectorPattern);
  if (start < 0) throw new Error(`tokens.css: no block for ${selectorPattern}`);
  const open = css.indexOf('{', from + start);
  let depth = 1;
  let i = open + 1;
  for (; depth && i < css.length; i++) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0;
  return { body: css.slice(open + 1, i - 1), end: i };
}
const tokens = (text) => Object.fromEntries([...text.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2]]));

const root = tokens(block(/:root\s*\{/).body);
const paperLightBlock = block(/body\[data-surface='paper'\],\s*\.surface-paper\s*\{/);
const paperLight = { ...root, ...tokens(paperLightBlock.body) };
const media = block(/@media \(prefers-color-scheme: dark\)\s*\{/, paperLightBlock.end);
const paperDark = { ...root, ...tokens(media.body) };

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [foreground, background, required ratio, what it is]. 4.5 for text, 3 for large text and for
// the parts of controls you need to see (borders, focus rings).
const PAIRS = [
  ['text', 'bg', 4.5, 'body text'],
  ['text-2', 'bg', 4.5, 'secondary text'],
  ['text-3', 'bg', 4.5, 'tertiary text'],
  ['text', 'surface', 4.5, 'text on a panel'],
  ['text-2', 'surface', 4.5, 'secondary text on a panel'],
  ['text-3', 'surface', 4.5, 'tertiary text on a panel'],
  ['text', 'surface-2', 4.5, 'secondary button label'],
  ['text', 'surface-2-hover', 4.5, 'secondary button label, hover'],
  ['on-accent', 'accent', 4.5, 'primary button label'],
  ['on-accent', 'accent-hover', 4.5, 'primary button label, hover'],
  ['accent-text', 'bg', 4.5, 'links and current item'],
  ['accent-text', 'surface', 4.5, 'links on a panel'],
  ['danger', 'bg', 4.5, 'error message'],
  ['danger', 'surface', 4.5, 'error message on a panel'],
  ['line', 'bg', 3, 'field and control borders'],
  ['line', 'surface', 3, 'field borders on a panel'],
  ['focus', 'bg', 3, 'focus ring'],
  ['focus', 'surface', 3, 'focus ring on a panel'],
  ['focus', 'surface-2', 3, 'focus ring on a secondary button'],
  ['extra', 'bg', 4.5, 'notice board marker and label'],
  ['extra', 'surface', 3, 'notice board dot in the Tracklist'],
];

let failures = 0;
for (const [name, t] of [
  ['hall', root],
  ['paper, light', paperLight],
  ['paper, dark', paperDark],
]) {
  console.log(`\n${name}`);
  for (const [fg, bg, need, what] of PAIRS) {
    if (!t[fg] || !t[bg]) throw new Error(`tokens.css: --${fg} or --${bg} missing on ${name}`);
    const r = ratio(t[fg], t[bg]);
    const ok = r >= need;
    if (!ok) failures++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${r.toFixed(2).padStart(5)}:1 (need ${need}) ${what}: --${fg} on --${bg}`);
  }
}
if (failures) {
  console.error(`\n${failures} pair(s) below WCAG 2.2 AA.`);
  process.exit(1);
}
console.log('\nAll pairs pass WCAG 2.2 AA.');
