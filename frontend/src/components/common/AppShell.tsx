import * as React from 'react';
import { cn } from '@/lib/utils';

interface AppShellProps {
  header?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

// Minimal top-nav shell: sticky header + centered content column.
// For a left-rail layout use SidebarLayout instead.
export function AppShell({ header, children, className, contentClassName }: AppShellProps): React.ReactElement {
  return (
    <div className={cn('min-h-screen bg-background', className)}>
      {header && (
        <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <div className="flex h-14 items-center gap-4 px-6">{header}</div>
        </header>
      )}
      <main className={cn('mx-auto w-full max-w-6xl px-6 py-8', contentClassName)}>{children}</main>
    </div>
  );
}
