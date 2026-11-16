/**
 * Draws the ASCII sea floor at the bottom of the home page: rows of sand with a few
 * rocks and shells, kelp that sways, and a crab that walks sideways along the sand and
 * runs from the cursor. All plain text in <pre> elements, cut to the width of the screen.
 */

const KELP_ROWS = 9;
const SAND_ROWS = 3;
const SAND = ['.', '.', '.', ',', '_', '~', '`', "'", ' ', ' '];
const DECOR = ['_/\\_', '(@)', '*', '<><', '_/^\\_'];

/** The crab's two walking frames: claws up, legs alternating. */
const CRAB = [
  ['(\\/)    (\\/)', '  \\(°__°)/', '  /\\/  \\/\\'].join('\n'),
  ['(\\/)    (\\/)', '  \\(°__°)/', '  \\/\\  /\\/'].join('\n'),
];

/** Small deterministic generator, so the floor looks the same on every visit and resize. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export function mountSeabed(floor: HTMLElement) {
  const sand = floor.querySelector<HTMLElement>('[data-seabed-sand]');
  const kelp = floor.querySelector<HTMLElement>('[data-seabed-kelp]');
  const crab = floor.querySelector<HTMLElement>('[data-seabed-crab]');
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

  // The crab: walks one way for a while, rests, walks back. It keeps to the left of the
  // chest, and bolts if the cursor comes near.
  let crabX = 40;
  let crabDir = 1;
  let crabRest = 0;
  let crabStep = 0;
  let crabFrame = 0;
  let scare = 0;
  let pointerX = -1e4;
  let last = 0;
  let raf = 0;
  if (crab) crab.textContent = CRAB[0];
  const walk = (now: number) => {
    raf = requestAnimationFrame(walk);
    if (!crab) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const room = Math.max(60, floor.clientWidth * 0.58 - crab.offsetWidth);
    const mid = crabX + crab.offsetWidth / 2;
    if (Math.abs(pointerX - mid) < 110 && scare <= 0) {
      scare = 1.1;
      crabDir = pointerX < mid ? 1 : -1;
      crabRest = 0;
    }
    scare = Math.max(0, scare - dt);
    if (crabRest > 0) {
      crabRest -= dt;
      return;
    }
    crabX += crabDir * (scare > 0 ? 95 : 22) * dt;
    if (crabX <= 8 || crabX >= room) {
      crabX = Math.min(room, Math.max(8, crabX));
      crabDir = -crabDir;
      if (scare <= 0) crabRest = 0.8 + Math.random() * 2;
    } else if (scare <= 0 && Math.random() < dt * 0.12) {
      // Now and then it just stops, and may change its mind.
      crabRest = 0.6 + Math.random() * 2.4;
      if (Math.random() < 0.4) crabDir = -crabDir;
    }
    crabStep += dt * (scare > 0 ? 14 : 5);
    if ((crabStep | 0) % 2 !== crabFrame) {
      crabFrame = (crabStep | 0) % 2;
      crab.textContent = CRAB[crabFrame];
    }
    crab.style.translate = `${crabX.toFixed(1)}px 0`;
  };
  floor.addEventListener('pointermove', (e) => (pointerX = e.clientX - floor.getBoundingClientRect().left), { passive: true });
  floor.addEventListener('pointerleave', () => (pointerX = -1e4));

  // Move only while the floor is on screen, and not for visitors who prefer reduced motion.
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let timer = 0;
  new IntersectionObserver(([entry]) => {
    window.clearInterval(timer);
    cancelAnimationFrame(raf);
    if (crab) crab.style.translate = `${crabX.toFixed(1)}px 0`;
    if (!entry.isIntersecting || reduced.matches) return;
    timer = window.setInterval(() => {
      sway = (sway + 1) % 4;
      drawKelp();
    }, 520);
    last = performance.now();
    raf = requestAnimationFrame(walk);
  }).observe(floor);
}
