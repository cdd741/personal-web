/**
 * Draws the ASCII sea floor at the bottom of the home page: rows of sand with a few
 * rocks and shells, and kelp that sways. Both are plain text in <pre> elements, cut to
 * the width of the screen.
 */

const KELP_ROWS = 9;
const SAND_ROWS = 3;
const SAND = ['.', '.', '.', ',', '_', '~', '`', "'", ' ', ' '];
const DECOR = ['_/\\_', '(@)', '*', '<><', '_/^\\_'];

/** Small deterministic generator, so the floor looks the same on every visit and resize. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export function mountSeabed(floor: HTMLElement) {
  const sand = floor.querySelector<HTMLElement>('[data-seabed-sand]');
  const kelp = floor.querySelector<HTMLElement>('[data-seabed-kelp]');
  if (!sand || !kelp) return;

  let cols = 0;
  let stalks: { col: number; height: number }[] = [];
  let sway = 0;

  const drawKelp = () => {
    const rows = Array.from({ length: KELP_ROWS + SAND_ROWS }, () => new Array<string>(cols).fill(' '));
    for (const { col, height } of stalks) {
      for (let h = 0; h < height; h++) {
        const row = KELP_ROWS - 1 - h;
        // Each stalk is a wave of brackets; the wave travels up it as `sway` advances.
        const lean = (h + sway + col) % 4;
        const x = col + (lean === 1 ? 1 : lean === 3 ? -1 : 0);
        if (x >= 0 && x < cols) rows[row][x] = lean < 2 ? ')' : '(';
      }
    }
    kelp.textContent = rows.map((r) => r.join('')).join('\n');
  };

  const layout = () => {
    // Measure one character of the mono font to know how many fit across.
    const probe = document.createElement('span');
    probe.textContent = '0'.repeat(40);
    probe.style.visibility = 'hidden';
    sand.append(probe);
    const charWidth = probe.getBoundingClientRect().width / 40;
    probe.remove();
    const next = Math.ceil(floor.clientWidth / Math.max(1, charWidth)) + 1;
    if (next === cols) return;
    cols = next;

    const rnd = seeded(7);
    const rows: string[] = [];
    for (let r = 0; r < SAND_ROWS; r++) {
      const line = new Array<string>(cols);
      for (let c = 0; c < cols; c++) line[c] = r === 0 ? (rnd() < 0.18 ? '_' : rnd() < 0.5 ? '.' : ' ') : SAND[(rnd() * SAND.length) | 0];
      rows.push(line.join(''));
    }
    // A few rocks, shells and a starfish sitting on the top row.
    const top = rows[0].split('');
    for (let c = 6; c < cols - 8; c += 14 + ((rnd() * 22) | 0)) {
      const item = DECOR[(rnd() * DECOR.length) | 0];
      for (let i = 0; i < item.length; i++) top[c + i] = item[i];
    }
    rows[0] = top.join('');
    sand.textContent = Array.from({ length: KELP_ROWS }, () => '').concat(rows).join('\n');

    stalks = [];
    for (let c = 3; c < cols - 3; c += 5 + ((rnd() * 13) | 0)) {
      // Leave the chest's corner of the floor clear.
      if (c > cols * 0.62 && c < cols * 0.9) continue;
      stalks.push({ col: c, height: 3 + ((rnd() * (KELP_ROWS - 3)) | 0) });
    }
    drawKelp();
  };

  layout();
  new ResizeObserver(layout).observe(floor);
  document.fonts?.ready.then(layout);

  // Sway only while the floor is on screen, and not for visitors who prefer reduced motion.
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let timer = 0;
  new IntersectionObserver(([entry]) => {
    window.clearInterval(timer);
    if (!entry.isIntersecting || reduced.matches) return;
    timer = window.setInterval(() => {
      sway = (sway + 1) % 4;
      drawKelp();
    }, 520);
  }).observe(floor);
}
