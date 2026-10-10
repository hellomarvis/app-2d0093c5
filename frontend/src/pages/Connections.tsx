import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/common/states';
import { apiClient, ApiError } from '@/lib/apiClient';

interface IntegrationRow {
  id: number;
  serviceName: string;
  isEnabled: boolean;
}

const DESCRIPTIONS: Record<string, string> = {
  Gmail: 'Manage email, receive supported real-time updates, summarize threads, and send replies.',
  Slack: 'Receive supported real-time messages, send direct messages, and extract actions.',
  'Google Drive': 'Select files, share them in chatrooms, and analyze their contents with AI.',
  'Google Docs': 'Share documents, save summaries, extract key information, and answer questions.',
  'Google Sheets': 'Select spreadsheets, share them in chats, summarize them, and discuss their contents.',
  GitHub: 'Browse repositories and analyze source code, structure, dependencies, architecture, functions, and issues.',
  Instagram: 'Share supported chat content and AI-generated images or videos, subject to API permissions.',
  Facebook: 'Turn supported conversations or AI-generated content into posts, subject to API permissions.',
};

export const Connections = (): React.ReactElement => {
  const [services, setServices] = React.useState<IntegrationRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState<number | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    apiClient
      .get<IntegrationRow[]>('/api/integrations')
      .then(setServices)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load connections'));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleConnect = async (service: IntegrationRow): Promise<void> => {
    setConnecting(service.id);
    try {
      await apiClient.post(`/api/integrations/${service.id}/connect`, {});
      toast.success(`Connected ${service.serviceName}`);
    } catch (err) {
      toast.info(err instanceof ApiError ? err.message : `${service.serviceName} is not connected yet.`);
    } finally {
      setConnecting(null);
    }
  };

  return (
    <div data-sec="sec-11" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <div data-edit-id="sec-11:div:2" className="eyebrow">
          Connected services
        </div>
        <h1 data-edit-id="sec-11:h1:3" id="connections-title">
          Connections
        </h1>
        <p data-edit-id="sec-11:p:4" className="subtle mt-1 max-w-2xl text-muted-foreground">
          Control the services NexusAI can use for communication, documents, code analysis, and supported social publishing.
        </p>
      </header>

      {error ? (
        <ErrorState className="mt-6" message={error} onRetry={load} />
      ) : !services ? (
        <LoadingState className="mt-6" />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <article key={service.id} className="flex min-h-[200px] flex-col rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background font-bold text-secondary">
                  {service.serviceName[0]}
                </span>
                {!service.isEnabled && <Badge className="bg-destructive/10 text-destructive">Disabled by admin</Badge>}
              </div>
              <h2 className="mt-3.5 text-lg font-semibold">{service.serviceName}</h2>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">
                {DESCRIPTIONS[service.serviceName] ?? 'Connect this service to use it from NexusAI.'}
              </p>
              {!service.isEnabled && (
                <p className="mt-2 text-xs text-destructive">This integration is turned off for the workspace.</p>
              )}
              <Button className="mt-4" disabled={!service.isEnabled || connecting === service.id} onClick={() => handleConnect(service)}>
                {connecting === service.id ? 'Connecting…' : `Connect ${service.serviceName}`}
              </Button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
