import type { ReactNode } from 'react';
import * as React from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ScrollToHash } from '@/components/ScrollToHash';
import { InitialsAvatar } from '@/components/common/InitialsAvatar';
import { NexusDataProvider, CURRENT_USER } from '@/lib/nexusData';
import { useAuthStore } from '@/store/authStore';
import { APP_NAME, APP_GLYPH } from '@/brand';
import type { FunctionComponent } from '@/common/types';

/**
 * AppLayout — the ONE shared shell every page renders inside.
 *
 * This product is sign-in only (the approved design has no public landing —
 * all 13 screens are the authed workspace itself). So the chrome below is
 * conditional on auth state:
 *   - signed OUT: no app chrome at all — Login/Signup/ForgotPassword/
 *     ResetPassword already render their own full-bleed screens.
 *   - signed IN: the approved design's fixed topbar + sidebar workspace shell,
 *     converted verbatim (same structure, same nav, same chrome) into React.
 */

const NAV_ITEMS: { to: string; label: string; icon: string }[] = [
  { to: '/workspace-home', label: 'Workspace Home', icon: '⌂' },
  { to: '/people', label: 'People Directory', icon: '◎' },
  { to: '/inbox', label: 'Unified Inbox', icon: '▱' },
  { to: '/repositories', label: 'Repositories', icon: '⌘' },
  { to: '/ai-assistant', label: 'AI Assistant', icon: '✦' },
  { to: '/connections', label: 'Connections', icon: '⌁' },
];

const ADMIN_NAV_ITEMS: { to: string; label: string; icon: string }[] = [
  { to: '/admin/users', label: 'Admin Users', icon: '♙' },
  { to: '/admin/moderation', label: 'Admin Moderation', icon: '◇' },
  { to: '/admin/integrations', label: 'Admin Integrations', icon: '⚙' },
];

function screenTitle(pathname: string): string {
  if (pathname.startsWith('/workspace-home')) return 'Workspace Home';
  if (pathname.startsWith('/channels/') && pathname.endsWith('/details')) return 'Channel Details';
  if (pathname.startsWith('/channels/')) return 'Channel Conversation';
  if (pathname.startsWith('/direct/')) return 'Direct Conversation';
  if (pathname.startsWith('/people')) return 'People Directory';
  if (pathname.startsWith('/inbox')) return 'Unified Inbox';
  if (pathname.startsWith('/repositories/')) return 'Repository Analysis';
  if (pathname.startsWith('/repositories')) return 'Repositories';
  if (pathname.startsWith('/ai-assistant')) return 'AI Assistant';
  if (pathname.startsWith('/connections')) return 'Connections';
  if (pathname.startsWith('/admin/users')) return 'Admin Users';
  if (pathname.startsWith('/admin/moderation')) return 'Admin Moderation';
  if (pathname.startsWith('/admin/integrations')) return 'Admin Integrations';
  return APP_NAME;
}

const navItemClass = ({ isActive }: { isActive: boolean }): string =>
  [
    'flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
    isActive ? 'bg-muted text-foreground shadow-[inset_2px_0_var(--primary)]' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
  ].join(' ');

export const AppLayout = (): FunctionComponent => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  React.useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = (): void => {
    logout();
    navigate('/login');
  };

  // Signed-out: no workspace chrome. Login/Signup/ForgotPassword/ResetPassword
  // own their own full-bleed presentation.
  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <ScrollToHash />
        <Outlet />
      </div>
    );
  }

  return (
    <NexusDataProvider>
      <div className="min-h-screen bg-background text-foreground">
        <ScrollToHash />

        {/* Topbar — fixed, 58px, matches the approved design's .topbar */}
        <header className="fixed inset-x-0 top-0 z-30 flex h-[var(--topbar)] items-center border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90">
          <div className="flex h-full w-full items-center gap-3 border-r border-border px-3 sm:w-[var(--sidebar)] sm:px-4">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
              className="grid size-8 shrink-0 place-items-center rounded-md border border-border text-foreground sm:hidden"
            >
              ☰
            </button>
            <Link to="/workspace-home" className="flex min-w-0 items-center gap-2.5 font-extrabold tracking-tight text-foreground">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary font-black text-primary-foreground shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_12%,transparent)]">
                {APP_GLYPH}
              </span>
              <span className="truncate">{APP_NAME}</span>
            </Link>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-4 px-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <strong className="truncate text-sm font-semibold">{screenTitle(location.pathname)}</strong>
              <span className="hidden items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary sm:inline-flex">
                AI connected
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden items-center gap-1.5 font-mono text-xs text-muted-foreground md:flex">
                <span className="size-[7px] rounded-full bg-secondary shadow-[0_0_0_4px_color-mix(in_oklab,var(--secondary)_10%,transparent)]" />
                Real-time workspace
              </div>
              <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                <Link to="/ai-assistant">Ask NexusAI</Link>
              </Button>
              <InitialsAvatar name={CURRENT_USER.displayName} size="sm" />
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                Sign out
              </Button>
            </div>
          </div>
        </header>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-30 bg-black/50 sm:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar — fixed, 244px, matches the approved design's .sidebar */}
        <aside
          className={[
            'fixed bottom-0 left-0 top-[var(--topbar)] z-40 flex w-[270px] flex-col overflow-y-auto border-r border-border bg-card transition-transform duration-200 sm:w-[var(--sidebar)] sm:translate-x-0',
            sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
          ].join(' ')}
        >
          <div className="px-4 pb-2 pt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Workspace</div>
          <nav className="flex flex-col gap-0.5 px-2.5" aria-label="Primary navigation">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} className={navItemClass}>
                <span aria-hidden className="w-[17px] shrink-0 text-center">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </NavLink>
            ))}
            {user.isAdmin && (
              <>
                <div className="mt-2" />
                {ADMIN_NAV_ITEMS.map((item) => (
                  <NavLink key={item.to} to={item.to} className={navItemClass}>
                    <span aria-hidden className="w-[17px] shrink-0 text-center">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </>
            )}
          </nav>
          <div className="mx-3 mb-3 mt-auto rounded-lg border border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
            <strong className="mb-0.5 block text-foreground">Permission-aware intelligence</strong>
            Answers use only conversations, files, inboxes, and repositories you can access.
          </div>
        </aside>

        {/* Main content */}
        <main key={location.pathname} className="pt-[var(--topbar)] sm:pl-[var(--sidebar)]" style={{ animation: 'screenIn .16s ease' }}>
          <Outlet />
        </main>
      </div>
    </NexusDataProvider>
  );
};

/** Standard content column for non-landing pages. */
export const PageContainer = ({ children }: { children: ReactNode }): FunctionComponent => (
  <div className="mx-auto w-full max-w-6xl px-6 py-8">{children}</div>
);
