import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export const gitConfig = {
  user: 'victor-YT',
  repo: 'looma',
  branch: 'main',
};

export const siteConfig = {
  name: 'Looma',
  siteName: 'Looma Docs',
  title: 'Looma Docs',
  description:
    'Documentation for Looma, a programmable AI client with strategies and long-term memory.',
  githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  mainSiteUrl: 'https://loomachat.com',
  docsHref: '/',
} as const;

export const docsSidebarToggleEvent = 'looma-docs-sidebar-toggle';

export function baseOptions(): BaseLayoutProps {
  return {
    githubUrl: siteConfig.githubUrl,
  };
}
