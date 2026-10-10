import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ErrorState, LoadingState } from '@/components/common/states';
import { apiClient, ApiError } from '@/lib/apiClient';

interface IntegrationRow {
  id: number;
  serviceName: string;
  isEnabled: boolean;
  updatedAt: string;
  updatedByName: string;
}

export const AdminIntegrations = (): React.ReactElement => {
  const [rows, setRows] = React.useState<IntegrationRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    apiClient
      .get<IntegrationRow[]>('/api/integrations')
      .then(setRows)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load integrations'));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (row: IntegrationRow): Promise<void> => {
    try {
      await apiClient.put(`/api/integrations/${row.id}/toggle`, {});
      toast.success(`${row.serviceName} is now ${row.isEnabled ? 'Unavailable' : 'Available'}`);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to toggle service');
    }
  };

  return (
    <div data-sec="sec-14" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <div className="eyebrow">Service governance</div>
        <h1 id="integrations-title">Admin Integrations</h1>
        <p className="subtle mt-1 max-w-2xl text-muted-foreground">Configure third-party integration availability and attribute each change.</p>
      </header>

      {error ? (
        <ErrorState className="mt-6" message={error} onRetry={load} />
      ) : !rows ? (
        <LoadingState className="mt-6" />
      ) : (
        <section className="mt-6 rounded-xl border border-border bg-card shadow-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Availability</TableHead>
                  <TableHead>Last updated</TableHead>
                  <TableHead>Updated by</TableHead>
                  <TableHead>Control</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-foreground">{row.serviceName}</TableCell>
                    <TableCell>
                      <Badge className={row.isEnabled ? 'bg-secondary/10 text-secondary' : 'bg-destructive/10 text-destructive'}>
                        {row.isEnabled ? 'Available' : 'Unavailable'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{new Date(row.updatedAt).toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground">{row.updatedByName}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => handleToggle(row)}>
                        Toggle service
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
};
