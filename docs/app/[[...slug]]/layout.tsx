import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { DocsSidebarBridge } from '@/components/docs-sidebar-bridge';
import { baseOptions } from '@/lib/layout.shared';

export default function Layout({ children }: LayoutProps<'/[[...slug]]'>) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      {...baseOptions()}
      nav={{ enabled: false }}
      containerProps={{
        style: {
          ['--fd-banner-height' as string]: 'var(--looma-header-height)',
        },
      }}
    >
      <DocsSidebarBridge />
      {children}
    </DocsLayout>
  );
}
