import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states';
import { apiClient, ApiError } from '@/lib/apiClient';

interface RepositoryAnalysis {
  id: number;
  repoName: string;
  repoDescription: string;
  completedAt: string | null;
  requestedAt: string;
}

export const Repositories = (): React.ReactElement => {
  const navigate = useNavigate();
  const [repos, setRepos] = React.useState<RepositoryAnalysis[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    setRepos(null);
    apiClient
      .get<RepositoryAnalysis[]>('/api/repositories')
      .then(setRepos)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load repositories'));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleConnect = (): void => {
    toast.info('Connect GitHub from the Connections page.');
    navigate('/connections');
  };

  return (
    <div data-sec="sec-8" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="eyebrow">Developer intelligence</div>
          <h1 id="repo-title">Repositories</h1>
          <p className="subtle mt-1 max-w-xl text-muted-foreground">
            Browse connected GitHub repositories and select a codebase for analysis.
          </p>
        </div>
        <Button variant="outline" onClick={handleConnect}>
          Connect GitHub account
        </Button>
      </header>

      {error ? (
        <ErrorState className="mt-6" message={error} onRetry={load} />
      ) : !repos ? (
        <LoadingState className="mt-6" />
      ) : repos.length === 0 ? (
        <EmptyState className="mt-6" title="No repositories found" description="Connect GitHub to see your repositories here." />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {repos.map((repo) => (
            <article key={repo.id} className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="grid size-9 place-items-center rounded-lg border border-border bg-background font-mono text-sm text-secondary">
                  ⌘
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  Updated {new Date(repo.completedAt ?? repo.requestedAt).toLocaleDateString()}
                </span>
              </div>
              <h2 className="mt-3.5 text-lg font-semibold">{repo.repoName}</h2>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{repo.repoDescription}</p>
              <Button className="mt-4" onClick={() => navigate(`/repositories/${repo.id}`)}>
                Analyse repository
              </Button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
