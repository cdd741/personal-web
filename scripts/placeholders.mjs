// Lists dummy content that still needs replacing before launch.
// Usage: node scripts/placeholders.mjs [--strict]   (--strict exits 1 if any remain)
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const found = [];

for (const dir of ['src/content/projects', 'src/content/writing']) {
  for (const file of readdirSync(dir)) {
    if (!/\.mdx?$/.test(file)) continue;
    const text = readFileSync(join(dir, file), 'utf8');
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    if (/^placeholder:\s*true\s*$/m.test(frontmatter)) found.push(join(dir, file));
  }
}

for (const file of ['src/site.config.ts', 'src/resume.ts']) {
  const count = readFileSync(file, 'utf8').match(/PLACEHOLDER/g)?.length ?? 0;
  if (count) found.push(`${file} (${count} section${count > 1 ? 's' : ''})`);
}

if (found.length) {
  console.warn(`\n⚠ ${found.length} placeholder(s) still contain dummy content:`);
  for (const f of found) console.warn(`  - ${f}`);
  console.warn('');
  if (process.argv.includes('--strict')) process.exit(1);
} else {
  console.log('No placeholders left.');
}
