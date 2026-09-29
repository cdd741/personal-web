// Renders /resume/ from the built site into dist/andre-chen-resume.pdf (US Letter).
// Run after `npm run build`. Uses Playwright's Chromium; set CHROMIUM_PATH to use another binary.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const DIST = 'dist';
const OUT = join(DIST, 'andre-chen-resume.pdf');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

// A tiny static server for dist/, so fonts and styles load exactly as they do in production.
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

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/resume/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: OUT, printBackground: true, preferCSSPageSize: true });

  const pages = ((await readFile(OUT, 'latin1')).match(/\/Type\s*\/Page\b/g) ?? []).length;
  console.log(`Wrote ${OUT} (${pages} page${pages === 1 ? '' : 's'}).`);
  if (pages !== 1) {
    console.error('The résumé should fit on one page; trim content in src/resume.ts.');
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  server.close();
}
