/**
 * Long-exposure light painting on a <canvas>.
 *
 * Every light (the visitor's cursor, or an ambient cyclist's tail light, headlight
 * or pedal light) leaves a trail of timestamped points. Each frame, the trails are
 * redrawn with additive blending, fading with age. To stay cheap, consecutive
 * segments of similar brightness are merged into one Path2D ("buckets"), so a trail
 * costs a few dozen strokes per frame rather than one per point.
 */

type RGB = readonly [number, number, number];

interface Point {
  x: number;
  y: number;
  t: number;
  /** Per-point brightness multiplier, 0..1. */
  a: number;
}

interface Trail {
  pts: Point[];
  color: RGB;
  /** Core stroke width in CSS px. */
  width: number;
  /** How long a point stays visible, ms. */
  life: number;
}

interface Light {
  /** Offset from the cyclist's hub, in unscaled px. */
  dx: number;
  dy: number;
  color: RGB;
  width: number;
  /** Pedal lights orbit the crank, tracing a trochoid as the bike moves. */
  pedal?: boolean;
  trail: Trail;
}

interface Cyclist {
  x: number;
  y: number;
  vx: number;
  scale: number;
  /** Crank radius in px, kept below speed / cadence so the pedal light waves rather than loops. */
  crankRadius: number;
  crank: number;
  cadence: number;
  bob: number;
  lights: Light[];
}

export interface ExposureOptions {
  /** Spawn cyclists that ride across on their own. */
  ambient?: boolean;
  /** Fill color drawn under the trails; null leaves the canvas transparent. */
  background?: string | null;
  /** How long the visitor's own trail lingers, ms. */
  life?: number;
  /** Element that receives pointer events (defaults to the canvas). */
  pointerTarget?: HTMLElement;
  /** Called every frame with seconds since the exposure started. */
  onTick?: (seconds: number) => void;
  /** Called the first time the visitor paints. */
  onFirstPaint?: () => void;
}

export interface Exposure {
  reset(): void;
  save(filename?: string): void;
  destroy(): void;
}

const WHITE: RGB = [255, 255, 255];
const TAIL: RGB = [255, 48, 36];
const HEAD: RGB = [255, 238, 205];
const PEDAL: RGB = [255, 170, 60];

/** Colors the visitor's light cycles through while painting: sodium, tail light, warm white, LED. */
const PAINT: RGB[] = [
  [255, 176, 64],
  [255, 64, 48],
  [255, 92, 150],
  [255, 236, 200],
  [90, 200, 255],
];

/** Glow passes, widest first. `core` blends the trail color toward white. */
const PASSES = [
  { width: 7, alpha: 0.06, core: 0 },
  { width: 2.6, alpha: 0.22, core: 0.15 },
  { width: 1, alpha: 0.95, core: 0.65 },
] as const;

const BUCKETS = 12;

const mix = (a: RGB, b: RGB, k: number): RGB => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];

const css = ([r, g, b]: RGB) => `rgb(${r | 0} ${g | 0} ${b | 0})`;

function paintColor(t: number): RGB {
  const pos = (t / 1400) % PAINT.length;
  const i = Math.floor(pos);
  return mix(PAINT[i], PAINT[(i + 1) % PAINT.length], pos - i);
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

export function createExposure(canvas: HTMLCanvasElement, opts: ExposureOptions = {}): Exposure {
  const ctx = canvas.getContext('2d', { alpha: opts.background == null })!;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // With reduced motion nothing fades on its own: the picture only changes when the visitor paints.
  const userLife = reduceMotion ? Infinity : (opts.life ?? 6000);
  const ambientLife = reduceMotion ? Infinity : 7500;
  const target = opts.pointerTarget ?? canvas;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let backdrop: HTMLCanvasElement | null = null;

  const trails: Trail[] = [];
  const cyclists: Cyclist[] = [];
  let userTrail: Trail | null = null;
  let userTrailStarted = 0;
  let lastPointer: { x: number; y: number; t: number } | null = null;
  let pressed = false;
  let painted = false;

  let start = performance.now();
  let nextSpawn = 0;
  let raf = 0;
  let running = false;
  let visible = true;
  let destroyed = false;

  // ---------- sizing ----------
  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const prevW = width;
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    backdrop = opts.background ? makeBackdrop() : null;
    // Keep existing trails roughly in place when the width changes.
    if (prevW && prevW !== width) {
      const k = width / prevW;
      for (const tr of trails) for (const p of tr.pts) p.x *= k;
      for (const c of cyclists) c.x *= k;
    }
    if (!running) draw(performance.now());
  }

  /** Night sky, faint horizon glow and a few distant lights, rendered once per resize. */
  function makeBackdrop() {
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    g.fillStyle = opts.background!;
    g.fillRect(0, 0, width, height);

    // Blue-hour sky: deep blue overhead, fading through indigo to a plum-tinted street level.
    const sky = g.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, 'rgb(22 34 84 / 0.55)');
    sky.addColorStop(0.55, 'rgb(28 20 64 / 0.25)');
    sky.addColorStop(1, 'rgb(60 22 52 / 0.35)');
    g.fillStyle = sky;
    g.fillRect(0, 0, width, height);

    const horizon = g.createRadialGradient(width * 0.5, height * 1.15, 0, width * 0.5, height * 1.15, height * 1.1);
    horizon.addColorStop(0, 'rgb(255 140 60 / 0.22)');
    horizon.addColorStop(0.5, 'rgb(150 70 170 / 0.08)');
    horizon.addColorStop(1, 'rgb(0 0 0 / 0)');
    g.fillStyle = horizon;
    g.fillRect(0, 0, width, height);

    // Deterministic "stars" so the backdrop doesn't shimmer on resize.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const count = Math.round((width * height) / 9000);
    for (let i = 0; i < count; i++) {
      const x = rnd() * width;
      const y = rnd() * height * 0.7;
      const r = rnd() < 0.08 ? 1.1 : 0.6;
      g.fillStyle = `rgb(255 255 255 / ${0.08 + rnd() * 0.22})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  }

  // ---------- drawing ----------
  const pointFade = (tr: Trail, p: Point, now: number) => {
    const k = 1 - (now - p.t) / tr.life;
    return k <= 0 ? 0 : k * Math.sqrt(k) * p.a;
  };

  function drawTrail(tr: Trail, now: number) {
    const pts = tr.pts;
    const n = pts.length;
    if (n < 2) return;
    const paths: (Path2D | undefined)[] = new Array(BUCKETS + 1);
    let last = -1;
    for (let i = 1; i < n; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const b = Math.round(pointFade(tr, p1, now) * BUCKETS);
      if (b <= 0) {
        last = -1;
        continue;
      }
      const path = (paths[b] ??= new Path2D());
      const mx0 = (p0.x + p1.x) / 2;
      const my0 = (p0.y + p1.y) / 2;
      const p2 = pts[i + 1];
      const mx1 = p2 ? (p1.x + p2.x) / 2 : p1.x;
      const my1 = p2 ? (p1.y + p2.y) / 2 : p1.y;
      if (b !== last) path.moveTo(i === 1 ? p0.x : mx0, i === 1 ? p0.y : my0);
      path.quadraticCurveTo(p1.x, p1.y, mx1, my1);
      last = b;
    }
    for (const pass of PASSES) {
      ctx.lineWidth = tr.width * pass.width;
      ctx.strokeStyle = css(mix(tr.color, WHITE, pass.core));
      for (let b = 1; b <= BUCKETS; b++) {
        const path = paths[b];
        if (!path) continue;
        ctx.globalAlpha = (b / BUCKETS) * pass.alpha;
        ctx.stroke(path);
      }
    }
  }

  function draw(now: number) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (backdrop) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(backdrop, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const tr of trails) drawTrail(tr, now);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- ambient cyclists ----------
  function spawnCyclist() {
    const depth = Math.random();
    const scale = 0.55 + depth * 0.6;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const speed = (width / rand(4.2, 6.5)) * (0.7 + depth * 0.4);
    // Lanes sit in the middle band, clear of the headline at the bottom of the frame.
    const y = height * (0.34 + depth * 0.3);
    const front = 26 * dir;
    const back = -24 * dir;
    const mkLight = (dx: number, dy: number, color: RGB, w: number, pedal = false): Light => {
      const trail: Trail = { pts: [], color, width: w * scale, life: ambientLife };
      trails.push(trail);
      return { dx, dy, color, width: w, pedal, trail };
    };
    const lights = [mkLight(back, -24, TAIL, 1.7), mkLight(front, -40, HEAD, 1.5)];
    if (Math.random() < 0.75) lights.push(mkLight(0, 0, PEDAL, 1.1, true));
    const cadence = rand(1.2, 1.6) * Math.PI * 2;
    cyclists.push({
      x: dir > 0 ? -60 : width + 60,
      y,
      vx: speed * dir,
      scale,
      crankRadius: Math.min(13 * scale, (0.8 * speed) / cadence),
      crank: Math.random() * Math.PI * 2,
      cadence,
      bob: rand(1.2, 2.2),
      lights,
    });
  }

  function stepCyclists(now: number, dt: number) {
    const s = dt / 1000;
    for (let i = cyclists.length - 1; i >= 0; i--) {
      const c = cyclists[i];
      c.x += c.vx * s;
      c.crank += c.cadence * s;
      const dir = Math.sign(c.vx);
      for (const l of c.lights) {
        let x: number;
        let y: number;
        if (l.pedal) {
          // Crank radius < distance travelled per revolution, so this is a curtate trochoid: a pinched wave.
          x = c.x + Math.cos(c.crank) * c.crankRadius * dir;
          y = c.y + Math.sin(c.crank) * c.crankRadius;
        } else {
          // Riders bob twice per crank revolution, once per pedal stroke.
          x = c.x + l.dx * c.scale;
          y = c.y + (l.dy + Math.sin(c.crank * 2) * c.bob) * c.scale;
        }
        const prev = l.trail.pts.at(-1);
        if (!prev || now - prev.t >= 15) l.trail.pts.push({ x, y, t: now, a: 1 });
      }
      if (c.x < -120 || c.x > width + 120) cyclists.splice(i, 1);
    }
  }

  function prune(now: number) {
    for (let i = trails.length - 1; i >= 0; i--) {
      const tr = trails[i];
      let cut = 0;
      while (cut < tr.pts.length && now - tr.pts[cut].t > tr.life) cut++;
      if (cut) tr.pts.splice(0, Math.max(0, cut - 1));
      const idle = tr.pts.length < 2 && tr !== userTrail && !cyclists.some((c) => c.lights.some((l) => l.trail === tr));
      if (idle) trails.splice(i, 1);
    }
  }

  // ---------- visitor painting ----------
  function localPoint(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function beginUserTrail(now: number, from?: Point) {
    userTrail = { pts: from ? [{ ...from }] : [], color: paintColor(now - start), width: 2, life: userLife };
    userTrailStarted = now;
    trails.push(userTrail);
  }

  function onPointerMove(e: PointerEvent) {
    if (e.pointerType !== 'mouse' && !pressed) return;
    const now = performance.now();
    const { x, y } = localPoint(e);
    if (x < -20 || y < -20 || x > width + 20 || y > height + 20) return;

    // A pause or a jump starts a fresh stroke; long strokes are split so the color can drift.
    const gap = !lastPointer || now - lastPointer.t > 180 || Math.hypot(x - lastPointer.x, y - lastPointer.y) > 160;
    if (gap) beginUserTrail(now);
    else if (userTrail && now - userTrailStarted > 350) beginUserTrail(now, userTrail.pts.at(-1));

    const speed = lastPointer && !gap ? Math.hypot(x - lastPointer.x, y - lastPointer.y) / Math.max(1, now - lastPointer.t) : 0;
    // Like a real exposure, slow-moving lights burn brighter.
    const a = Math.min(1, Math.max(0.35, 1.25 - speed / 3)) * (pressed ? 1 : 0.85);
    userTrail!.pts.push({ x, y, t: now, a });
    lastPointer = { x, y, t: now };

    if (!painted) {
      painted = true;
      opts.onFirstPaint?.();
    }
    if (!running) draw(now);
  }

  function onPointerDown(e: PointerEvent) {
    pressed = true;
    lastPointer = null;
    onPointerMove(e);
  }

  function onPointerUp() {
    pressed = false;
  }

  function onPointerLeave() {
    lastPointer = null;
  }

  // ---------- loop ----------
  let lastFrame = performance.now();
  function frame(now: number) {
    const dt = Math.min(64, now - lastFrame);
    lastFrame = now;
    if (opts.ambient) {
      if (now > nextSpawn && cyclists.length < 4 && width > 0) {
        spawnCyclist();
        nextSpawn = now + rand(1400, 3800);
      }
      stepCyclists(now, dt);
    }
    prune(now);
    draw(now);
    opts.onTick?.((now - start) / 1000);
    raf = requestAnimationFrame(frame);
  }

  function play() {
    if (running || destroyed || reduceMotion) return;
    running = true;
    lastFrame = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function pause() {
    running = false;
    cancelAnimationFrame(raf);
  }

  const sync = () => (visible && !document.hidden ? play() : pause());

  /** Reduced motion: simulate a few seconds of traffic once, then hold still like a photograph. */
  function developStill() {
    if (!opts.ambient) return;
    const t0 = performance.now() - 8000;
    let t = t0;
    let spawnAt = t0;
    while (t < t0 + 8000) {
      if (t >= spawnAt && cyclists.length < 4) {
        spawnCyclist();
        spawnAt = t + rand(1400, 3000);
      }
      stepCyclists(t, 16);
      t += 16;
    }
    draw(performance.now());
  }

  // ---------- wiring ----------
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  });
  io.observe(canvas);
  document.addEventListener('visibilitychange', sync);
  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  resize();
  if (reduceMotion) developStill();
  else play();

  return {
    reset() {
      trails.length = 0;
      cyclists.length = 0;
      userTrail = null;
      lastPointer = null;
      start = performance.now();
      nextSpawn = start + 600;
      if (reduceMotion) developStill();
      draw(performance.now());
    },
    save(filename = 'long-exposure.png') {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
    },
    destroy() {
      destroyed = true;
      pause();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    },
  };
}
