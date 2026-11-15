/**
 * Scroll-scrubbed animation: ties a 0..1 progress value to how far an element has
 * travelled up the screen, so effects play forwards on the way down and backwards on
 * the way up. One scroll listener and one animation frame serve every registered element.
 */

export interface ScrubRange {
  /** Progress is 0 while the element's top is below this fraction of the viewport height… */
  from: number;
  /** …and 1 once its top has risen to this fraction. */
  to: number;
}

interface Entry {
  el: HTMLElement;
  range: ScrubRange;
  render: (progress: number) => void;
  /** Scroll positions where progress is 0 and 1. */
  start: number;
  end: number;
  last: number;
}

const entries: Entry[] = [];
const reduced = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
let queued = false;
let listening = false;

/** Distance from the top of the document, ignoring CSS transforms (so an animated element measures the same). */
function documentTop(el: HTMLElement) {
  let top = 0;
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
  return top;
}

function measure(entry: Entry) {
  const vh = window.innerHeight;
  const top = documentTop(entry.el);
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
  let start = top - entry.range.from * vh;
  let end = top - entry.range.to * vh;
  // Near the bottom of the page the element can't rise that far; finish by the last scroll position instead.
  if (end > maxScroll) {
    start = Math.min(start, maxScroll - vh * 0.2);
    end = maxScroll;
  }
  entry.start = start;
  entry.end = Math.max(end, start + 1);
}

function frame() {
  queued = false;
  const y = window.scrollY;
  for (const entry of entries) {
    const progress = reduced?.matches ? 1 : Math.min(1, Math.max(0, (y - entry.start) / (entry.end - entry.start)));
    if (progress === entry.last) continue;
    entry.last = progress;
    entry.render(progress);
  }
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(frame);
}

function remeasure() {
  for (const entry of entries) measure(entry);
  schedule();
}

/**
 * Calls `render(progress)` whenever the element's scroll progress changes. Under
 * prefers-reduced-motion, progress is always 1, so `render` should leave the element in
 * its finished state at 1.
 */
export function scrub(el: HTMLElement, range: ScrubRange, render: (progress: number) => void) {
  const entry: Entry = { el, range, render, start: 0, end: 1, last: -1 };
  entries.push(entry);
  measure(entry);
  if (!listening) {
    listening = true;
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', remeasure, { passive: true });
    window.addEventListener('load', remeasure);
    reduced?.addEventListener('change', schedule);
    // Late layout shifts (web fonts, images) move everything below them.
    new ResizeObserver(remeasure).observe(document.body);
  }
  schedule();
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
