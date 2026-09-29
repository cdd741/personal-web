// Generates src/data/timezones.json: approximate coordinates for every IANA time zone
// (from the tz database's representative city), so the home page can show the sky
// where the visitor is from their time zone alone, with no location prompt.
// Run when the tz database changes (moment-timezone is only needed here, so it isn't a project
// dependency): npm i --no-save moment-timezone && node scripts/build-timezones.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const meta = JSON.parse(readFileSync(require.resolve('moment-timezone/data/meta/latest.json'), 'utf8'));
const packed = JSON.parse(readFileSync(require.resolve('moment-timezone/data/packed/latest.json'), 'utf8'));

const coords = {};
for (const z of Object.values(meta.zones)) coords[z.name] = [+z.lat.toFixed(1), +z.long.toFixed(1)];

// Browsers may report old or alias names (Asia/Calcutta, Europe/Kiev…); point them at their
// canonical zone, and carry its name along when the city differs so the card says "Kolkata".
const cityOf = (zone) => zone.split('/').at(-1);
// Links can point either way relative to the coordinate list (Europe/Kiev ↔ Europe/Kyiv), so fill both.
for (const link of packed.links) {
  const [a, b] = link.split('|');
  const [known, alias] = coords[a] ? [a, b] : [b, a];
  if (!coords[known] || coords[alias]) continue;
  coords[alias] = cityOf(known) === cityOf(alias) ? coords[known] : [...coords[known], known];
}

const sorted = Object.fromEntries(Object.entries(coords).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync('src/data/timezones.json', JSON.stringify(sorted) + '\n');
console.log(`${Object.keys(sorted).length} zones`);
