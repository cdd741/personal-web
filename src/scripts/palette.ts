import { lightsOut, runRex } from './eggs';
import { setTheme, toggleTheme } from './theme';
import { toast } from './toast';

interface Item {
  group: string;
  label: string;
  href?: string;
  action?: string;
  keywords?: string;
}

interface Command extends Item {
  run: () => void;
  secret?: boolean;
}

/** Unlisted commands: they only appear when their exact trigger is typed. */
const SECRETS: { triggers: string[]; label: string; run: () => void }[] = [
  { triggers: ['lights', 'lights out', 'exposure', 'long exposure'], label: 'Lights out', run: lightsOut },
  { triggers: ['rex', 't-rex', 'trex', 'dino', 'rawr'], label: 'Release the rex', run: runRex },
  { triggers: ['sudo', 'sudo rm -rf /', 'rm -rf /'], label: 'sudo', run: () => toast('Nice try. This incident will be reported. 🚨') },
  { triggers: ['coffee', 'tea', '418'], label: 'Brew coffee', run: () => toast("418 I'm a teapot. ☕") },
  { triggers: ['hello', 'hi', 'hey', 'bonjour'], label: 'Say hi', run: () => toast('👋 Hi! Thanks for stopping by.') },
  { triggers: ['42'], label: 'The answer', run: () => toast('Correct. Now, what was the question?') },
  { triggers: ['whoami'], label: 'whoami', run: () => toast('guest@andre-chen.com, curious, clearly.') },
  { triggers: ['cheat', 'cheats', 'konami'], label: 'Cheat codes', run: () => toast('Try ↑↑↓↓←→←→BA anywhere on the site.') },
  {
    triggers: ['photo', 'photos', 'photography', 'gallery'],
    label: 'Photography',
    run: () => toast('The old gallery retired, but the long exposure lives on the home page. 📷'),
  },
];

function score(cmd: Command, q: string): number {
  const label = cmd.label.toLowerCase();
  const hay = `${label} ${cmd.group.toLowerCase()} ${(cmd.keywords ?? '').toLowerCase()}`;
  if (label.startsWith(q)) return 300 - label.length;
  const i = hay.indexOf(q);
  if (i >= 0) return 200 - i;
  // Loose subsequence match on the label ("wrt" finds "Writing").
  let j = 0;
  for (const ch of label) if (ch === q[j]) j++;
  return j === q.length ? 50 - label.length : 0;
}

export function initPalette() {
  const dialog = document.querySelector<HTMLDialogElement>('[data-cmdk]');
  const input = document.querySelector<HTMLInputElement>('[data-cmdk-input]');
  const list = document.querySelector<HTMLUListElement>('[data-cmdk-list]');
  const data = document.querySelector('[data-cmdk-items]');
  if (!dialog || !input || !list || !data) return;

  const actions: Record<string, () => void> = {
    'theme-toggle': toggleTheme,
    'theme-system': () => {
      setTheme('system');
      toast('Following your system theme.');
    },
    'copy-link': () => {
      navigator.clipboard?.writeText(location.href).then(
        () => toast('Link copied.'),
        () => toast('Could not copy the link.'),
      );
    },
  };

  const commands: Command[] = (JSON.parse(data.textContent || '[]') as Item[]).map((item) => ({
    ...item,
    run: item.href
      ? () => {
          if (/^https?:/.test(item.href!)) window.open(item.href, '_blank', 'noopener');
          else location.href = item.href!;
        }
      : (actions[item.action ?? ''] ?? (() => {})),
  }));

  let results: Command[] = [];
  let active = 0;

  function filter(query: string): Command[] {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    const secret = SECRETS.find((s) => s.triggers.includes(q));
    const found = commands
      .map((c) => [c, score(c, q)] as const)
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c);
    return secret ? [{ group: 'You found one', label: secret.label, run: secret.run, secret: true }, ...found] : found;
  }

  function render() {
    results = filter(input!.value);
    active = Math.min(active, Math.max(0, results.length - 1));
    list!.replaceChildren();
    if (!results.length) {
      const li = document.createElement('li');
      li.className = 'none';
      li.textContent = 'Nothing here… or is there?';
      list!.append(li);
      input!.removeAttribute('aria-activedescendant');
      return;
    }
    const byGroup = new Map<string, number[]>();
    results.forEach((c, i) => byGroup.set(c.group, [...(byGroup.get(c.group) ?? []), i]));
    for (const [group, indexes] of byGroup) {
      const heading = document.createElement('li');
      heading.className = 'group';
      heading.setAttribute('role', 'presentation');
      heading.textContent = group;
      list!.append(heading);
      for (const i of indexes) {
        const c = results[i];
        const li = document.createElement('li');
        li.id = `cmdk-opt-${i}`;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === active));
        if (c.secret) li.className = 'secret';
        li.textContent = c.secret ? `✦ ${c.label}` : c.label;
        if (c.href && /^https?:/.test(c.href)) {
          const meta = document.createElement('span');
          meta.className = 'meta';
          meta.textContent = '↗';
          li.append(meta);
        }
        li.addEventListener('pointermove', () => select(i));
        li.addEventListener('click', () => execute(i));
        list!.append(li);
      }
    }
    input!.setAttribute('aria-activedescendant', `cmdk-opt-${active}`);
  }

  function select(i: number) {
    if (i === active) return;
    list!.querySelector(`#cmdk-opt-${active}`)?.setAttribute('aria-selected', 'false');
    active = i;
    const el = list!.querySelector(`#cmdk-opt-${active}`);
    el?.setAttribute('aria-selected', 'true');
    el?.scrollIntoView({ block: 'nearest' });
    input!.setAttribute('aria-activedescendant', `cmdk-opt-${active}`);
  }

  function execute(i: number) {
    const cmd = results[i];
    if (!cmd) return;
    close();
    cmd.run();
  }

  function open() {
    if (dialog!.open) return;
    input!.value = '';
    active = 0;
    render();
    dialog!.showModal();
    input!.focus();
  }

  function close() {
    if (dialog!.open) dialog!.close();
  }

  input.addEventListener('input', () => {
    active = 0;
    render();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
      e.preventDefault();
      select((active + 1) % Math.max(1, results.length));
    } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
      e.preventDefault();
      select((active - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      execute(active);
    }
  });

  // Clicking the backdrop closes the dialog.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (dialog.open) close();
      else open();
    }
  });

  document.querySelectorAll('[data-cmdk-open]').forEach((btn) => btn.addEventListener('click', open));
}
