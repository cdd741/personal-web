/**
 * Experience content for /work (the full story) and /resume (the one-page sheet
 * the PDF is rendered from).
 * - `bullets` are trimmed to fit the one-page résumé.
 * - `details` are the full versions shown on /work; they fall back to `bullets`.
 * - `stack` is shown as tags on /work.
 * Text may use **bold** for the key result. Empty strings are hidden.
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
  details?: string[];
  stack?: string[];
}

export interface Education {
  school: string;
  degree: string;
  location: string;
  end?: string;
}

/** Projects that only appear on the résumé. Featured, non-placeholder projects from src/content/projects are listed first. */
export interface ResumeProject {
  title: string;
  description: string;
  year?: string;
  bullets: string[];
  details?: string[];
  stack?: string[];
}

export const RESUME = {
  name: SITE.name,
  headline: 'Software Engineer',
  location: 'Toronto, ON',
  contacts: [
    { label: 'andre-chen.com', href: SITE.url },
    { label: 'github.com/cdd741', href: SITE.links.github },
    { label: 'linkedin.com/in/andre-baizhou-chen', href: SITE.links.linkedin },
  ],
  summary: '',
  experience: [
    {
      company: 'Alan',
      url: 'https://alan.com',
      role: 'Software Engineer',
      location: '',
      start: '2026',
      end: 'Present',
      bullets: [
        'Engineer on the **Canada crew**, building Alan\'s health insurance product for the Canadian market.',
        // PLACEHOLDER: add 1–3 more bullets on your work at Alan
      ],
    },
    {
      company: 'AlgoAce',
      role: 'Full-Stack Engineer',
      location: 'Toronto, ON',
      start: '2023',
      end: '2025',
      bullets: [
        'Architected a scalable e-learning platform with **React (WebSockets), Python/Flask, JWT auth and SQLite**.',
        'Engineered an **AI Tutor** (ChatGPT API, custom prompt pipelines) that **cut manual grading time by 50%**.',
        'Developed a **CCC/USACO curriculum** with algorithm visualizers (e.g. Dijkstra): **30% national award rate**.',
        'Automated testing and deployment with GitHub Actions, **reducing release time by 30%**.',
      ],
      details: [
        'Architected and deployed a scalable e-learning platform with **React (WebSockets), Python/Flask, JWT auth and SQLite**.',
        'Engineered an **AI Tutor** integrating the ChatGPT API with custom prompt pipelines, automating feedback generation and **reducing manual grading time by 50%**.',
        'Developed a **competition curriculum** with algorithm visualizers (e.g. a Dijkstra simulator) for CCC/USACO, with a **30% national award rate**.',
        'Automated testing and deployment with GitHub Actions, **reducing release time by 30%**.',
      ],
      stack: ['React', 'WebSockets', 'Python', 'Flask', 'JWT', 'SQLite', 'ChatGPT API', 'GitHub Actions'],
    },
    {
      company: 'Faire',
      url: 'https://www.faire.com',
      role: 'Software Engineer',
      location: 'Waterloo, ON',
      start: '2021',
      end: '2022',
      bullets: [
        'Launched the **European Membership Program**: **60% adoption** and **70% GMV penetration** in 7 days.',
        'Redesigned purchasing and returns for **130K+ food retailers** with perishable-goods logic: **satisfaction +40%**.',
        'Reached **99% email rendering consistency** across Gmail, Outlook and Apple Mail by refactoring to MJML.',
        'Partnered with UX designers on interfaces that **cut support tickets by 20%**.',
        'React/TypeScript (MobX, Styled Components), Kotlin APIs, MJML emails; AWS S3 for storage, hosting, backups.',
      ],
      details: [
        '**Launched the European Membership Program**: **60% adoption** and **70% GMV penetration** in 7 days, with localized checkout and promotions.',
        '**Redesigned purchasing and returns** for 130K+ food retailers, **boosting satisfaction 40%** with perishable-goods logic.',
        'Achieved **99% email rendering consistency** across Gmail, Outlook and Apple Mail by refactoring templates in MJML.',
        'Partnered with UX designers on feature implementation, and **cut support tickets by 20%** through more intuitive interfaces.',
        'Built React/TypeScript components (MobX, Styled Components), MJML email templates (React Query) and backend APIs in Kotlin.',
        'Used AWS S3 for object storage, static website hosting and automated data backups.',
      ],
      stack: ['React', 'TypeScript', 'MobX', 'Styled Components', 'React Query', 'MJML', 'Kotlin', 'AWS S3'],
    },
  ] satisfies Role[],
  projects: [
    {
      title: 'Agent System',
      description: 'AI agent search and collaboration platform',
      bullets: [
        'An open agent marketplace: natural-language agent search, a personalized assistant (OpenAI Agents SDK), agent registration and dynamic invocation.',
        'Integrated **MCP, MCP-UI and A2A** for multi-agent communication; React + FastAPI for orchestration and embedding retrieval.',
      ],
      details: [
        'Designed and developed an AI agent ecosystem: a natural-language agent search engine and a personalized assistant system built on the OpenAI Agents SDK.',
        'Integrated the **MCP, MCP-UI and A2A** protocols for standardized multi-agent communication.',
        'Implemented agent registration, metadata indexing and dynamic invocation to create an open agent marketplace.',
        'Architected the full stack: a React frontend and a FastAPI backend for agent orchestration and embedding retrieval.',
      ],
      stack: ['OpenAI Agents SDK', 'MCP', 'MCP-UI', 'A2A', 'React', 'FastAPI'],
    },
  ] as ResumeProject[],
  education: [
    {
      school: 'University of Waterloo',
      degree: 'Bachelor of Mathematics, Honours',
      location: 'Waterloo, ON',
      end: '2020',
    },
    {
      school: 'BrainStation',
      degree: 'Web Development Diploma',
      location: 'Toronto, ON',
    },
  ] satisfies Education[],
  skills: [
    { label: 'Frontend', items: ['React', 'TypeScript', 'JavaScript', 'HTML', 'CSS', 'responsive design'] },
    { label: 'Backend', items: ['Python', 'Java', 'Kotlin', 'SQL', 'NoSQL'] },
    { label: 'Tooling', items: ['Docker', 'Git', 'GitHub Actions', 'Jenkins', 'Cypress', 'Storybook', 'Datadog', 'Mode', 'Jira'] },
  ],
};

export const RESUME_PDF = '/andre-chen-resume.pdf';
