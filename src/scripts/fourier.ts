/**
 * Draws a signature with a Fourier series: a chain of circles, each spinning at a
 * fixed whole-number speed, whose tip traces the handwriting. Fewer circles give a
 * blurrier, rounder signature; more circles sharpen it.
 */

type Point = readonly [number, number];

interface Term {
  freq: number;
  re: number;
  im: number;
  amp: number;
}

export interface SignatureData {
  points: Point[];
  /** One character per point: '1' pen down, '0' pen up (never drawn). */
  pen: string;
  aspect: number;
}

export interface FourierOptions {
  /** Initial number of circles. */
  terms?: number;
  /** Seconds per full drawing. */
  seconds?: number;
}

export interface FourierDrawing {
  setTerms(n: number): void;
  readonly maxTerms: number;
  destroy(): void;
}

/** Ink colors from the first letter to the last, same palette as the hero trails. */
const INK = ['#ffb547', '#ff6259', '#ff6fae', '#a594ff', '#4fd1f2'];

const SUBSTEPS = 3;

function dft(points: Point[]): Term[] {
  const n = points.length;
  const terms: Term[] = [];
  for (let k = 0; k < n; k++) {
    let re = 0;
    let im = 0;
    for (let j = 0; j < n; j++) {
      const a = (-2 * Math.PI * k * j) / n;
      const [x, y] = points[j];
      re += x * Math.cos(a) - y * Math.sin(a);
      im += x * Math.sin(a) + y * Math.cos(a);
    }
    re /= n;
    im /= n;
    terms.push({ freq: k <= n / 2 ? k : k - n, re, im, amp: Math.hypot(re, im) });
  }
  // Biggest circles first: they carry the overall shape, the small ones add detail.
  return terms.sort((a, b) => b.amp - a.amp);
}

export function createFourier(canvas: HTMLCanvasElement, data: SignatureData, opts: FourierOptions = {}): FourierDrawing {
  const ctx = canvas.getContext('2d')!;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const terms = dft(data.points);
  const n = data.points.length;
  const steps = n * SUBSTEPS;
  const seconds = opts.seconds ?? 9;

  let count = Math.min(opts.terms ?? 80, n);
  /** The traced curve for the current circle count, in unit coordinates. */
  let curve: Float64Array = new Float64Array(0);

  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let running = false;
  let visible = true;
  let start = performance.now();

  function evaluate(t: number, upTo: number, out?: Float64Array, at = 0) {
    let x = 0;
    let y = 0;
    for (let i = 0; i < upTo; i++) {
      const { freq, re, im } = terms[i];
      const a = (2 * Math.PI * freq * t) / n;
      const c = Math.cos(a);
      const s = Math.sin(a);
      x += re * c - im * s;
      y += re * s + im * c;
    }
    if (out) {
      out[at] = x;
      out[at + 1] = y;
    }
    return [x, y] as const;
  }

  function rebuild() {
    curve = new Float64Array(steps * 2);
    for (let i = 0; i < steps; i++) evaluate(i / SUBSTEPS, count, curve, i * 2);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    if (!running) draw(performance.now());
  }

  const scale = () => Math.min(width * 0.4, (height * 0.34) / data.aspect);
  const toX = (x: number) => width / 2 + x * scale();
  // Sit a little below center, clear of the caption at the top of the card.
  const toY = (y: number) => height * 0.57 + y * scale();

  function drawInk(upTo: number, alpha: number) {
    // One path per glow pass (a single stroke never brightens where it overlaps itself),
    // colored by a left-to-right gradient since the name is written left to right.
    const path = new Path2D();
    let drawing = false;
    for (let i = 0; i < upTo; i++) {
      const penDown = data.pen[Math.floor(i / SUBSTEPS)] === '1';
      const x = toX(curve[i * 2]);
      const y = toY(curve[i * 2 + 1]);
      if (penDown && drawing) path.lineTo(x, y);
      else if (penDown) path.moveTo(x, y);
      drawing = penDown;
    }
    const gradient = ctx.createLinearGradient(toX(-1), 0, toX(1), 0);
    INK.forEach((c, i) => gradient.addColorStop(i / (INK.length - 1), c));
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = gradient;
    for (const [w, a] of [
      [7, 0.1],
      [3, 0.32],
      [1.4, 0.95],
    ] as const) {
      ctx.lineWidth = w;
      ctx.globalAlpha = a * alpha;
      ctx.stroke(path);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawCircles(t: number) {
    let x = 0;
    let y = 0;
    ctx.lineWidth = 1;
    for (let i = 0; i < count; i++) {
      const { freq, re, im, amp } = terms[i];
      const a = (2 * Math.PI * freq * t) / n;
      const nx = x + re * Math.cos(a) - im * Math.sin(a);
      const ny = y + re * Math.sin(a) + im * Math.cos(a);
      const r = amp * scale();
      if (freq !== 0 && r > 0.6) {
        ctx.strokeStyle = 'rgb(255 255 255 / 0.1)';
        ctx.beginPath();
        ctx.arc(toX(x), toY(y), r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgb(255 255 255 / 0.32)';
        ctx.beginPath();
        ctx.moveTo(toX(x), toY(y));
        ctx.lineTo(toX(nx), toY(ny));
        ctx.stroke();
      }
      x = nx;
      y = ny;
    }
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgb(255 200 150 / 0.9)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(toX(x), toY(y), 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function draw(now: number) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (reduceMotion || !running) {
      drawInk(steps, 1);
      return;
    }
    // One pass draws the signature, then it holds for a moment and fades before the next pass.
    const drawMs = seconds * 1000;
    const holdMs = 2200;
    const fadeMs = 700;
    const elapsed = (now - start) % (drawMs + holdMs + fadeMs);
    if (elapsed < drawMs) {
      const t = (elapsed / drawMs) * n;
      drawInk(Math.floor(t * SUBSTEPS), 1);
      drawCircles(t);
    } else {
      const fade = elapsed < drawMs + holdMs ? 1 : 1 - (elapsed - drawMs - holdMs) / fadeMs;
      drawInk(steps, fade);
    }
  }

  function frame(now: number) {
    draw(now);
    raf = requestAnimationFrame(frame);
  }

  function sync() {
    const shouldRun = visible && !document.hidden && !reduceMotion;
    if (shouldRun && !running) {
      running = true;
      start = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!shouldRun && running) {
      running = false;
      cancelAnimationFrame(raf);
      draw(performance.now());
    }
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  });
  io.observe(canvas);
  document.addEventListener('visibilitychange', sync);

  rebuild();
  resize();
  sync();

  return {
    maxTerms: n,
    setTerms(next: number) {
      count = Math.max(1, Math.min(n, Math.round(next)));
      rebuild();
      if (!running) draw(performance.now());
    },
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
    },
  };
}
