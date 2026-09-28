export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function getThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {}
  return 'system';
}

export function effectiveTheme(): 'light' | 'dark' {
  const choice = getThemeChoice();
  if (choice !== 'system') return choice;
  return media().matches ? 'dark' : 'light';
}

export function setTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {}
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  window.dispatchEvent(new CustomEvent('themechange', { detail: effectiveTheme() }));
}

export function toggleTheme() {
  setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark');
}

/** Calls `fn` now and whenever the effective theme changes. */
export function onThemeChange(fn: (theme: 'light' | 'dark') => void) {
  const run = () => fn(effectiveTheme());
  window.addEventListener('themechange', run);
  media().addEventListener('change', run);
  run();
}
