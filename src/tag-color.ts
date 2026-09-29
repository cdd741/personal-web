const HUES = ['amber', 'red', 'pink', 'cyan', 'violet', 'green'] as const;

/** A stable palette color per tag, so the same tag is always the same color. */
export function tagStyle(tag: string) {
  let h = 0;
  for (const ch of tag.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `--tag: var(--c-${HUES[h % HUES.length]})`;
}
