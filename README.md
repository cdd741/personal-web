# andre-chen.com

Source for [andre-chen.com](https://andre-chen.com), built with [Astro](https://astro.build).

```sh
npm install
npm run dev      # http://localhost:4321, drafts visible
npm run build    # static site in dist/
npm run check    # type-check .astro and .ts files
```

## Editing content

| What | Where |
| --- | --- |
| Name, role, education, bio, links | `src/site.config.ts` |
| Blog posts | `src/content/writing/*.md` (the file name is the URL slug) |
| Projects | `src/content/projects/*.md` (see `_template.md.example`) |
| Social preview image | `public/og.png` |

Posts and projects with `draft: true` show up in `npm run dev` only. To
preview a production build with drafts, run `SHOW_DRAFTS=true npm run build`.
Drafts never appear in the RSS feed.

## What's where

- `src/scripts/long-exposure.ts`: the home page hero. Cursor and cyclists paint
  fading light trails (additive blending, brightness-bucketed paths).
- `src/scripts/runner.ts` + `sprites.ts`: the `/play` game and its pixel art.
- `src/scripts/palette.ts`: the ⌘K / Ctrl K command palette. Unlisted commands
  live in `SECRETS`.
- `src/scripts/eggs.ts`: easter eggs (lights out, rex cameo, Konami code).
- `public/service-worker.js`: a kill switch for the 2020 site's service worker.
  Keep it at this path for a year or so, so returning visitors get unstuck.
- `public/CNAME`: the custom domain, copied into every build.

## Deployment

`.github/workflows/deploy.yml` builds and type-checks every push and pull
request. Pushes to `main` deploy to GitHub Pages, but only once the repo's
Pages source is set to **GitHub Actions** (Settings → Pages → Build and
deployment → Source). Until then the deploy job skips itself and the old site
keeps being served from the `gh-pages` branch.

Cutover checklist:

1. Settings → General → Default branch: switch to `main`. The `github-pages`
   environment only allows deployments from the default branch.
2. Settings → Pages → Source: **GitHub Actions**. Confirm the custom domain
   still reads `andre-chen.com`.
3. Actions → Build and deploy → Run workflow (or push to `main`).
4. The `gh-pages` branch can be kept as an archive of the old site.
