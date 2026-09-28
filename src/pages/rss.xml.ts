import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '../site.config';

export async function GET(context: APIContext) {
  // Drafts never go into the feed, even in preview builds.
  const posts = (await getCollection('writing', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );
  return rss({
    title: `${SITE.name} · Writing`,
    description: SITE.description,
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      categories: post.data.tags,
      link: `/writing/${post.id}/`,
    })),
    customData: '<language>en</language>',
  });
}
