'use client';

import { useEffect } from 'react';
import { useSidebar } from 'fumadocs-ui/components/sidebar/base';
import { docsSidebarToggleEvent } from '@/lib/layout.shared';

export function DocsSidebarBridge() {
  const { setOpen } = useSidebar();

  useEffect(() => {
    function onToggle() {
      setOpen((previous) => !previous);
    }

    window.addEventListener(docsSidebarToggleEvent, onToggle);
    return () => window.removeEventListener(docsSidebarToggleEvent, onToggle);
  }, [setOpen]);

  return null;
}
