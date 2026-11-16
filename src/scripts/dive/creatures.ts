/**
 * The other animals in the home page's water: jellyfish in mid-water, a sea turtle near
 * the surface and an anglerfish in the deep. They are drawn the way the sharks are (a
 * shape sampled on the ocean's character grid, each cell a shaded block with a glyph),
 * on their own canvas above the sharks.
 *
 * Each animal is a little signed-distance shape in its own frame, so it animates
 * smoothly: the jellyfish's bell pulses, the turtle's flippers stroke, the anglerfish's
 * tail wags. They keep clear of whatever text the page is showing, and fade out if they
 * end up over it anyway.
 */

type Kind = 'jelly' | 'turtle' | 'angler';

/** Where the page's text is, as an ellipse to stay out of. */
export interface Zone {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export interface CreatureFrame {
  dt: number;
  /** The water's vertical speed in px/s while the visitor scrolls (negative = up the screen). */
  current: number;
  /** 0 at the surface, 1 at the seabed. */
  depth: number;
  zone: Zone | null;
  pointer: { x: number; y: number; active: boolean };
  /** The ocean's character cell, so the animals sit on the same grid as the sharks. */
  cell: { cw: number; ch: number };
}

export interface Creatures {
  step(frame: CreatureFrame): void;
  resize(): void;
  clear(): void;
}

interface Creature {
  kind: Kind;
  id: number;
  x: number;
  y: number;
  /** Jellyfish: bell radius. Turtle and anglerfish: body length. In cells; scaled by the cell width. */
  cells: number;
  size: number;
  /** Radius, in px, of the box worth sampling around it. */
  reach: number;
  /** Heading (turtle), or tilt (jellyfish, anglerfish). */
  angle: number;
  /** Anglerfish only: 1 faces right, -1 left. */
  dir: number;
  phase: number;
  rate: number;
  seed: number;
  /** Seconds left off screen before it comes back. */
  wait: number;
  startle: number;
  /** 0–1: how much of it the depth and the text allow to show. */
  presence: number;
  clearOfText: number;
}

const NONE = 0;
const BODY = 1;
/** A glyph with no block behind it: tentacles, soft edges, the anglerfish's rod. */
const SOFT = 2;
const LURE = 4;
const TEETH = 5;

/** Bright to dark, the same ramp the sharks' skin uses. */
const SKIN = ':;t%SX8#@';
const SOFT_GLYPHS = ["'", '`', '.', ',', ':', ';'];
/** How much lighter a glyph is than its cell; matches SKIN_INK in the vendored renderer. */
const INK = 0.2;

type Tint = [number, number, number];
const LOOK: Record<Kind, { tint: Tint; second?: Tint; tone: number; alpha: number }> = {
  jelly: { tint: [1.12, 0.8, 1.14], tone: 1, alpha: 0.8 },
  // An olive-brown shell and green skin.
  turtle: { tint: [1.02, 0.9, 0.52], second: [0.66, 1, 0.74], tone: 0.95, alpha: 1 },
  angler: { tint: [0.84, 0.76, 0.96], tone: 0.62, alpha: 1 },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const span = (v: number, from: number, to: number) => clamp((v - from) / (to - from), 0, 1);
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

// Scratch outputs of the shape samplers, to avoid allocating per cell.
let hit = NONE;
let shade = 0;
/** For a SOFT cell: the glyph to draw, or '' to pick a random light one. */
let mark = '';
/** 0 for the animal's main colour, 1 for its second one (the turtle's skin, against its shell). */
let part = 0;
/** Which way the light comes from, in the frame of the animal being drawn. */
let lightX = 0;
let lightY = -1;

/** Distance to an ellipse's edge (negative inside); approximate, which is plenty at this resolution. */
function ellipse(x: number, y: number, a: number, b: number) {
  return (Math.hypot(x / a, y / b) - 1) * Math.min(a, b);
}

/** Distance to a line segment that tapers from radius `ra` to `rb`. */
function capsule(x: number, y: number, ax: number, ay: number, bx: number, by: number, ra: number, rb: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(x - ax - dx * t, y - ay - dy * t) - (ra + (rb - ra) * t);
}

/** A jellyfish seen from the side: a pulsing bell, a frilled rim, and trailing tentacles. `y` is down. */
function sampleJelly(c: Creature, x: number, y: number, cw: number) {
  const s = c.size;
  const squeeze = 0.5 + 0.5 * Math.sin(c.phase);
  const a = s * (1 - 0.2 * squeeze);
  const b = s * (0.95 + 0.2 * squeeze);
  hit = NONE;
  mark = '';
  part = 0;
  if (y <= 0) {
    const d = ellipse(x, y, a, b);
    if (d < -cw * 0.3) {
      const r = Math.hypot(x / a, y / b);
      hit = BODY;
      shade = clamp(0.42 + 0.5 * (-y / b) - 0.22 * r * r - (r > 0.78 ? 0.12 : 0), 0, 1);
    } else if (d < cw * 0.45) {
      hit = SOFT;
      shade = 0.7;
    }
    return;
  }
  if (y < s * 0.18 && Math.abs(x) < a) {
    if (Math.sin((x / s) * 11 + c.seed) > -0.3) {
      hit = BODY;
      shade = 0.3;
    }
    return;
  }
  // Two short oral arms in the middle, then six thin tentacles that ripple as it swims.
  for (let i = 0; i < 2; i++) {
    const len = s * 0.85;
    if (y > len) continue;
    const k = y / len;
    const mid = a * (i ? 0.22 : -0.22) + Math.sin(y * 0.06 - c.phase + i * 2.4) * s * 0.1 * k;
    if (Math.abs(x - mid) < cw * (0.62 - 0.2 * k)) {
      hit = BODY;
      shade = 0.55 - 0.25 * k;
      return;
    }
  }
  for (let i = 0; i < 6; i++) {
    const len = s * (1.4 + 0.26 * ((i * 7 + (c.seed | 0)) % 3)) * (1 + 0.12 * squeeze);
    if (y > len) continue;
    const k = y / len;
    const wave = y * 0.05 - c.phase + i * 1.9;
    const strand = a * (-0.8 + 0.32 * i) * (1 - 0.25 * k) + Math.sin(wave) * s * 0.18 * k;
    if (Math.abs(x - strand) < cw * 0.55) {
      hit = SOFT;
      shade = 0.95 - 0.55 * k;
      // Lean the glyph the way the strand is heading.
      const lean = Math.cos(wave) * k;
      mark = lean > 0.25 ? ')' : lean < -0.25 ? '(' : k > 0.8 ? ':' : '|';
      return;
    }
  }
}

/** A sea turtle seen from above, swimming along +x: a domed shell with plates, head, and four flippers. */
function sampleTurtle(c: Creature, x: number, y: number, cw: number) {
  const L = c.size;
  const stroke = Math.sin(c.phase);
  const side = Math.abs(y);
  hit = NONE;
  mark = '';
  part = 0;

  // The shell is a dome: brightest where it faces the light, falling off to a dark rim,
  // with dark seams between the plates (a row down the spine, a row along each flank).
  const a = 0.32 * L;
  const b = 0.26 * L;
  const shell = ellipse(x, y, a, b);
  let best = shell;
  const nx = x / a;
  const ny = y / b;
  const r = Math.hypot(nx, ny);
  const seamAlong = Math.abs(side - 0.36 * b) < cw * 0.42;
  const offset = side < 0.36 * b ? 0 : 0.5;
  const plate = (x / (0.145 * L) + offset + 20) % 1;
  const seamAcross = Math.min(plate, 1 - plate) * 0.145 * L < cw * 0.42;
  shade = 0.56 + 0.3 * (nx * lightX + ny * lightY) - 0.2 * r * r;
  if (r > 0.86) shade = 0.2 + 0.12 * (nx * lightX + ny * lightY);
  else if (seamAlong || seamAcross) shade -= 0.27;
  shade = clamp(shade, 0, 1);

  let skin = false;
  // The shell lies over the roots of the head and flippers.
  const consider = (d: number, s: number) => {
    if (shell > -cw * 0.15 && d < best) {
      best = d;
      shade = s;
      skin = true;
    }
  };
  // Mottled skin: a stable speckle from where the cell sits on the animal.
  const fleck = Math.sin(Math.round(x / cw) * 12.9898 + Math.round(y / cw) * 78.233) * 43758.5453;
  const mottle = (fleck - Math.floor(fleck) - 0.5) * 0.22;
  consider(capsule(x, y, 0.29 * L, 0, 0.45 * L, 0, 0.05 * L, 0.072 * L), 0.78 + mottle - (x > 0.42 * L ? 0 : 0.12));
  // Front flippers sweep back and forth, paler towards the tips; rear ones just steer.
  consider(
    capsule(x, side, 0.17 * L, 0.19 * L, (0.04 - 0.16 * stroke) * L, (0.54 - 0.04 * Math.abs(stroke)) * L, 0.085 * L, 0.04 * L),
    0.5 + 0.3 * span(side, 0.19 * L, 0.52 * L) + mottle,
  );
  consider(capsule(x, side, -0.23 * L, 0.16 * L, (-0.4 - 0.02 * stroke) * L, 0.29 * L, 0.055 * L, 0.03 * L), 0.5 + mottle);
  consider(capsule(x, y, -0.3 * L, 0, -0.39 * L, 0, 0.02 * L, 0.008 * L), 0.5);

  if (skin) part = 1;
  if (best < -cw * 0.15) hit = BODY;
  else if (best < cw * 0.45) {
    hit = SOFT;
    shade = 0.6;
    part = 1;
  }
}

/** The anglerfish's lure, in its own frame (before mirroring). */
function lureAt(c: Creature): [number, number] {
  const L = c.size;
  return [0.46 * L, (-0.46 + 0.025 * Math.sin(c.phase * 0.6)) * L];
}

/** A deep-sea anglerfish from the side, facing +x: round body, open jaw, and a lure on a rod. */
function sampleAngler(c: Creature, x: number, y: number, cw: number, ch: number) {
  const L = c.size;
  const wag = Math.sin(c.phase);
  hit = NONE;
  mark = '';
  part = 0;

  const [lx, ly] = lureAt(c);
  if (Math.abs(x - lx) < cw * 0.5 && Math.abs(y - ly) < ch * 0.5) {
    hit = LURE;
    return;
  }

  const body = ellipse(x, y, 0.34 * L, 0.26 * L);
  // The open mouth: a wedge cut out of the front, lined with teeth.
  if (x > 0.06 * L) {
    const gape = (x - 0.06 * L) * 0.6;
    const off = y - 0.07 * L;
    if (Math.abs(off) < gape) {
      if (body < 0 && gape - Math.abs(off) < ch * 0.7) {
        hit = TEETH;
        shade = off < 0 ? 1 : 0;
      }
      return;
    }
  }
  if (body < -cw * 0.15) {
    const r = Math.hypot(x / (0.34 * L), y / (0.26 * L));
    hit = BODY;
    shade = clamp(0.34 + 0.3 * (-y / (0.26 * L)) - 0.15 * r * r, 0, 1);
    return;
  }
  // Tail fan, wagging.
  if (x < -0.26 * L && x > -0.56 * L) {
    const k = (-0.26 * L - x) / (0.3 * L);
    if (Math.abs(y - wag * 0.06 * L * k) < (0.05 + 0.15 * k) * L) {
      hit = BODY;
      shade = 0.36 - 0.1 * k;
      return;
    }
  }
  // Dorsal and pectoral fins.
  const fins = Math.min(
    capsule(x, y, -0.05 * L, -0.22 * L, -0.2 * L, -0.36 * L, 0.05 * L, 0.015 * L),
    capsule(x, y, 0, 0.1 * L, -0.14 * L, (0.25 + 0.02 * wag) * L, 0.04 * L, 0.015 * L),
  );
  if (fins < 0) {
    hit = BODY;
    shade = 0.5;
    return;
  }
  // The rod: a curve from the forehead up and over to the lure.
  const ax = 0.04 * L;
  const ay = -0.22 * L;
  const bx = 0.16 * L;
  const by = -0.68 * L;
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const u = 1 - t;
    const qx = u * u * ax + 2 * u * t * bx + t * t * lx;
    const qy = u * u * ay + 2 * u * t * by + t * t * ly;
    if (Math.hypot(x - qx, y - qy) < cw * 0.55) {
      hit = SOFT;
      shade = 0.95;
      mark = t < 0.45 ? '/' : t < 0.75 ? '-' : '\\';
      return;
    }
  }
  if (body < cw * 0.45) {
    hit = SOFT;
    shade = 0.35;
  }
}

export function createCreatures(canvas: HTMLCanvasElement): Creatures {
  const ctx = canvas.getContext('2d')!;
  const family = getComputedStyle(canvas).fontFamily;
  let width = 0;
  let height = 0;
  let time = 0;
  let cw = 12;
  let ch = 17;
  let animals: Creature[] = [];

  const make = (kind: Kind, id: number): Creature => ({
    kind,
    id,
    x: 0,
    y: 0,
    cells: kind === 'jelly' ? rand(4.2, 5.8) : kind === 'turtle' ? 24 : 18,
    size: 0,
    reach: 0,
    angle: 0,
    dir: Math.random() < 0.5 ? 1 : -1,
    phase: rand(0, 6.28),
    rate: kind === 'jelly' ? rand(2.1, 2.8) : kind === 'turtle' ? 2.3 : 3.1,
    seed: rand(0, 100),
    wait: 0,
    startle: 0,
    presence: 0,
    clearOfText: 1,
  });

  /** A spot along one axis that is off the text when there is room for one. */
  const pick = (extent: number, zoneAt: number | undefined, zoneHalf: number, margin: number) => {
    let best = rand(margin, Math.max(margin, extent - margin));
    if (zoneAt === undefined) return best;
    for (let i = 0; i < 8 && Math.abs(best - zoneAt) < zoneHalf + margin; i++) {
      best = rand(margin, Math.max(margin, extent - margin));
    }
    return best;
  };

  /** Bring a crosser (turtle, anglerfish) back in from one side. */
  const enter = (c: Creature, zone: Zone | null) => {
    const fromLeft = Math.random() < 0.5;
    c.dir = fromLeft ? 1 : -1;
    c.x = fromLeft ? -c.reach : width + c.reach;
    c.y = pick(height, zone?.y, zone?.ry ?? 0, c.reach * 0.6);
    c.angle = c.kind === 'turtle' ? (fromLeft ? 0 : Math.PI) + rand(-0.15, 0.15) : 0;
  };

  const populate = () => {
    const jellies = width < 700 ? 2 : width < 1300 ? 3 : 4;
    animals = [];
    for (let i = 0; i < jellies; i++) animals.push(make('jelly', i + 1));
    animals.push(make('turtle', 10), make('angler', 20));
    for (const c of animals) {
      scale(c);
      if (c.kind === 'jelly') {
        c.x = rand(c.reach * 0.5, width - c.reach * 0.5);
        c.y = rand(0, height);
      } else {
        // The turtle swims in a few seconds after the page opens; the anglerfish is
        // already down there somewhere.
        enter(c, null);
        if (c.kind === 'turtle') c.wait = rand(2, 5);
        else c.x = rand(0, width);
      }
    }
  };

  const scale = (c: Creature) => {
    c.size = c.cells * cw;
    c.reach = c.kind === 'jelly' ? c.size * 2.7 : c.size * 0.75;
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const previous = width;
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!animals.length || Math.abs(previous - width) > 200) populate();
  };
  resize();

  /** How visible each kind is at a depth: turtles near the surface, jellyfish in the middle, anglerfish at the bottom. */
  const wanted = (kind: Kind, depth: number) =>
    kind === 'turtle' ? 1 - span(depth, 0.3, 0.45) : kind === 'jelly' ? span(depth, 0.1, 0.22) * (1 - span(depth, 0.8, 0.92)) : span(depth, 0.55, 0.7);

  const move = (c: Creature, f: CreatureFrame) => {
    const { dt, zone, pointer } = f;
    c.phase += dt * c.rate * (1 + c.startle);
    c.startle = Math.max(0, c.startle - dt * 1.2);
    const thrust = Math.max(0, Math.cos(c.phase));

    if (c.wait > 0) {
      c.wait -= dt;
      if (c.wait <= 0) enter(c, zone);
      return;
    }

    if (c.kind === 'jelly') {
      // Each squeeze of the bell pushes it up a little.
      c.y -= (7 + 30 * thrust) * (1 + c.startle) * dt;
      c.x += Math.sin(time * 0.3 + c.seed) * 6 * dt;
      c.angle = Math.sin(c.phase * 0.5 + c.seed) * 0.12;
      // A cursor that comes close makes it dart away.
      if (pointer.active) {
        const dx = c.x - pointer.x;
        const dy = c.y - c.size * 0.3 - pointer.y;
        const d = Math.hypot(dx, dy) || 1;
        const near = c.size * 2.2;
        if (d < near) {
          const push = 90 * (1 - d / near) * dt;
          c.x += (dx / d) * push;
          c.y += (dy / d) * push;
          c.startle = 1;
        }
      }
    } else {
      const speed = c.kind === 'turtle' ? 22 + 14 * thrust : 11 + 5 * thrust;
      const heading = c.kind === 'turtle' ? c.angle + Math.sin(time * 0.25 + c.seed) * 0.12 : c.dir > 0 ? 0 : Math.PI;
      c.x += Math.cos(heading) * speed * dt;
      c.y += Math.sin(heading) * speed * dt + (c.kind === 'angler' ? Math.sin(time * 0.4 + c.seed) * 4 * dt : 0);
      if (c.x < -c.reach * 1.2 || c.x > width + c.reach * 1.2) c.wait = rand(5, 13);
    }

    // The water streams past while the visitor scrolls, and carries everything in it.
    c.y += f.current * 0.9 * dt;
    if (c.y < -c.reach) {
      c.y = height + c.reach * 0.9;
      if (c.kind === 'jelly') c.x = pick(width, zone?.x, zone?.rx ?? 0, c.reach * 0.4);
    } else if (c.y > height + c.reach) {
      c.y = -c.reach * 0.9;
      if (c.kind === 'jelly') c.x = pick(width, zone?.x, zone?.rx ?? 0, c.reach * 0.4);
    }

    // Keep off the text: drift away from it, and fade if over it anyway.
    let clear = 1;
    if (zone) {
      const pad = c.reach * 0.55;
      const nx = (c.x - zone.x) / (zone.rx + pad);
      const ny = (c.y - zone.y) / (zone.ry + pad);
      const e = Math.hypot(nx, ny) || 1e-3;
      clear = span(e, 0.85, 1.15);
      if (e < 1.35) {
        const push = 34 * (1.35 - e) * dt;
        c.x += (nx / e) * push;
        c.y += (ny / e) * push;
      }
    }
    c.clearOfText += (clear - c.clearOfText) * Math.min(1, dt * 3);
    c.presence += (wanted(c.kind, f.depth) - c.presence) * Math.min(1, dt * 1.5);
  };

  const draw = (c: Creature) => {
    const look = LOOK[c.kind];
    const alpha = look.alpha * c.presence * c.clearOfText;
    if (alpha < 0.02 || c.wait > 0) return;
    const mirror = c.kind === 'angler' && c.dir < 0 ? -1 : 1;
    const cos = Math.cos(c.angle);
    const sin = Math.sin(c.angle);
    // Light from the top left of the screen, turned into the animal's frame.
    lightX = -0.5 * cos - 0.8 * sin;
    lightY = 0.5 * sin - 0.8 * cos;

    // The lure lights the water around it.
    if (c.kind === 'angler') {
      const [lx, ly] = lureAt(c);
      const gx = c.x + mirror * lx;
      const gy = c.y + ly;
      const radius = c.size * (0.5 + 0.06 * Math.sin(time * 2.3));
      const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
      glow.addColorStop(0, `rgba(255,226,150,${(0.42 * alpha).toFixed(3)})`);
      glow.addColorStop(0.35, `rgba(255,200,110,${(0.14 * alpha).toFixed(3)})`);
      glow.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(gx - radius, gy - radius, radius * 2, radius * 2);
    }

    ctx.globalAlpha = alpha;
    const col0 = Math.floor((c.x - c.reach) / cw);
    const col1 = Math.ceil((c.x + c.reach) / cw);
    const row0 = Math.floor((c.y - c.reach) / ch);
    const row1 = Math.ceil((c.y + c.reach) / ch);
    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        const px = (col + 0.5) * cw - c.x;
        const py = (row + 0.5) * ch - c.y;
        // Into the animal's own frame.
        const x = (px * cos + py * sin) * mirror;
        const y = -px * sin + py * cos;
        if (c.kind === 'jelly') sampleJelly(c, x, y, cw);
        else if (c.kind === 'turtle') sampleTurtle(c, x, y, cw);
        else sampleAngler(c, x, y, cw, ch);
        if (hit === NONE) continue;
        const [tr, tg, tb] = part && look.second ? look.second : look.tint;

        const left = col * cw;
        const top = row * ch;
        const mx = left + cw / 2;
        const my = top + ch / 2 + 1;
        // Glyphs stay put on the animal as it moves across the grid.
        const key = ((Math.round(x / cw) * 73856093) ^ (Math.round(y / ch) * 19349663) ^ (c.id * 83492791)) >>> 0;

        if (hit === LURE) {
          ctx.fillStyle = 'rgb(255,232,160)';
          ctx.fillRect(left + 1, top + 1, cw - 1, ch - 1);
          ctx.fillStyle = '#fff';
          ctx.fillText('*', mx, my);
        } else if (hit === TEETH) {
          ctx.fillStyle = 'rgba(236,240,248,0.85)';
          ctx.fillText(shade > 0.5 ? 'v' : '^', mx, my);
        } else if (hit === SOFT) {
          const g = (80 + shade * 100) * look.tone + 30;
          ctx.fillStyle = `rgb(${Math.min(255, Math.round(g * tr))},${Math.min(255, Math.round(g * tg))},${Math.min(255, Math.round(g * tb))})`;
          // A mirrored animal's slashes lean the other way.
          const glyph = mirror < 0 && mark === '/' ? '\\' : mirror < 0 && mark === '\\' ? '/' : mark;
          ctx.fillText(glyph || SOFT_GLYPHS[key % SOFT_GLYPHS.length], mx, my);
        } else {
          const level = (46 + shade * 160) * look.tone;
          ctx.fillStyle = `rgb(${Math.min(255, Math.round(level * tr))},${Math.min(255, Math.round(level * tg))},${Math.min(255, Math.round(level * tb))})`;
          ctx.fillRect(left + 1, top + 1, cw - 1, ch - 1);
          const ink = level + (255 - level) * INK;
          ctx.fillStyle = `rgb(${Math.min(255, Math.round(ink * tr))},${Math.min(255, Math.round(ink * tg))},${Math.min(255, Math.round(ink * tb))})`;
          const jitter = ((key >>> 4) % 3) - 1;
          ctx.fillText(SKIN[clamp(Math.floor((1 - shade) * 8.99) + jitter, 0, SKIN.length - 1)], mx, my);
        }
      }
    }
    ctx.globalAlpha = 1;
  };

  return {
    resize,
    clear() {
      ctx.clearRect(0, 0, width, height);
    },
    step(f) {
      time += f.dt;
      if (f.cell.cw !== cw || f.cell.ch !== ch) {
        cw = f.cell.cw;
        ch = f.cell.ch;
        animals.forEach(scale);
      }
      ctx.clearRect(0, 0, width, height);
      ctx.font = `600 ${Math.round(ch * 0.74)}px ${family}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const c of animals) {
        move(c, f);
        draw(c);
      }
    },
  };
}
