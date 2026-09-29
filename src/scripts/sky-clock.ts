/**
 * A clock card showing the visitor's own local time, under the sky they're under
 * right now. The browser's time zone gives the time; the zone's representative city
 * (from the tz database) gives rough coordinates for the sun, with no location prompt.
 */

const RAD = Math.PI / 180;
/** Sun elevation at sunrise/sunset, allowing for refraction and the sun's radius. */
const HORIZON = -0.833;

/** Sun elevation and hour angle in degrees (a low-precision almanac formula, good to ~1°). */
export function sunPosition(date: Date, lat: number, lon: number) {
  const d = date.getTime() / 86400000 - 10957.5; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const gmst = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  let ha = gmst * 15 * RAD + lon * RAD - ra;
  ha = Math.atan2(Math.sin(ha), Math.cos(ha));
  const el = Math.asin(Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(ha));
  return { elevation: el / RAD, hourAngle: ha / RAD };
}

/** The next sunrise or sunset within a day, found by stepping forward then bisecting. */
function nextSunEvent(now: Date, lat: number, lon: number) {
  const above = (t: number) => sunPosition(new Date(t), lat, lon).elevation > HORIZON;
  const start = now.getTime();
  const wasUp = above(start);
  const step = 10 * 60000;
  for (let t = start + step; t <= start + 26 * 3600000; t += step) {
    if (above(t) === wasUp) continue;
    let lo = t - step;
    let hi = t;
    while (hi - lo > 30000) {
      const mid = (lo + hi) / 2;
      if (above(mid) === wasUp) lo = mid;
      else hi = mid;
    }
    return { kind: wasUp ? 'Sunset' : 'Sunrise', minutes: Math.round((hi - start) / 60000) };
  }
  return { kind: wasUp ? 'Midnight sun' : 'Polar night', minutes: -1 };
}

function describeSunEvent({ kind, minutes }: { kind: string; minutes: number }) {
  if (minutes < 0) return kind === 'Midnight sun' ? 'The sun won’t set today.' : 'No sunrise today.';
  if (minutes < 1) return `${kind} right about now.`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${kind} in ${h ? `${h} h ` : ''}${m ? `${m} min` : ''}`.trim() + '.';
}

type Sky = { top: string; bottom: string; ink: string; label: string };

function skyFor(elevation: number, morning: boolean): Sky {
  if (elevation < -12) return { top: '#070b1e', bottom: '#1a1640', ink: '#e9e6ff', label: 'Night' };
  if (elevation < -4) return { top: '#12204f', bottom: '#6a4a8c', ink: '#f3eaff', label: 'Blue hour' };
  if (elevation < 6)
    return morning
      ? { top: '#3f6fb8', bottom: '#ffb38a', ink: '#1d1330', label: 'Sunrise' }
      : { top: '#34529b', bottom: '#ff9360', ink: '#1d1330', label: 'Golden hour' };
  return { top: '#4a9be0', bottom: '#bfe3ff', ink: '#0d2440', label: 'Daytime' };
}

function greeting(hour: number) {
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  if (hour < 22) return 'Evening';
  return 'Night';
}

/** "America/Argentina/Buenos_Aires" → "Buenos Aires"; UTC and Etc/* zones have no city. */
function cityOf(timeZone: string) {
  if (!timeZone.includes('/') || timeZone.startsWith('Etc/')) return '';
  return timeZone.split('/').at(-1)!.replace(/_/g, ' ');
}

export async function mountSkyClock(card: HTMLElement) {
  const time = card.querySelector<HTMLElement>('[data-time]')!;
  const label = card.querySelector<HTMLElement>('[data-sky-label]')!;
  const sunLine = card.querySelector<HTMLElement>('[data-sun]')!;
  const body = card.querySelector<HTMLElement>('[data-body]')!;

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  let city = cityOf(timeZone);
  // The visitor's own clock style: "9:48 PM" or "21:48".
  const fmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const hourOf = (d: Date) => d.getHours();

  // Rough coordinates: the zone's representative city, else longitude from the UTC offset.
  let coords: readonly [number, number] | null = null;

  function update() {
    const now = new Date();
    time.textContent = fmt.format(now);
    const where = city ? ` in ${city}` : '';
    if (!coords) {
      label.textContent = `${greeting(hourOf(now))}${where}`;
      return;
    }
    const [lat, lon] = coords;
    const { elevation, hourAngle } = sunPosition(now, lat, lon);
    const sky = skyFor(elevation, hourAngle < 0);
    card.style.setProperty('--sky-top', sky.top);
    card.style.setProperty('--sky-bottom', sky.bottom);
    card.style.setProperty('--sky-ink', sky.ink);
    // The sun (or moon) rides an arc across the right side of the card, clear of the time:
    // hour angle sets how far across, elevation how high.
    const up = elevation > -4;
    const across = Math.max(-1, Math.min(1, hourAngle / 120));
    const height = Math.max(0, Math.min(1, elevation / 50));
    body.style.left = `${up ? 86 + across * 7 : 86}%`;
    body.style.top = `${up ? 78 - height * 58 : 22}%`;
    body.dataset.kind = up ? 'sun' : 'moon';
    // Only mention the sky when it's something worth looking out the window for.
    const special = sky.label !== 'Night' && sky.label !== 'Daytime';
    label.textContent = `${greeting(hourOf(now))}${where}${special ? ` · ${sky.label.toLowerCase()}` : ''}`;
    sunLine.textContent = describeSunEvent(nextSunEvent(now, lat, lon));
  }

  update();
  const timer = setInterval(update, 15000);

  try {
    const { default: zones } = await import('../data/timezones.json');
    // [lat, lon], plus the canonical zone name when the browser reported an old alias.
    const hit = (zones as Record<string, (number | string)[]>)[timeZone];
    if (hit && typeof hit[0] === 'number' && typeof hit[1] === 'number') coords = [hit[0], hit[1]];
    if (typeof hit?.[2] === 'string') city = cityOf(hit[2]);
  } catch {}
  if (!coords) coords = [35, (-new Date().getTimezoneOffset() / 60) * 15];
  update();

  return () => clearInterval(timer);
}
