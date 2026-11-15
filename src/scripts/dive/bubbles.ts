/**
 * ASCII bubbles rising through the home page's water. They trickle up on their own,
 * stream past when the visitor scrolls down (dives), and burst out at a splash.
 */

interface Bubble {
  x: number;
  y: number;
  rise: number;
  phase: number;
  glyph: string;
  size: number;
  alpha: number;
}

const GLYPHS = ['o', 'o', '°', '°', '.', 'O'];
const MAX = 110;

export interface Bubbles {
  /** Advance and draw. `current` is the water's vertical speed in px/s (negative = moving up the screen). */
  step(dt: number, current: number): void;
  burst(x: number, y: number, count?: number): void;
  resize(): void;
}

export function createBubbles(canvas: HTMLCanvasElement): Bubbles {
  const ctx = canvas.getContext('2d')!;
  const family = getComputedStyle(canvas).fontFamily;
  const bubbles: Bubble[] = [];
  let width = 0;
  let height = 0;
  let owed = 0;

  const add = (x: number, y: number) => {
    if (bubbles.length >= MAX) return;
    bubbles.push({
      x,
      y,
      rise: 26 + Math.random() * 48,
      phase: Math.random() * Math.PI * 2,
      glyph: GLYPHS[(Math.random() * GLYPHS.length) | 0],
      size: 10 + Math.random() * 9,
      alpha: 0.22 + Math.random() * 0.4,
    });
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  return {
    resize,
    burst(x, y, count = 16) {
      for (let i = 0; i < count; i++) add(x + (Math.random() - 0.5) * 160, y + (Math.random() - 0.5) * 90);
    },
    step(dt, current) {
      // A trickle always; a stream while diving (the water rushing up past the visitor).
      const diving = Math.max(0, -current);
      owed += dt * (0.5 + diving / 45);
      while (owed >= 1) {
        owed -= 1;
        add(Math.random() * width, diving > 120 ? height * (0.35 + Math.random() * 0.7) : height + 12);
      }

      ctx.clearRect(0, 0, width, height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.phase += dt * 2.2;
        b.y += (current * 0.9 - b.rise) * dt;
        b.x += Math.sin(b.phase) * 14 * dt;
        if (b.y < -20 || b.y > height + 60) {
          bubbles.splice(i, 1);
          continue;
        }
        // Fade in from the bottom edge and out towards the top.
        const edge = Math.min(1, (height + 20 - b.y) / 80, (b.y + 20) / 140);
        ctx.fillStyle = `rgba(205,236,255,${(b.alpha * Math.max(0, edge)).toFixed(3)})`;
        ctx.font = `600 ${b.size.toFixed(0)}px ${family}`;
        ctx.fillText(b.glyph, b.x, b.y);
      }
    },
  };
}
