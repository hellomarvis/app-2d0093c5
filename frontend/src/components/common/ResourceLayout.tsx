import * as React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { SidebarLayout } from '@/components/common/SidebarLayout';
import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarNav,
  SidebarNavItem,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';

export interface ResourceNavItem {
  label: string;
  to: string;
}

interface ResourceLayoutProps {
  appName: string;
  nav: ResourceNavItem[];
  children: React.ReactNode;
}

// Authenticated app chrome for CRUD screens: collapsible sidebar with app
// name, nav links for each resource, and sign-out in the footer.
// Domain layout routes pass the nav config; custom screens reuse it.
export function ResourceLayout({ appName, nav, children }: ResourceLayoutProps): React.ReactElement {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { pathname } = useLocation();

  const go = (to: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigate(to);
  };

  return (
    <SidebarLayout
      sidebar={
        <>
          <SidebarHeader>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              {appName.charAt(0).toUpperCase()}
            </span>
            <span className="truncate font-semibold">{appName}</span>
          </SidebarHeader>
          <SidebarContent>
            <SidebarNav>
              {nav.map((item) => (
                <SidebarNavItem
                  key={item.to}
                  href={item.to}
                  active={item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)}
                  onClick={go(item.to)}
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold uppercase text-muted-foreground">
                    {item.label.charAt(0)}
                  </span>
                  <span className="truncate">{item.label}</span>
                </SidebarNavItem>
              ))}
            </SidebarNav>
          </SidebarContent>
          <SidebarFooter>
            <div className="flex items-center justify-between gap-2 px-2 py-1">
              <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label="Sign out"
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
              >
                <LogOut />
              </Button>
            </div>
          </SidebarFooter>
        </>
      }
    >
      <div className="mx-auto w-full max-w-5xl">{children}</div>
    </SidebarLayout>
  );
}
