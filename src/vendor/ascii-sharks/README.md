# ascii-sharks (vendored)

Source: https://github.com/stackedlol/ascii-sharks at commit a0074c1, MIT licensed (see LICENSE).
Used by `src/components/Hero.astro` for the home page ocean.

Copied as-is except for three small changes in `engine.ts`, each marked "Local change":

- The web-font preload ignores a rejected promise, so a missing local fallback font
  doesn't log an error.
- Sizing uses the canvas's layout size and pointer positions are mapped back through any
  CSS scale, because the hero zooms the canvas while you scroll.

`react.tsx` is left out because the site doesn't use React.
