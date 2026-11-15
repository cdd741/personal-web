/**
 * Runs the home page: a dive from the surface to the seabed.
 *
 * The page is a stack of scenes (src/components/home). Each pinned scene stays on screen
 * for a while as the visitor scrolls, and its animation is a pure function of the scroll
 * position, so it plays forwards going down and backwards going up. Behind the scenes
 * the water gets darker, the sharks change with depth and circle whatever is on screen,
 * fish are carried by the "current" of the scroll, and bubbles rise.
 *
 * With prefers-reduced-motion, or on very short screens, the scenes are ordinary
 * sections (see Scene.astro) and nothing here animates them.
 */
import { OceanEngine, type SharkKind, type SharkSpec } from '../../vendor/ascii-sharks';
import { createBubbles } from './bubbles';
import { mountSeabed } from './seabed';

// ---------- small helpers ----------
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** 0 before `from`, 1 after `to`, linear in between. */
const span = (v: number, from: number, to: number) => clamp01((v - from) / (to - from));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const $ = <T extends HTMLElement>(root: ParentNode, selector: string) => root.querySelector<T>(selector);
const $$ = <T extends HTMLElement>(root: ParentNode, selector: string) => [...root.querySelectorAll<T>(selector)];

/** Sets an element's opacity, vertical offset and scale; fully transparent elements leave the tab order. */
function pose(el: HTMLElement | null, opacity: number, y = 0, scale = 1) {
  if (!el) return;
  el.style.opacity = opacity.toFixed(3);
  el.style.translate = y ? `0 ${y.toFixed(1)}px` : '';
  el.style.scale = scale === 1 ? '' : scale.toFixed(4);
  el.style.visibility = opacity <= 0.001 ? 'hidden' : '';
}

function unpose(el: HTMLElement | null) {
  if (!el) return;
  el.style.opacity = el.style.translate = el.style.scale = el.style.visibility = el.style.transform = '';
}

/** Lights a run of words up one after another: `lit` is how many are fully on (fractions fade the next one in). */
function lightWords(words: HTMLElement[], lit: number, dim = 0.16) {
  words.forEach((word, i) => {
    word.style.opacity = (dim + (1 - dim) * clamp01(lit - i)).toFixed(3);
  });
}

// ---------- the scenes ----------
interface Scene {
  el: HTMLElement;
  name: string;
  /** Document position of the scene's top, and how many screens it stays pinned. */
  top: number;
  hold: number;
  pinned: boolean;
  sharks: SharkKind[];
  fish: number;
  focus: HTMLElement | null;
  /** `u` is in screens: -1 as the scene enters from below, 0 when it pins, `hold` when it lets go. */
  render: (u: number, scene: Scene) => void;
  reset: () => void;
}

/**
 * How a scene fades as its stage slides in from below and, later, off the top.
 * Scenes overlap by half a screen (Scene.astro), so the next scene's `u` is this one's
 * minus `hold + 0.5`: these two ranges meet exactly, and a scene is fully gone before
 * the next starts to show. Keep them that way, or two scenes are on screen at once.
 */
const entering = (u: number) => span(u, -0.3, 0.05);
const leaving = (u: number, hold: number) => span(u, hold - 0.15, hold + 0.2);

function buildScene(el: HTMLElement): Pick<Scene, 'render' | 'reset'> {
  switch (el.dataset.scene) {
    case 'greeting': {
      const copy = $(el, '[data-greeting]');
      return {
        render: (u, { hold }) => {
          const out = span(u, 0.05, hold + 0.2);
          pose(copy, 1 - out, -out * 70, 1 - out * 0.1);
        },
        reset: () => unpose(copy),
      };
    }

    case 'statement': {
      const block = $(el, '[data-statement]');
      const words = $$(el, '.word');
      return {
        render: (u, { hold }) => {
          const visible = entering(u) * (1 - leaving(u, hold));
          pose(block, visible, (1 - easeOut(entering(u))) * 50);
          lightWords(words, span(u, -0.15, hold - 0.25) * words.length);
        },
        reset: () => {
          unpose(block);
          words.forEach((w) => (w.style.opacity = ''));
        },
      };
    }

    case 'work': {
      const head = $(el, '[data-work-head]');
      const line = $(el, '[data-work-line]');
      const more = $(el, '[data-work-more]');
      const entries = $$(el, '[data-work-entry]');
      return {
        render: (u, { hold }) => {
          const out = 1 - leaving(u, hold);
          pose(head, entering(u) * out);
          // Each entry gets its turn: it rises in, then dims when the next one arrives.
          const step = (hold - 0.5) / Math.max(1, entries.length - 1);
          const at = (i: number) => 0.05 + i * step;
          entries.forEach((entry, i) => {
            const arrive = span(u, at(i) - 0.3, at(i));
            const dimmed = i < entries.length - 1 ? span(u, at(i + 1) - 0.3, at(i + 1)) : 0;
            pose(entry, arrive * (1 - 0.6 * dimmed) * out, (1 - easeOut(arrive)) * 44);
          });
          const last = at(entries.length - 1);
          if (line) {
            line.style.transform = `scaleY(${span(u, -0.25, last).toFixed(4)})`;
            line.style.opacity = out.toFixed(3);
          }
          pose(more, span(u, last, last + 0.2) * out, (1 - span(u, last, last + 0.2)) * 20);
        },
        reset: () => [head, line, more, ...entries].forEach(unpose),
      };
    }

    case 'numbers': {
      const head = $(el, '[data-numbers-head]');
      const stats = $$(el, '[data-stat]').map((stat) => {
        const value = $(stat, '[data-stat-value]')!;
        return { stat, value, to: Number(value.dataset.to), shown: '' };
      });
      return {
        render: (u, { hold }) => {
          const out = 1 - leaving(u, hold);
          pose(head, entering(u) * out);
          stats.forEach((s, i) => {
            const p = span(u, -0.3 + i * 0.14, 0.2 + i * 0.14);
            pose(s.stat, p * out, (1 - easeOut(p)) * 40);
            // Small numbers ("1st") don't count up: 0st, 1st reads as a glitch.
            const next = String(s.to > 1 ? Math.round(s.to * easeOut(p)) : s.to);
            if (next !== s.shown) s.value.textContent = s.shown = next;
          });
        },
        reset: () => {
          unpose(head);
          for (const s of stats) {
            unpose(s.stat);
            s.value.textContent = s.shown = String(s.to);
          }
        },
      };
    }

    case 'project': {
      const kicker = $(el, '[data-project-kicker]');
      const title = $(el, '[data-project-title]');
      const award = $(el, '[data-project-award]');
      const desc = $(el, '[data-project-desc]');
      const words = desc ? $$(desc, '.word') : [];
      const tags = $$(el, '[data-project-tag]');
      const links = $(el, '[data-project-links]');
      return {
        render: (u, { hold }) => {
          const out = 1 - leaving(u, hold);
          const arrive = entering(u);
          pose(kicker, arrive * out);
          pose(title, arrive * out, 0, 1.22 - 0.22 * easeOut(arrive));
          const pop = span(u, 0, 0.2);
          pose(award, pop * out, 0, 0.8 + 0.2 * easeOut(pop));
          pose(desc, span(u, 0, 0.15) * out);
          lightWords(words, span(u, 0.05, 0.5) * words.length, 0.2);
          tags.forEach((tag, i) => {
            const p = span(u, 0.3 + i * 0.04, 0.46 + i * 0.04);
            pose(tag, p * out, (1 - easeOut(p)) * 18);
          });
          const p = span(u, 0.6, 0.76);
          pose(links, p * out, (1 - easeOut(p)) * 18);
        },
        reset: () => {
          [kicker, title, award, desc, links, ...tags].forEach(unpose);
          words.forEach((w) => (w.style.opacity = ''));
        },
      };
    }

    case 'github': {
      const block = $(el, '[data-github]');
      const heatmap = el.querySelector<SVGElement>('[data-heatmap]');
      const total = $(el, '[data-contrib-total]');
      const count = Number(total?.dataset.contribTotal ?? 0);
      const fmt = new Intl.NumberFormat('en');
      let shown = '';
      const sweep = (progress: number) => {
        heatmap?.style.setProperty('--sweep', progress.toFixed(4));
        const next = fmt.format(Math.round(count * progress));
        if (total && next !== shown) total.textContent = shown = next;
      };
      return {
        render: (u, { hold }) => {
          const arrive = entering(u);
          pose(block, arrive * (1 - leaving(u, hold)), (1 - easeOut(arrive)) * 50);
          sweep(span(u, -0.2, hold - 0.4));
        },
        reset: () => {
          unpose(block);
          sweep(1);
        },
      };
    }

    case 'seabed': {
      const copy = $(el, '[data-seabed-copy]');
      return {
        // Never pinned: it's the end of the page, so it just fades in as it comes up.
        render: (u) => {
          // The scene above it is gone by the time this one is 0.8 of a screen from the top.
          const arrive = span(u, -0.8, -0.3);
          pose(copy, arrive, (1 - easeOut(arrive)) * 50);
        },
        reset: () => unpose(copy),
      };
    }

    default:
      return { render: () => {}, reset: () => {} };
  }
}

// ---------- the water ----------
/** Every shark that can appear; each scene names the ones it wants (data-sharks). */
const ROSTER: SharkSpec[] = [
  { kind: 'mako', size: 0.8 },
  { kind: 'classic', size: 0.72 },
  { kind: 'hammerhead', size: 1 },
  { kind: 'thresher', size: 0.9 },
  { kind: 'tiger', size: 1 },
  { kind: 'nurse', size: 0.85 },
];

/** Water colour at the surface and at the bottom, as [top, bottom] RGB. */
const SHALLOW = [
  [27, 111, 143],
  [12, 59, 88],
];
const DEEP = [
  [3, 10, 22],
  [0, 2, 6],
];
const MAX_DEPTH = 200;

export function startDive(root: HTMLElement) {
  const backdrop = $(document, '[data-dive-backdrop]');
  const oceanCanvas = document.querySelector<HTMLCanvasElement>('[data-dive-ocean]');
  const bubbleCanvas = document.querySelector<HTMLCanvasElement>('[data-dive-bubbles]');
  if (!backdrop || !oceanCanvas || !bubbleCanvas) return;

  const rays = $(document, '[data-dive-rays]');
  const depth = $(document, '[data-dive-depth]');
  const depthValue = $(document, '[data-dive-depth-value]');
  const depthLabel = $(document, '[data-dive-depth-label]');
  const header = $(document, '.site-header');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = window.innerWidth < 640;

  const scenes: Scene[] = $$(root, '[data-scene]').map((el) => ({
    el,
    name: el.dataset.scene ?? '',
    top: 0,
    hold: 0,
    pinned: false,
    // One shark per scene on small screens, so the fish and the text keep some room.
    sharks: (el.dataset.sharks ?? '').split(',').filter(Boolean).slice(0, narrow ? 1 : undefined) as SharkKind[],
    fish: Number(el.dataset.fish ?? 1),
    focus: $(el, '[data-focus]'),
    ...buildScene(el),
  }));

  const engine = new OceanEngine(oceanCanvas, ROSTER);
  const world = engine.world;
  const bubbles = createBubbles(bubbleCanvas);
  const floor = $(root, '[data-seabed-floor]');
  if (floor) mountSeabed(floor);

  let vh = window.innerHeight;
  let maxScroll = 1;
  const measure = () => {
    vh = window.innerHeight;
    maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
    for (const scene of scenes) {
      const stage = $(scene.el, '[data-stage]');
      scene.top = scene.el.getBoundingClientRect().top + window.scrollY;
      scene.pinned = !!stage && getComputedStyle(stage).position === 'sticky';
      scene.hold = scene.pinned ? (scene.el.offsetHeight - stage!.offsetHeight) / vh : 0;
      if (!stage) continue;
      // A pinned scene has exactly one screen to live in. If its content is taller than
      // that (a short window, large text), shrink it to fit instead of letting it spill
      // over the scenes above and below.
      let fit = 1;
      if (scene.pinned) {
        const style = getComputedStyle(stage);
        const room = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        let content = 0;
        for (const child of stage.children) content += (child as HTMLElement).offsetHeight;
        if (content > room) fit = Math.max(0.5, room / content);
      }
      stage.style.setProperty('--fit', fit.toFixed(4));
    }
  };

  let active: Scene | null = null;
  let lastScrollY = window.scrollY;
  let shownDepth = '';

  /** Everything that depends only on where the page is scrolled to. */
  const renderScroll = () => {
    const y = Math.max(0, window.scrollY);
    const whole = clamp01(y / maxScroll);

    // Water: lighter at the surface, close to black at the bottom; the light rays die out early.
    const t = Math.pow(whole, 0.75);
    const colour = (i: number) => `rgb(${SHALLOW[i].map((c, k) => Math.round(mix(c, DEEP[i][k], t))).join(' ')})`;
    backdrop.style.setProperty('--water-top', colour(0));
    backdrop.style.setProperty('--water-bottom', colour(1));
    if (rays) rays.style.opacity = (1 - span(whole, 0, 0.3)).toFixed(3);
    // The sharks and fish dim once there is more to read on top of them, and come back at the seabed.
    oceanCanvas.style.opacity = (1 - 0.45 * span(whole, 0.12, 0.35) + 0.3 * span(whole, 0.9, 1)).toFixed(3);

    if (depth && depthValue) {
      depth.classList.toggle('diving', y > 8);
      const next = String(Math.round(whole * MAX_DEPTH)).padStart(3, '0');
      if (next !== shownDepth) depthValue.textContent = shownDepth = next;
      if (depthLabel) depthLabel.textContent = whole > 0.985 ? 'Seabed' : 'Depth';
    }

    // The header leaves while you scroll down and returns when you scroll up or reach an end.
    if (header) {
      const goingDown = y > lastScrollY + 2;
      const goingUp = y < lastScrollY - 2;
      if (y < 80 || goingUp) delete header.dataset.away;
      else if (goingDown) header.dataset.away = '';
    }
    lastScrollY = y;

    let next: Scene | null = null;
    for (const scene of scenes) {
      const u = (y - scene.top) / vh;
      if (u > -0.5 && u < scene.hold + 0.5) next = scene;
      if (scene.name !== 'seabed' && (!scene.pinned || reduced.matches)) continue;
      // Only scenes on or near the screen need work.
      if (u > -1.3 && u < scene.hold + 1.3) scene.render(u, scene);
    }
    if (next && next !== active) enter(next, active !== null);
  };

  /** A new scene took over the screen: swap the sharks, thin or thicken the fish, splash. */
  const enter = (scene: Scene, announce: boolean) => {
    active = scene;
    const wanted = new Set(scene.sharks);
    for (const shark of world.sharks) {
      if (wanted.has(shark.kind)) world.recall(shark);
      else shark.away = true;
    }
    world.fishShare = scene.fish;
    if (announce && !reduced.matches) {
      const x = oceanCanvas.clientWidth * (0.25 + Math.random() * 0.5);
      const yy = oceanCanvas.clientHeight * (0.3 + Math.random() * 0.4);
      world.splash(x, yy);
      bubbles.burst(x, yy);
    }
  };

  // ---------- the continuous part: current, focus, bubbles ----------
  const focus = { x: 0, y: 0 };
  const clear = { rx: 0, ry: 0 };
  let focusReady = false;
  let current = 0;
  let previousY = window.scrollY;
  let previousTime = performance.now();
  let raf = 0;

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, Math.max(0.001, (now - previousTime) / 1000));
    previousTime = now;

    // Scrolling down moves the visitor down through the water, so the water (and the fish
    // in it) streams up the screen; scrolling up, the other way.
    const speed = (window.scrollY - previousY) / dt;
    previousY = window.scrollY;
    const target = Math.max(-650, Math.min(650, -speed * 0.45));
    current += (target - current) * Math.min(1, dt * 5);
    if (Math.abs(current) < 0.5) current = 0;
    world.drift.y = current;

    // Sharks patrol around whatever the current scene is showing, and stay off the text.
    const W = oceanCanvas.clientWidth;
    const H = oceanCanvas.clientHeight;
    let tx = W / 2;
    let ty = H / 2;
    let trx = W * 0.3;
    let tryy = H * 0.16;
    let strength = 1;
    const rect = active?.focus?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.bottom > 0 && rect.top < H) {
      // The zone is wider than the text because only a shark's snout is steered; its body trails behind.
      tx = rect.left + rect.width / 2;
      ty = Math.min(H, Math.max(0, rect.top + rect.height / 2));
      trx = Math.min(rect.width / 2 + 70, W * 0.46);
      tryy = Math.min(rect.height / 2 + 70, H * 0.38);
      strength = 3;
    }
    world.clearStrength = strength;
    const k = focusReady ? Math.min(1, dt * 1.5) : 1;
    focusReady = true;
    focus.x += (tx - focus.x) * k;
    focus.y += (ty - focus.y) * k;
    clear.rx += (trx - clear.rx) * k;
    clear.ry += (tryy - clear.ry) * k;
    world.focus = focus;
    world.clear = clear;

    bubbles.step(dt, current);
  };

  const sync = () => {
    cancelAnimationFrame(raf);
    world.drift.y = 0;
    if (reduced.matches) {
      for (const scene of scenes) scene.reset();
    } else if (!document.hidden) {
      previousTime = performance.now();
      previousY = window.scrollY;
      raf = requestAnimationFrame(tick);
    }
    renderScroll();
  };

  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      renderScroll();
    });
  };
  const onResize = () => {
    measure();
    bubbles.resize();
    for (const scene of scenes) if (!scene.pinned && scene.name !== 'seabed') scene.reset();
    renderScroll();
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('load', onResize);
  new ResizeObserver(onResize).observe(root);
  reduced.addEventListener('change', () => {
    measure();
    sync();
  });
  document.addEventListener('visibilitychange', sync);

  // The seabed's two controls.
  $(root, '[data-seabed-surface]')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduced.matches ? 'auto' : 'smooth' });
  });
  $(root, '[data-seabed-chest]')?.addEventListener('click', () => {
    document.querySelector<HTMLElement>('[data-cmdk-open]')?.click();
  });

  onResize();
  // Sharks the opening scene doesn't want start out of frame, not swimming away.
  for (const shark of world.sharks) if (shark.away) world.park(shark);
  sync();
}
