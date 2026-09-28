let region: HTMLElement | null = null;

/** Shows a short, polite, self-dismissing message at the bottom of the screen. */
export function toast(message: string, ms = 3200) {
  if (!region) {
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  region.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 300);
  }, ms);
}
