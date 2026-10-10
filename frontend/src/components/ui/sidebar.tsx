import * as React from 'react';
import { PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Lean, dependency-free sidebar primitive.
// Compose with SidebarLayout (src/components/common) for a full app shell.

interface SidebarContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within <SidebarProvider>');
  return ctx;
}

export function SidebarProvider({ children, defaultOpen = true }: { children: React.ReactNode; defaultOpen?: boolean }): React.ReactElement {
  const [open, setOpen] = React.useState(defaultOpen);
  const value = React.useMemo<SidebarContextValue>(
    () => ({ open, setOpen, toggle: () => setOpen((o) => !o) }),
    [open],
  );
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function Sidebar({ className, children, ...props }: React.HTMLAttributes<HTMLElement>): React.ReactElement {
  const { open } = useSidebar();
  return (
    <aside
      data-state={open ? 'open' : 'closed'}
      className={cn(
        'flex h-full flex-col border-r bg-card text-card-foreground transition-[width] duration-200 ease-in-out overflow-hidden',
        open ? 'w-64' : 'w-0 md:w-16',
        className,
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn('flex items-center gap-2 px-4 py-3 border-b', className)} {...props} />;
}

export function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn('flex-1 overflow-y-auto py-2', className)} {...props} />;
}

export function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn('mt-auto border-t px-2 py-2', className)} {...props} />;
}

export function SidebarNav({ className, ...props }: React.HTMLAttributes<HTMLElement>): React.ReactElement {
  return <nav className={cn('flex flex-col gap-1 px-2', className)} {...props} />;
}

export function SidebarNavItem({
  className,
  active,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { active?: boolean }): React.ReactElement {
  return (
    <a
      data-active={active ? 'true' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0',
        active && 'bg-accent text-accent-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function SidebarTrigger({ className, ...props }: React.ComponentProps<typeof Button>): React.ReactElement {
  const { toggle } = useSidebar();
  return (
    <Button variant="ghost" size="icon" className={cn('size-8', className)} onClick={toggle} aria-label="Toggle sidebar" {...props}>
      <PanelLeft />
    </Button>
  );
}
