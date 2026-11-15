// Checks the home page's scroll scenes in the built site (run after `npm run build`).
// It scrolls the whole page in small steps at several window sizes and fails if
//   1. two scenes show content in the same place at the same time, or
//   2. a pinned scene's content spills outside the screen.
// Both happen when a scene's content outgrows one screen or the scene timings drift.
// Uses Playwright's Chromium; set CHROMIUM_PATH to use another binary.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const DIST = 'dist';
const SIZES = [
  [1440, 900],
  [1440, 720],
  [1280, 620],
  [1000, 560],
  [1920, 1080],
  [768, 1024],
  [390, 844],
  [360, 640],
];
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(DIST, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

/** Runs in the page: where each scene's visible text sits on screen right now. */
function readScenes() {
  const vh = innerHeight;
  const scenes = [];
  for (const scene of document.querySelectorAll('[data-scene]')) {
    let top = Infinity;
    let bottom = -Infinity;
    const walker = document.createTreeWalker(scene, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    while (walker.nextNode()) {
      const el = walker.currentNode.parentElement;
      if (!walker.currentNode.textContent.trim() || seen.has(el)) continue;
      seen.add(el);
      if (el.closest('[aria-hidden="true"], .sr-only, details:not([open]) > :not(summary)')) continue;
      let opacity = 1;
      let hidden = false;
      for (let node = el; node && node !== scene.parentElement; node = node.parentElement) {
        const style = getComputedStyle(node);
        opacity *= Number(style.opacity);
        if (style.visibility === 'hidden' || style.display === 'none') hidden = true;
      }
      if (hidden || opacity < 0.1) continue;
      const rect = el.getBoundingClientRect();
      if (rect.height === 0 || rect.bottom < 0 || rect.top > vh) continue;
      top = Math.min(top, rect.top);
      bottom = Math.max(bottom, rect.bottom);
    }
    const stage = scene.querySelector('[data-stage]');
    const pinned = !!stage && getComputedStyle(stage).position === 'sticky';
    scenes.push({
      name: scene.dataset.scene,
      top,
      bottom,
      pinned,
      u: -scene.getBoundingClientRect().top / vh,
      hold: pinned ? (scene.offsetHeight - stage.offsetHeight) / vh : 0,
    });
  }
  return { vh, scenes };
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let failures = 0;
try {
  for (const [width, height] of SIZES) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const problems = [];
    for (let y = 0; y <= total; y += Math.round(height * 0.1)) {
      await page.evaluate((to) => window.scrollTo(0, to), y);
      await page.waitForTimeout(40);
      const { vh, scenes } = await page.evaluate(readScenes);
      const shown = scenes.filter((s) => s.bottom > s.top);
      for (let i = 0; i < shown.length; i++) {
        for (let j = i + 1; j < shown.length; j++) {
          const overlap = Math.min(shown[i].bottom, shown[j].bottom) - Math.max(shown[i].top, shown[j].top);
          if (overlap > 4) problems.push(`scroll ${y}: "${shown[i].name}" and "${shown[j].name}" overlap by ${Math.round(overlap)}px`);
        }
      }
      for (const s of shown) {
        const settled = s.pinned && s.u > 0.1 && s.u < s.hold - 0.2;
        if (settled && (s.top < -2 || s.bottom > vh + 2)) {
          problems.push(`scroll ${y}: "${s.name}" spills outside the screen (${Math.round(s.top)} to ${Math.round(s.bottom)} of ${vh})`);
        }
      }
    }
    console.log(`${width}x${height}: ${problems.length ? `${problems.length} problem(s)` : 'ok'}`);
    for (const line of problems.slice(0, 5)) console.log(`  ${line}`);
    failures += problems.length;
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures) {
  console.error('Home page scenes overlap or overflow. See src/scripts/dive/index.ts (scene timings) and Scene.astro (fit).');
  process.exitCode = 1;
} else {
  console.log('Home page scenes: no overlap, nothing off screen.');
}
