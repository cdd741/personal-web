---
# PLACEHOLDER: a draft written for you from how the site was actually built. Rewrite in your own voice or delete.
title: Rebuilding this site from a compiled bundle
description: The source for my old site was gone, so I started over with Astro, and made sure the old service worker let go.
pubDate: 2026-09-28
tags: [meta, astro, web]
placeholder: true
---


My previous site went up in 2020: a Create React App project with a home page,
a résumé and a photo gallery. At some point the source went missing, and all
that was left was the compiled bundle sitting on the `gh-pages` branch.

Source maps meant I could read the old code again, but there wasn't much worth
keeping, so this is a rebuild from scratch.

## The stack

The site is [Astro](https://astro.build), which renders everything to static
HTML at build time and ships JavaScript only where a page needs it. Posts are
Markdown files in a content collection; the RSS feed and sitemap come from
official integrations. GitHub Actions builds it and deploys to GitHub Pages.

## Letting go of the old service worker

The old site registered a service worker that cached the whole app. Anyone who
visited back then still has it, and it would keep serving them the 2020 site
forever.

The fix is a tiny worker at the same path that deletes every cache, unregisters
itself and reloads open tabs:

```js
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      await Promise.all(clients.map((client) => client.navigate(client.url)));
    })(),
  );
});
```

Browsers check the worker script for updates on navigation, so returning
visitors see the old site once more at most, then land here.

## The fun parts

The home page used to be a long-exposure photo of cyclists at night. Now it's
a live one: move your cursor over it to paint with light. There's also a
[tiny runner game](/play/), and pressing <kbd>⌘</kbd> <kbd>K</kbd> opens a
command palette. Not every command in it is listed.
