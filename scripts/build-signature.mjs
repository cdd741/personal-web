// Generates src/data/signature.json: "Andre" in a single-stroke Hershey script font
// (ems_allure), resampled into evenly spaced points for the Fourier signature card.
// Run once after changing the text or font: node scripts/build-signature.mjs
import { writeFileSync } from 'node:fs';
import hershey from 'hersheytext';

const TEXT = 'Andre';
const FONT = 'ems_allure';
const SAMPLES = 480;

// 1. Pull every pen-down stroke out of the rendered SVG, in drawing order.
const svg = hershey.renderTextSVG(TEXT, { font: FONT });
const strokes = [];
for (const [, d, tx, ty] of svg.matchAll(/<path d="([^"]+)"[^>]*transform="translate\(([-\d.]+), ([-\d.]+)\) scale\(1, -1\)"/g)) {
  for (const part of d.split('M').slice(1)) {
    const nums = part.replace(/L/g, ' ').trim().split(/\s+/).map(Number);
    const pts = [];
    for (let i = 0; i < nums.length; i += 2) pts.push([Number(tx) + nums[i], Number(ty) - nums[i + 1]]);
    if (pts.length > 1) strokes.push(pts);
  }
}

// 2. Chain strokes into one closed loop; the hops between strokes (and back to the start) are pen-up.
const segs = [];
strokes.forEach((s, i) => {
  for (let j = 1; j < s.length; j++) segs.push({ a: s[j - 1], b: s[j], pen: 1 });
  const next = strokes[(i + 1) % strokes.length][0];
  segs.push({ a: s.at(-1), b: next, pen: 0 });
});
// Pen-up hops are never drawn, so they get a third of the sampling density.
const len = (s) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) * (s.pen ? 1 : 0.33);
const total = segs.reduce((n, s) => n + len(s), 0);

// 3. Resample at (weighted) equal arc length, so the Fourier series spends its terms evenly.
const points = [];
const pen = [];
let seg = 0;
let walked = 0;
for (let k = 0; k < SAMPLES; k++) {
  const target = (k / SAMPLES) * total;
  while (walked + len(segs[seg]) < target) walked += len(segs[seg++]);
  const s = segs[seg];
  const t = len(s) ? (target - walked) / len(s) : 0;
  points.push([s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t]);
  pen.push(s.pen);
}

// 4. Center and scale so the width spans [-1, 1].
const xs = points.map((p) => p[0]);
const ys = points.map((p) => p[1]);
const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
const scale = 2 / (Math.max(...xs) - Math.min(...xs));
const out = {
  text: TEXT,
  font: FONT,
  aspect: +((Math.max(...ys) - Math.min(...ys)) / (Math.max(...xs) - Math.min(...xs))).toFixed(4),
  points: points.map(([x, y]) => [+((x - cx) * scale).toFixed(4), +((y - cy) * scale).toFixed(4)]),
  pen: pen.join(''),
};
writeFileSync('src/data/signature.json', JSON.stringify(out) + '\n');
console.log(`${strokes.length} strokes, ${SAMPLES} samples, aspect ${out.aspect}, pen-up ${pen.filter((p) => !p).length}`);
