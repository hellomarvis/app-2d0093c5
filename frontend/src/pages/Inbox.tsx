import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states';
import { apiClient, ApiError } from '@/lib/apiClient';

interface InboxThread {
  id: string;
  subject: string;
  counterpart: string;
  lastActivity: string;
  body: string;
  keyPoints: string;
  requestedActions: string;
}

export const Inbox = (): React.ReactElement => {
  const navigate = useNavigate();
  const [threads, setThreads] = React.useState<InboxThread[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    apiClient
      .get<InboxThread[]>('/api/inbox')
      .then(setThreads)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load inbox'));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div data-sec="sec-7" className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1>Unified Inbox</h1>
        <p className="subtle mt-1 text-muted-foreground">Manage email and messaging threads from Gmail and Slack in one place.</p>
      </header>

      {error ? (
        <ErrorState className="mt-6" message={error} onRetry={load} />
      ) : !threads ? (
        <LoadingState className="mt-6" />
      ) : threads.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="Your inbox is empty"
          description="Connect Gmail or Slack to see conversations here."
          action={<Button onClick={() => navigate('/connections')}>Go to Connections</Button>}
        />
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {threads.map((t) => (
            <article key={t.id} className="rounded-xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-lg">{t.subject}</h2>
                <span className="font-mono text-xs text-muted-foreground">{t.lastActivity}</span>
              </div>
              <div className="text-sm text-muted-foreground">{t.counterpart}</div>
              <p className="mt-2 text-sm text-foreground">{t.body}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
