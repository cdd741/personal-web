---
title: Hello, world (again)
description: Placeholder post to show the blog layout. Replace or delete me.
pubDate: 2026-09-28
tags: [meta]
draft: true
---

This is a **draft placeholder**. It only shows up in `npm run dev`, never in a
production build. Copy this file to start a real post and set `draft: false`
(or delete the line).

## Writing a post

Posts are Markdown files in `src/content/writing/`. The file name becomes the
URL, so `my-first-post.md` is served at `/writing/my-first-post/`.

```ts
const greeting = (name: string) => `Hi, ${name}!`;
console.log(greeting('world'));
```

> Frontmatter needs a `title`, a `description` and a `pubDate`.
