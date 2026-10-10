import * as React from 'react';
import { cn } from '@/lib/utils';
import { Sidebar, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';

interface SidebarLayoutProps {
  sidebar: React.ReactNode;
  header?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  contentClassName?: string;
}

// Full-height app layout with a collapsible left sidebar.
// Pass sidebar content (SidebarHeader/SidebarContent/SidebarNav) as `sidebar`.
export function SidebarLayout({
  sidebar,
  header,
  children,
  defaultOpen = true,
  className,
  contentClassName,
}: SidebarLayoutProps): React.ReactElement {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <div className={cn('flex h-screen w-full overflow-hidden bg-background', className)}>
        <Sidebar>{sidebar}</Sidebar>
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-14 items-center gap-3 border-b bg-card px-4">
            <SidebarTrigger />
            {header}
          </header>
          <main className={cn('flex-1 overflow-y-auto p-6', contentClassName)}>{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
