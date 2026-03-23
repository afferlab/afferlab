import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export const gitConfig = {
  user: 'victor-YT',
  repo: 'afferlab',
  branch: 'main',
};

export const siteConfig = {
  name: 'AfferLab',
  siteName: 'AfferLab Docs',
  title: 'AfferLab Docs',
  description:
    'Documentation for AfferLab, a strategy-programmable AI client.',
  githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  mainSiteUrl: 'https://afferlab.com',
  docsHref: '/',
} as const;

export const docsSidebarToggleEvent = 'afferlab-docs-sidebar-toggle';

export function baseOptions(): BaseLayoutProps {
  return {
    githubUrl: siteConfig.githubUrl,
  };
}
