import type { ProductivityValue, WebsiteCategory } from './categories';

export interface DomainRule {
  domain: string;
  category: WebsiteCategory;
  productivity?: ProductivityValue;
}

/**
 * Purpose-based defaults only. Mixed-use products such as GitHub, YouTube,
 * social networks, communication tools, and work suites remain neutral.
 */
const domainRules = [
  { domain: 'khanacademy.org', category: 'Learning' },
  { domain: 'coursera.org', category: 'Learning' },
  { domain: 'edx.org', category: 'Learning' },
  { domain: 'brilliant.org', category: 'Learning' },
  { domain: 'duolingo.com', category: 'Learning' },
  { domain: 'udemy.com', category: 'Learning' },
  { domain: 'developer.mozilla.org', category: 'Documentation' },
  { domain: 'docs.github.com', category: 'Documentation' },
  { domain: 'react.dev', category: 'Documentation' },
  { domain: 'typescriptlang.org', category: 'Documentation' },
  { domain: 'nodejs.org', category: 'Documentation' },
  { domain: 'docs.python.org', category: 'Documentation' },
  { domain: 'arxiv.org', category: 'Academic' },
  { domain: 'scholar.google.com', category: 'Academic' },
  { domain: 'jstor.org', category: 'Academic' },
  { domain: 'pubmed.ncbi.nlm.nih.gov', category: 'Academic' },
  { domain: 'github.com', category: 'Coding & Development' },
  { domain: 'gitlab.com', category: 'Coding & Development' },
  { domain: 'stackoverflow.com', category: 'Coding & Development' },
  { domain: 'npmjs.com', category: 'Coding & Development' },
  { domain: 'pypi.org', category: 'Coding & Development' },
  { domain: 'codepen.io', category: 'Coding & Development' },
  { domain: 'replit.com', category: 'Coding & Development' },
  { domain: 'notion.so', category: 'Professional Work' },
  { domain: 'linear.app', category: 'Professional Work' },
  { domain: 'asana.com', category: 'Professional Work' },
  { domain: 'trello.com', category: 'Professional Work' },
  { domain: 'atlassian.net', category: 'Professional Work' },
  { domain: 'figma.com', category: 'Professional Work' },
  { domain: 'slack.com', category: 'Communication' },
  { domain: 'teams.microsoft.com', category: 'Communication' },
  { domain: 'mail.google.com', category: 'Communication' },
  { domain: 'outlook.office.com', category: 'Communication' },
  { domain: 'discord.com', category: 'Communication' },
  { domain: 'youtube.com', category: 'Entertainment', productivity: 'neutral' },
  { domain: 'netflix.com', category: 'Entertainment' },
  { domain: 'twitch.tv', category: 'Entertainment' },
  { domain: 'spotify.com', category: 'Entertainment' },
  { domain: 'instagram.com', category: 'Social Media' },
  { domain: 'facebook.com', category: 'Social Media' },
  { domain: 'reddit.com', category: 'Social Media' },
  { domain: 'tiktok.com', category: 'Social Media' },
  { domain: 'x.com', category: 'Social Media' },
  { domain: 'threads.net', category: 'Social Media' },
  { domain: 'linkedin.com', category: 'Social Media' },
  { domain: 'steampowered.com', category: 'Gaming' },
  { domain: 'steamcommunity.com', category: 'Gaming' },
  { domain: 'roblox.com', category: 'Gaming' },
  { domain: 'epicgames.com', category: 'Gaming' },
  { domain: 'amazon.com', category: 'Shopping' },
  { domain: 'amazon.in', category: 'Shopping' },
  { domain: 'flipkart.com', category: 'Shopping' },
  { domain: 'ebay.com', category: 'Shopping' },
] satisfies DomainRule[];

export const DOMAIN_RULES: readonly DomainRule[] = domainRules.toSorted(
  (left, right) => right.domain.length - left.domain.length,
);
