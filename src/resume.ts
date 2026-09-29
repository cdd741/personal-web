/**
 * Résumé content for /resume and the downloadable PDF.
 * PLACEHOLDER: everything marked TODO below is template text. The facts (name,
 * Alan, Waterloo 2020, links) are real; dates and bullets need your details.
 */
import { SITE } from './site.config';

export interface Role {
  company: string;
  url?: string;
  role: string;
  location: string;
  start: string;
  end: string;
  bullets: string[];
}

export const RESUME = {
  name: SITE.name,
  headline: 'Software Engineer',
  location: `${SITE.location.city}, France`,
  contacts: [
    { label: 'andre-chen.com', href: SITE.url },
    { label: 'github.com/cdd741', href: SITE.links.github },
    { label: 'linkedin.com/in/andre-baizhou-chen', href: SITE.links.linkedin },
  ],
  // TODO: one or two lines on what you do and what you care about.
  summary:
    'Software engineer who likes turning messy real-world problems into simple, well-crafted products. Two or three lines about your focus and strengths go here.',
  experience: [
    {
      company: 'Alan',
      url: 'https://alan.com',
      role: 'Software Engineer',
      location: 'Paris, France',
      start: '20XX', // TODO
      end: 'Present',
      bullets: [
        // TODO: real achievements, ideally with numbers.
        'Describe something you shipped and the difference it made, with a number if you have one.',
        'Describe a system you own or improved: what it does, its scale, what you changed.',
        'Describe how you work with others: mentoring, cross-team projects, reviews.',
      ],
    },
    {
      company: 'Previous company', // TODO
      role: 'Software Engineer Intern',
      location: 'City, Country',
      start: '20XX',
      end: '20XX',
      bullets: ['What you built there and why it mattered.', 'Technologies you used, and one result worth mentioning.'],
    },
  ] satisfies Role[],
  education: [
    {
      school: 'University of Waterloo',
      degree: 'Bachelor of Mathematics',
      location: 'Waterloo, ON, Canada',
      end: '2020',
    },
  ],
  // TODO: trim to what you actually want to be hired for.
  skills: [
    { label: 'Languages', items: ['TypeScript', 'Python', 'SQL'] },
    { label: 'Frameworks', items: ['React', 'Node.js', 'Astro'] },
    { label: 'Tools', items: ['PostgreSQL', 'Docker', 'Git', 'CI/CD'] },
  ],
};

export const RESUME_PDF = '/andre-chen-resume.pdf';
