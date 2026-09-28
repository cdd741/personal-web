import { getCollection } from 'astro:content';
import { SHOW_DRAFTS } from './site.config';

export async function getPosts() {
  const posts = await getCollection('writing', ({ data }) => SHOW_DRAFTS || !data.draft);
  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export async function getProjects() {
  const projects = await getCollection('projects', ({ data }) => SHOW_DRAFTS || !data.draft);
  return projects.sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title));
}
