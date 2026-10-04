import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const writing = defineCollection({
  loader: glob({ base: './src/content/writing', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    /** Dummy content that still needs replacing; listed by `npm run placeholders`. */
    placeholder: z.boolean().default(false),
  }),
});

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** Year or range, e.g. "2019" or "2021–2023". */
    year: z.string(),
    url: z.url().optional(),
    repo: z.url().optional(),
    tags: z.array(z.string()).default([]),
    /** Featured projects also appear on the home page. */
    featured: z.boolean().default(false),
    /** Lower sorts first. */
    order: z.number().default(100),
    /** Prizes or recognition, shown as badges under the title; the first is highlighted. */
    awards: z.array(z.string()).default([]),
    /** e.g. "Team of 2"; shown with `role` in the card's meta line. */
    team: z.string().optional(),
    role: z.string().optional(),
    /** Extra links beyond `url` (the title link) and `repo`. */
    links: z.array(z.object({ label: z.string(), href: z.url() })).default([]),
    draft: z.boolean().default(false),
    /** Dummy content that still needs replacing; listed by `npm run placeholders`. */
    placeholder: z.boolean().default(false),
  }),
});

export const collections = { writing, projects };
