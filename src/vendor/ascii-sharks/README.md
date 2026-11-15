# ascii-sharks (vendored)

Source: https://github.com/stackedlol/ascii-sharks at commit a0074c1, MIT licensed (see LICENSE).
Used by `src/components/Hero.astro` for the home page ocean.

Copied as-is except for one change in `engine.ts`: the web-font preload ignores a
rejected promise, so a missing local fallback font doesn't log an error. `react.tsx`
is left out because the site doesn't use React.
