import { createExposure } from './long-exposure';
import { REX_RUN_A, REX_RUN_B, drawSprite, spriteHeight, spriteWidth } from './sprites';
import { toast } from './toast';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A tiny rex sprints along the bottom of the screen, hopping once or twice. */
export function runRex() {
  if (document.querySelector('.rex-cameo')) return;
  if (reduceMotion()) {
    toast('🦖 rawr (quietly, since you prefer reduced motion)');
    return;
  }
  const px = 3;
  const w = spriteWidth(REX_RUN_A) * px;
  const h = spriteHeight(REX_RUN_A) * px;
  const canvas = document.createElement('canvas');
  canvas.className = 'rex-cameo';
  canvas.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = w * dpr;
  canvas.height = (h + 60) * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h + 60}px`;
  document.body.append(canvas);

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const color = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim() || '#16161a';
  const hops = [0.3 + Math.random() * 0.15, 0.62 + Math.random() * 0.15];
  const duration = 3200;
  const t0 = performance.now();

  function frame(now: number) {
    const k = (now - t0) / duration;
    if (k >= 1) return canvas.remove();
    const x = -w + k * (window.innerWidth + w * 2);
    let lift = 0;
    for (const hop of hops) {
      const u = (k - hop) / 0.09;
      if (u > 0 && u < 1) lift = Math.sin(u * Math.PI) * 55;
    }
    canvas.style.transform = `translate3d(${x}px, 0, 0)`;
    ctx.clearRect(0, 0, w, h + 60);
    ctx.fillStyle = color;
    const sprite = lift > 0 || Math.floor(now / 90) % 2 ? REX_RUN_A : REX_RUN_B;
    drawSprite(ctx, sprite, 0, 60 - lift, px);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/** Dims the whole page and lets the cursor paint long-exposure light over it. Esc or click to leave. */
export function lightsOut() {
  if (document.querySelector('.lights-out')) return;
  const layer = document.createElement('div');
  layer.className = 'lights-out';
  const canvas = document.createElement('canvas');
  const note = document.createElement('p');
  note.textContent = 'Lights out. Paint with your cursor or finger. ';
  const done = document.createElement('button');
  done.type = 'button';
  done.textContent = 'Lights on (Esc)';
  note.append(done);
  layer.append(canvas, note);
  document.body.append(layer);
  requestAnimationFrame(() => layer.classList.add('in'));

  const exposure = createExposure(canvas, { ambient: false, background: null, pointerTarget: layer, life: 9000 });
  const close = () => {
    exposure.destroy();
    layer.classList.remove('in');
    window.removeEventListener('keydown', onKey);
    setTimeout(() => layer.remove(), 400);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  window.addEventListener('keydown', onKey);
  done.addEventListener('click', close);
  done.addEventListener('pointerdown', (e) => e.stopPropagation());
  done.focus();
}

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

export function listenForKonami() {
  let i = 0;
  window.addEventListener('keydown', (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    i = key === KONAMI[i] ? i + 1 : key === KONAMI[0] ? 1 : 0;
    if (i === KONAMI.length) {
      i = 0;
      toast('↑↑↓↓←→←→BA · +30 lives (not really)');
      runRex();
    }
  });
}

export function greetDevelopers() {
  console.log(
    '%c● %cHi there, fellow view-sourcerer.\n%cPress ⌘K (or Ctrl K) and try typing "lights" or "rex".\nSource: https://github.com/cdd741/personal-web',
    'color:#e0403a;font-size:16px',
    'font-weight:600',
    'color:inherit',
  );
}
