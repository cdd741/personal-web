/**
 * A small endless runner. Jump the cacti, duck the pterodactyls, and every
 * 700 points night falls and the rex switches on its tail light, painting a
 * long-exposure trail of every jump.
 */
import {
  BIRD_DOWN,
  BIRD_UP,
  CACTUS_LARGE,
  CACTUS_SMALL,
  REX_DEAD,
  REX_DUCK_A,
  REX_DUCK_B,
  REX_RUN_A,
  REX_RUN_B,
  REX_STAND,
  drawSprite,
  spriteHeight,
  spriteWidth,
  type Sprite,
} from './sprites';

/** Logical canvas size; everything below is in these units. */
const W = 640;
const H = 180;
const PX = 2;
const GROUND = H - 24;
const REX_X = 44;

const GRAVITY = 2400;
const JUMP_V = 620;
const START_SPEED = 380;
const MAX_SPEED = 900;
const ACCEL = 7;
const NIGHT_EVERY = 700;
const NIGHT_LENGTH = 300;

type Box = { x: number; y: number; w: number; h: number };
type ObstacleKind = 'cactus-s' | 'cactus-l' | 'bird';

interface Obstacle {
  kind: ObstacleKind;
  x: number;
  y: number;
  count: number;
  sprite: Sprite;
  vx: number;
}

export interface RunnerEvents {
  onScore?: (score: number, hi: number) => void;
  onGameOver?: (score: number, hi: number, isBest: boolean) => void;
  onStart?: () => void;
}

export interface Runner {
  jump(): void;
  release(): void;
  duck(down: boolean): void;
  setColors(fg: string, bg: string): void;
  destroy(): void;
  readonly state: 'ready' | 'running' | 'over';
}

const HI_KEY = 'rex-hi';
const readHi = () => {
  try {
    return Number(localStorage.getItem(HI_KEY)) || 0;
  } catch {
    return 0;
  }
};
const writeHi = (v: number) => {
  try {
    localStorage.setItem(HI_KEY, String(v));
  } catch {}
};

type RGB = readonly [number, number, number];
const NIGHT_BG: RGB = [7, 8, 12];
const NIGHT_FG: RGB = [233, 231, 226];

const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const css = ([r, g, b]: RGB) => `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;

/** Parses the `rgb(...)` strings getComputedStyle returns, plus #rrggbb. */
function parseColor(value: string): RGB | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const nums = value.match(/[\d.]+/g);
  return nums && nums.length >= 3 ? [Number(nums[0]), Number(nums[1]), Number(nums[2])] : null;
}

/** Rows that contain at least one filled pixel. */
function spriteBounds(s: Sprite) {
  const filled = s.map((row, i) => (row.includes('X') ? i : -1)).filter((i) => i >= 0);
  return { top: filled[0], bottom: filled[filled.length - 1] + 1 };
}

const overlap = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pad = (n: number) => String(Math.floor(n)).padStart(5, '0');

export function createRunner(canvas: HTMLCanvasElement, events: RunnerEvents = {}): Runner {
  const ctx = canvas.getContext('2d')!;

  let fg: RGB = [22, 22, 26];
  let bg: RGB = [251, 251, 249];

  let state: Runner['state'] = 'ready';
  let raf = 0;
  let last = 0;
  let overAt = 0;

  let speed = START_SPEED;
  let distance = 0;
  let score = 0;
  let hi = readHi();
  let reportedScore = -1;

  // Rex
  let y = GROUND;
  let vy = 0;
  let holding = false;
  let ducking = false;
  let legClock = 0;

  let obstacles: Obstacle[] = [];
  let nextGap = 0;
  let clouds: { x: number; y: number }[] = [];
  let bumps: { x: number; w: number; dy: number }[] = [];
  /** Tail-light trail in world coordinates (x is distance travelled). */
  let trail: { d: number; y: number }[] = [];
  let night = 0;
  let flash = 0;

  function reset() {
    speed = START_SPEED;
    distance = 0;
    score = 0;
    y = GROUND;
    vy = 0;
    ducking = false;
    obstacles = [];
    trail = [];
    nextGap = 500;
    night = 0;
    clouds = Array.from({ length: 3 }, (_, i) => ({ x: 120 + i * 230 + rand(0, 80), y: rand(18, 70) }));
    bumps = Array.from({ length: 26 }, () => ({ x: rand(0, W), w: rand(1, 4), dy: rand(3, 12) }));
  }

  // ---------- sizing ----------
  let dpr = 1;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round((rect.width * H * dpr) / W);
    draw();
  }

  // ---------- helpers ----------
  const onGround = () => y >= GROUND;

  function rexSprite(): Sprite {
    if (state === 'over') return REX_DEAD;
    if (state === 'ready' || !onGround()) return REX_STAND;
    const alt = Math.floor(legClock * 10) % 2 === 0;
    if (ducking) return alt ? REX_DUCK_A : REX_DUCK_B;
    return alt ? REX_RUN_A : REX_RUN_B;
  }

  /** Forgiving hitboxes: a few rectangles hugging the sprite instead of its full bounds. */
  function rexBoxes(): Box[] {
    if (ducking && onGround()) {
      const top = y - spriteHeight(REX_DUCK_A) * PX;
      return [
        { x: REX_X + 2, y: top + 6, w: 40, h: 8 },
        { x: REX_X + 32, y: top + 2, w: 14, h: 6 },
      ];
    }
    const top = y - spriteHeight(REX_STAND) * PX;
    return [
      { x: REX_X + 20, y: top + 2, w: 14, h: 12 },
      { x: REX_X + 6, y: top + 16, w: 20, h: 12 },
      { x: REX_X + 10, y: top + 28, w: 10, h: 8 },
    ];
  }

  function obstacleBox(o: Obstacle): Box {
    const w = spriteWidth(o.sprite) * PX;
    const b = spriteBounds(o.sprite);
    const total = o.count * w + (o.count - 1) * 2;
    return { x: o.x + 3, y: o.y + b.top * PX + 2, w: total - 6, h: (b.bottom - b.top) * PX - 3 };
  }

  function spawn() {
    const birdsAllowed = score > 300;
    const roll = Math.random();
    let o: Obstacle;
    if (birdsAllowed && roll < 0.22) {
      // Bottom edge of the bird: low ones must be jumped, middle ones ducked, high ones fly over.
      const heights = [GROUND - 6, GROUND - 26, GROUND - 58];
      const by = heights[Math.floor(Math.random() * heights.length)];
      o = { kind: 'bird', x: W + 20, y: by - spriteHeight(BIRD_UP) * PX, count: 1, sprite: BIRD_UP, vx: rand(20, 60) };
    } else if (roll < 0.6) {
      const count = speed > 520 ? 1 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2);
      o = { kind: 'cactus-s', x: W + 20, y: GROUND - spriteHeight(CACTUS_SMALL) * PX, count, sprite: CACTUS_SMALL, vx: 0 };
    } else {
      const count = speed > 620 ? 1 + Math.floor(Math.random() * 2) : 1;
      o = { kind: 'cactus-l', x: W + 20, y: GROUND - spriteHeight(CACTUS_LARGE) * PX, count, sprite: CACTUS_LARGE, vx: 0 };
    }
    obstacles.push(o);
    const width = obstacleBox(o).w;
    nextGap = width + speed * rand(0.62, 1.25);
  }

  // ---------- simulation ----------
  function update(dt: number) {
    const s = dt / 1000;
    speed = Math.min(MAX_SPEED, speed + ACCEL * s);
    const dx = speed * s;
    distance += dx;
    score = distance / 10;
    legClock += s * (speed / START_SPEED);

    // Rex physics. Holding the jump key softens gravity on the way up for a higher jump.
    if (!onGround() || vy < 0) {
      const g = vy < 0 && holding ? GRAVITY * 0.7 : ducking ? GRAVITY * 2.6 : GRAVITY;
      vy += g * s;
      y += vy * s;
      if (y >= GROUND) {
        y = GROUND;
        vy = 0;
      }
    }

    // World.
    nextGap -= dx;
    if (nextGap <= 0) spawn();
    for (const o of obstacles) {
      o.x -= dx + o.vx * s;
      if (o.kind === 'bird') o.sprite = Math.floor(performance.now() / 160) % 2 ? BIRD_UP : BIRD_DOWN;
    }
    obstacles = obstacles.filter((o) => o.x > -80);
    for (const c of clouds) {
      c.x -= dx * 0.2;
      if (c.x < -60) {
        c.x = W + rand(20, 200);
        c.y = rand(18, 70);
      }
    }
    for (const b of bumps) {
      b.x -= dx;
      if (b.x < 0) b.x += W;
    }

    // Night falls every NIGHT_EVERY points and lasts NIGHT_LENGTH.
    const phase = score % NIGHT_EVERY;
    const target = score > NIGHT_EVERY && phase < NIGHT_LENGTH ? 1 : 0;
    night += (target - night) * Math.min(1, s * 2.5);
    if (night > 0.05) trail.push({ d: distance, y: y - 32 });
    const oldest = distance - W;
    while (trail.length && trail[0].d < oldest) trail.shift();
    if (night < 0.05) trail.length = 0;

    // Milestone flash every 100 points.
    const whole = Math.floor(score);
    if (whole !== reportedScore) {
      if (whole > 0 && whole % 100 === 0) flash = 1;
      reportedScore = whole;
      events.onScore?.(whole, Math.max(hi, whole));
    }
    flash = Math.max(0, flash - s * 1.5);

    const rex = rexBoxes();
    for (const o of obstacles) {
      const box = obstacleBox(o);
      if (rex.some((r) => overlap(r, box))) return gameOver();
    }
  }

  function gameOver() {
    state = 'over';
    overAt = performance.now();
    const final = Math.floor(score);
    const isBest = final > hi;
    if (isBest) {
      hi = final;
      writeHi(hi);
    }
    events.onGameOver?.(final, hi, isBest);
    draw();
  }

  // ---------- rendering ----------
  function draw() {
    const scale = canvas.width / W;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const nightFg = css(NIGHT_FG);
    const bgNow = css(mix(bg, NIGHT_BG, night));
    const fgNow = css(mix(fg, NIGHT_FG, night));

    ctx.fillStyle = bgNow;
    ctx.fillRect(0, 0, W, H);

    // Stars and moon at night.
    if (night > 0.05) {
      ctx.globalAlpha = night * 0.8;
      ctx.fillStyle = nightFg;
      for (let i = 0; i < 18; i++) {
        const sx = (((i * 97 + 13) % W) - distance * 0.02 + W * 4) % W;
        ctx.fillRect(sx, (i * 37) % 80 + 8, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
      }
      ctx.beginPath();
      ctx.arc(W - 120, 36, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = bgNow;
      ctx.beginPath();
      ctx.arc(W - 114, 32, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Clouds.
    ctx.strokeStyle = fgNow;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 2;
    for (const c of clouds) {
      ctx.beginPath();
      ctx.moveTo(c.x, c.y + 10);
      ctx.lineTo(c.x + 46, c.y + 10);
      ctx.moveTo(c.x + 8, c.y + 10);
      ctx.quadraticCurveTo(c.x + 10, c.y, c.x + 20, c.y + 2);
      ctx.quadraticCurveTo(c.x + 28, c.y - 6, c.x + 36, c.y + 3);
      ctx.quadraticCurveTo(c.x + 44, c.y + 3, c.x + 44, c.y + 10);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Ground.
    ctx.fillStyle = fgNow;
    ctx.fillRect(0, GROUND - 1, W, 2);
    ctx.globalAlpha = 0.5;
    for (const b of bumps) ctx.fillRect(b.x, GROUND + b.dy, b.w, 1);
    ctx.globalAlpha = 1;

    // Long-exposure tail light.
    if (trail.length > 1) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const toX = (d: number) => REX_X + 4 - (distance - d);
      for (const [w, a] of [
        [9, 0.08],
        [4, 0.25],
        [1.5, 0.9],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(toX(trail[0].d), trail[0].y);
        for (let i = 1; i < trail.length; i++) ctx.lineTo(toX(trail[i].d), trail[i].y);
        ctx.lineWidth = w;
        ctx.globalAlpha = a * night;
        ctx.strokeStyle = w < 2 ? '#ffb3a8' : '#ff3b30';
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // Obstacles.
    ctx.fillStyle = fgNow;
    for (const o of obstacles) {
      const w = spriteWidth(o.sprite) * PX;
      for (let i = 0; i < o.count; i++) drawSprite(ctx, o.sprite, o.x + i * (w + 2), o.y, PX);
    }

    // Rex.
    const sprite = rexSprite();
    drawSprite(ctx, sprite, REX_X, y - spriteHeight(sprite) * PX, PX);
    if (night > 0.05 && state !== 'ready') {
      ctx.globalAlpha = night;
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(REX_X + 2, y - 34, 3, 3);
      ctx.globalAlpha = 1;
    }

    // Score.
    ctx.font = '600 13px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = fgNow;
    const blink = flash > 0 && Math.floor(flash * 8) % 2 === 0;
    ctx.globalAlpha = 0.55;
    ctx.fillText(`HI ${pad(Math.max(hi, score))}`, W - 84, 12);
    ctx.globalAlpha = blink ? 0.2 : 1;
    ctx.fillText(pad(score), W - 16, 12);
    ctx.globalAlpha = 1;

    if (state !== 'running') {
      ctx.textAlign = 'center';
      ctx.font = '600 14px ui-monospace, monospace';
      const msg = state === 'ready' ? 'PRESS SPACE OR TAP TO START' : 'G A M E   O V E R';
      ctx.fillText(msg, W / 2, H / 2 - 30);
      if (state === 'over') {
        ctx.globalAlpha = 0.6;
        ctx.font = '12px ui-monospace, monospace';
        ctx.fillText('space / tap to run again', W / 2, H / 2 - 8);
        ctx.globalAlpha = 1;
      }
    }
  }

  // ---------- loop ----------
  function frame(now: number) {
    const dt = Math.min(34, now - last);
    last = now;
    if (state === 'running') {
      update(dt);
      draw();
    }
    if (state === 'running') raf = requestAnimationFrame(frame);
  }

  function start() {
    reset();
    state = 'running';
    events.onStart?.();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function onVisibility() {
    if (document.hidden && state === 'running') {
      cancelAnimationFrame(raf);
    } else if (!document.hidden && state === 'running') {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  document.addEventListener('visibilitychange', onVisibility);
  reset();
  resize();

  return {
    get state() {
      return state;
    },
    jump() {
      holding = true;
      if (state === 'ready') return start();
      if (state === 'over') {
        if (performance.now() - overAt > 450) start();
        return;
      }
      if (onGround() && !ducking) vy = -JUMP_V;
    },
    release() {
      holding = false;
    },
    duck(down: boolean) {
      if (state !== 'running') return;
      ducking = down;
    },
    setColors(nextFg: string, nextBg: string) {
      fg = parseColor(nextFg) ?? fg;
      bg = parseColor(nextBg) ?? bg;
      draw();
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
