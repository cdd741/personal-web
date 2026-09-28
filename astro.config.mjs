// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://andre-chen.com',
  trailingSlash: 'ignore',
  integrations: [
    sitemap({
      filter: (page) => !page.endsWith('/404/'),
    }),
  ],
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Geist',
      cssVariable: '--font-sans',
      fallbacks: ['system-ui', 'sans-serif'],
      options: {
        variants: [
          {
            src: ['@fontsource-variable/geist/files/geist-latin-wght-normal.woff2'],
            weight: '100 900',
            style: 'normal',
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Geist Mono',
      cssVariable: '--font-mono',
      fallbacks: ['ui-monospace', 'monospace'],
      options: {
        variants: [
          {
            src: ['@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2'],
            weight: '100 900',
            style: 'normal',
          },
        ],
      },
    },
  ],
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
  devToolbar: { enabled: false },
});
