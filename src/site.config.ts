/**
 * Everything personal about the site lives here, so updating a bio or a link
 * never means touching a component. Empty strings are hidden, not rendered.
 */
export const SITE = {
  name: 'Andre Chen',
  url: 'https://andre-chen.com',
  description: 'Andre Chen is a software engineer at Alan.',
  role: 'Software engineer',
  company: { name: 'Alan', url: 'https://alan.com' },
  education: {
    degree: 'BMath',
    school: 'University of Waterloo',
    year: 2020,
  },
  /**
   * Longer bio for /about, one string per paragraph.
   * PLACEHOLDER: dummy copy, replace with your own words.
   */
  bio: [
    "I'm a software engineer at Alan, where I build products that try to make health insurance feel a little less like paperwork.",
    'I studied math at the University of Waterloo, graduating in 2020.',
    "Outside of work I take photos (long exposures of city lights, mainly), tinker with small games, and occasionally write things down here.",
  ] as string[],
  /**
   * The home page "Now" card.
   * PLACEHOLDER: dummy entries, replace with what you're actually up to.
   */
  now: {
    updated: 'September 2026',
    items: [
      { label: 'Building', text: 'This site, one easter egg at a time.' },
      { label: 'Reading', text: 'A book worth recommending goes here.' },
      { label: 'Learning', text: 'Something new outside of work.' },
      { label: 'Playing', text: 'Whatever game is eating my weekends.' },
    ],
  },
  links: {
    github: 'https://github.com/cdd741',
    linkedin: 'https://www.linkedin.com/in/andre-baizhou-chen/',
  },
} as const;

/** Drafts show up in `astro dev`, or in a build with SHOW_DRAFTS=true (for previews). */
export const SHOW_DRAFTS = import.meta.env.DEV || import.meta.env.SHOW_DRAFTS === 'true';

export const NAV = [
  { href: '/projects/', label: 'Projects' },
  { href: '/writing/', label: 'Writing' },
  { href: '/about/', label: 'About' },
  { href: '/play/', label: 'Play' },
  { href: '/resume/', label: 'Résumé' },
] as const;
