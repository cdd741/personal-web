# ascii-sharks (vendored)

Source: https://github.com/stackedlol/ascii-sharks at commit a0074c1, MIT licensed (see LICENSE).
It draws the ocean behind the home page; `src/scripts/dive` drives it.

Changes from upstream, each marked "Local change" in the code:

- **engine.ts**
  - `world` is public, so the page can steer the ocean.
  - Sizing uses the canvas's layout size, and pointer positions are mapped back through
    any CSS scale.
  - The web-font preload ignores a rejected promise (a missing local fallback font).
- **renderer.ts**
  - The canvas is transparent instead of black, so the page colours the water behind it.
  - Skin glyphs are a darker shade of their own cell (`SKIN_INK`) instead of near-black, so
    the letters don't jump out of the water.
- **world.ts**
  - `drift`: a current that carries fish (and nudges sharks). Fish carried out of the
    top or bottom re-enter from the other side.
  - `fishShare`: thins the fish out or lets them return.
  - `focus`, `clear` and `clearStrength`: the point the sharks patrol around, the zone
    they keep out of, and how firmly.
  - Sharks can be `away` (swim out of frame and wait), with `park()` and `recall()`.
  - Sharks notice the pointer: they swim over to a moving cursor and circle it, losing
    interest when it sits still. `lure()` drops bait that every shark races for; the
    engine calls it on a click or tap, along with the splash.

`react.tsx` is left out because the site doesn't use React.
