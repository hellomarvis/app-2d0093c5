import * as React from 'react';
import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

// ── EmptyState ──────────────────────────────────────────────────────────────
interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps): React.ReactElement {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center', className)}>
      <div className="text-muted-foreground [&>svg]:size-8">{icon ?? <Inbox />}</div>
      <div className="space-y-1">
        <h3 className="font-semibold text-foreground">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// ── LoadingState ────────────────────────────────────────────────────────────
export function LoadingState({ label = 'Loading…', className }: { label?: string; className?: string }): React.ReactElement {
  return (
    <div className={cn('flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground', className)}>
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  );
}

// Skeleton placeholder rows for table/list loading states.
export function LoadingRows({ rows = 5, className }: { rows?: number; className?: string }): React.ReactElement {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

// ── ErrorState ──────────────────────────────────────────────────────────────
interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, className }: ErrorStateProps): React.ReactElement {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-10 text-center', className)}>
      <AlertCircle className="size-8 text-destructive" />
      <div className="space-y-1">
        <h3 className="font-semibold text-foreground">{title}</h3>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
