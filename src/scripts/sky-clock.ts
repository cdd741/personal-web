/**
 * A clock card whose background is the actual sky over a city right now: the sun's
 * elevation is computed from the date and coordinates, and mapped to night, blue
 * hour, golden hour or day.
 */

export interface Place {
  city: string;
  timeZone: string;
  lat: number;
  lon: number;
}

const RAD = Math.PI / 180;

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

/** Minutes a time zone is ahead of the visitor's own clock. */
function offsetFromVisitor(timeZone: string, now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const there = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  const here = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
  return Math.round((there - here) / 60000);
}

function describeOffset(minutes: number, city: string) {
  if (minutes === 0) return `Same time as you.`;
  const h = Math.abs(minutes) / 60;
  const amount = Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
  return `${city} is ${amount} ${minutes > 0 ? 'ahead of' : 'behind'} you.`;
}

export function mountSkyClock(card: HTMLElement, place: Place) {
  const time = card.querySelector<HTMLElement>('[data-time]')!;
  const label = card.querySelector<HTMLElement>('[data-sky-label]')!;
  const offset = card.querySelector<HTMLElement>('[data-offset]')!;
  const body = card.querySelector<HTMLElement>('[data-body]')!;
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: place.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  function update() {
    const now = new Date();
    const { elevation, hourAngle } = sunPosition(now, place.lat, place.lon);
    const hour = Number(fmt.format(now).slice(0, 2));
    const sky = skyFor(elevation, hourAngle < 0);
    card.style.setProperty('--sky-top', sky.top);
    card.style.setProperty('--sky-bottom', sky.bottom);
    card.style.setProperty('--sky-ink', sky.ink);
    // The sun (or moon) rides an arc: hour angle sets how far across, elevation how high.
    const x = 50 + (hourAngle / 180) * 50;
    const up = elevation > -4;
    const y = up ? 78 - Math.max(0, Math.min(60, elevation)) : 22;
    body.style.left = `${up ? x : 78}%`;
    body.style.top = `${y}%`;
    body.dataset.kind = up ? 'sun' : 'moon';
    time.textContent = fmt.format(now);
    // Only mention the sky when it's something worth looking out the window for.
    const special = sky.label !== 'Night' && sky.label !== 'Daytime';
    label.textContent = `${greeting(hour)} in ${place.city}${special ? ` · ${sky.label.toLowerCase()}` : ''}`;
    offset.textContent = describeOffset(offsetFromVisitor(place.timeZone, now), place.city);
  }

  update();
  const timer = setInterval(update, 15000);
  return () => clearInterval(timer);
}
