import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states';
import { apiClient, ApiError } from '@/lib/apiClient';

interface ModerationAction {
  id: number;
  actionType: string;
  targetLabel: string;
  reason: string;
  actedByName: string;
  actedAt: string;
}

const ACTION_LABEL: Record<string, string> = {
  message_removed: 'Message removed',
  member_removed: 'Member removed',
  channel_archived: 'Channel archived',
  user_suspended: 'User suspended',
  user_restored: 'User restored',
  role_changed: 'Role changed',
};

export const AdminModeration = (): React.ReactElement => {
  const [actions, setActions] = React.useState<ModerationAction[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    apiClient
      .get<ModerationAction[]>('/api/moderation')
      .then(setActions)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load moderation log'));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div data-sec="sec-13" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <div className="eyebrow">Conversation governance</div>
        <h1 id="moderation-title">Admin Moderation</h1>
        <p className="subtle mt-1 max-w-2xl text-muted-foreground">
          Review context and take accountable action across group chats and conversations.
        </p>
      </header>

      {error ? (
        <ErrorState className="mt-6" message={error} onRetry={load} />
      ) : !actions ? (
        <LoadingState className="mt-6" />
      ) : actions.length === 0 ? (
        <EmptyState className="mt-6" title="No moderation actions yet" description="Actions taken on channels and messages will appear here." />
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {actions.map((item) => (
            <section key={item.id} className="rounded-xl border border-border bg-card shadow-card">
              <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold">{item.targetLabel}</h2>
                <span className="font-mono text-xs text-muted-foreground">{new Date(item.actedAt).toLocaleString()}</span>
              </div>
              <div className="p-4">
                <Badge className="bg-accent/10 text-accent">{ACTION_LABEL[item.actionType] ?? item.actionType}</Badge>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Reason</div>
                    <strong className="text-sm font-semibold text-foreground">{item.reason}</strong>
                  </div>
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Actor</div>
                    <strong className="text-sm font-semibold text-foreground">{item.actedByName}</strong>
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
