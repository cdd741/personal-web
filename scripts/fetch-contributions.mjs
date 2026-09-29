// Writes src/data/contributions.json: the last year of GitHub contributions for the
// home page heatmap. Runs automatically before dev, check and build.
//
// - With GITHUB_TOKEN (CI, or set locally): fetches the real calendar from GitHub's
//   GraphQL API. If that fails, writes { source: "unavailable" } and the card hides
//   itself, so the site never shows made-up numbers as real.
// - Without a token (local dev): writes clearly labelled sample data, so the design
//   can be worked on offline.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const LOGIN = 'cdd741';
const OUT = 'src/data/contributions.json';
const FRESH_MS = 10 * 60 * 1000;

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
mkdirSync('src/data', { recursive: true });

function write(data) {
  writeFileSync(OUT, JSON.stringify(data) + '\n');
}

// `check` and `build` both run this in CI; don't hit the API twice in one run.
if (existsSync(OUT)) {
  try {
    const prev = JSON.parse(readFileSync(OUT, 'utf8'));
    const age = Date.now() - Date.parse(prev.fetchedAt);
    if (prev.source === 'github' && age < FRESH_MS) {
      console.log(`contributions: reusing data fetched ${Math.round(age / 1000)}s ago`);
      process.exit(0);
    }
  } catch {}
}

const QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}`;

const LEVELS = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

async function fetchCalendar() {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'andre-chen.com' },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors) throw new Error(`HTTP ${res.status} ${JSON.stringify(body.errors ?? body.message ?? '')}`);
  const cal = body.data.user.contributionsCollection.contributionCalendar;
  const days = cal.weeks.flatMap((w) => w.contributionDays.map((d) => [d.date, d.contributionCount, LEVELS[d.contributionLevel] ?? 0]));
  return { source: 'github', login: LOGIN, fetchedAt: new Date().toISOString(), total: cal.totalContributions, days };
}

/** Deterministic, obviously-labelled sample data for offline work. */
function sample() {
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), today.getUTCDate() + 1));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay()); // calendars start on a Sunday
  const days = [];
  for (let d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    const busy = rnd() < (weekend ? 0.25 : 0.75);
    const count = busy ? Math.round(rnd() ** 2 * (weekend ? 6 : 14)) + 1 : 0;
    days.push([d.toISOString().slice(0, 10), count]);
  }
  const max = Math.max(...days.map((d) => d[1]));
  for (const d of days) d.push(d[1] === 0 ? 0 : Math.min(4, Math.ceil((d[1] / max) * 4)));
  return { source: 'sample', login: LOGIN, fetchedAt: new Date().toISOString(), total: days.reduce((n, d) => n + d[1], 0), days };
}

if (!token) {
  write(sample());
  console.log('contributions: no GITHUB_TOKEN, wrote sample data (shown with a "sample data" badge)');
} else {
  try {
    const data = await fetchCalendar();
    write(data);
    const active = data.days.filter((d) => d[1] > 0).length;
    console.log(`contributions: ${data.total} in the last year across ${active} active days (${data.days[0][0]} → ${data.days.at(-1)[0]})`);
  } catch (err) {
    write({ source: 'unavailable', login: LOGIN, fetchedAt: new Date().toISOString(), total: 0, days: [] });
    console.log(`::warning title=GitHub contributions unavailable::${err.message}. The heatmap card is hidden in this build.`);
  }
}
