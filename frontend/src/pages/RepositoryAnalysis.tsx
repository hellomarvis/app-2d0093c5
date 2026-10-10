import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states';
import { apiClient, ApiError } from '@/lib/apiClient';

interface Issue { title: string; severity: string; explanation: string }
interface Analysis {
  id: number; repoName: string; repoDescription: string; status: string;
  codeSummary: string | null; architectureText: string | null; dependenciesText: string | null;
  potentialIssues: Issue[] | null; requestedByName: string; requestedAt: string; completedAt: string | null;
}

export const RepositoryAnalysis = (): React.ReactElement => {
  const { id } = useParams<{ id: string }>();
  const [analysis, setAnalysis] = React.useState<Analysis | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [retrying, setRetrying] = React.useState(false);
  const [question, setQuestion] = React.useState('');
  const [seamNotice, setSeamNotice] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    if (!id) return;
    setError(null);
    apiClient
      .get<Analysis>(`/api/repositories/${id}`)
      .then(setAnalysis)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load repository'));
  }, [id]);

  React.useEffect(() => { load(); }, [load]);

  const handleRetry = async (): Promise<void> => {
    if (!id) return;
    setRetrying(true);
    try {
      await apiClient.post(`/api/repositories/${id}/analyze`, {});
    } catch (err) {
      toast.info(err instanceof ApiError ? err.message : 'Analysis is not available yet');
    } finally {
      setRetrying(false);
      load();
    }
  };

  const handleAsk = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!question.trim() || !id) return;
    setSeamNotice(null);
    try {
      await apiClient.post(`/api/repositories/${id}/questions`, { question: question.trim() });
      setQuestion('');
    } catch (err) {
      setSeamNotice(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <EmptyState title="Repository not found" description={error} action={<Button asChild><Link to="/repositories">Back to Repositories</Link></Button>} />
      </div>
    );
  }
  if (!analysis) return <LoadingState className="m-6" />;

  return (
    <div data-sec="sec-9" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="eyebrow">Repository analysis</div>
          <div className="flex items-center gap-2">
            <h1>{analysis.repoName}</h1>
            <Badge className={analysis.status === 'complete' ? 'bg-secondary/10 text-secondary' : 'bg-primary/10 text-primary'}>
              {analysis.status}
            </Badge>
          </div>
          <p className="subtle mt-1 max-w-xl text-muted-foreground">{analysis.repoDescription}</p>
        </div>
        <Button variant="outline" disabled={retrying} onClick={handleRetry}>
          {retrying ? 'Analysing…' : 'Retry analysis'}
        </Button>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_.72fr]">
        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
            <h2 className="font-display text-lg">Code summary</h2>
            <p className="mt-2 text-sm text-foreground">{analysis.codeSummary ?? 'Not analysed yet.'}</p>
          </section>
          <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
            <h2 className="font-display text-lg">Architecture</h2>
            <p className="mt-2 text-sm text-foreground">{analysis.architectureText ?? 'Not analysed yet.'}</p>
          </section>
          <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
            <h2 className="font-display text-lg">Dependencies</h2>
            <p className="mt-2 text-sm text-foreground">{analysis.dependenciesText ?? 'Not analysed yet.'}</p>
          </section>
          <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
            <h2 className="font-display text-lg">Potential issues</h2>
            {!analysis.potentialIssues || analysis.potentialIssues.length === 0 ? (
              <EmptyState className="mt-2" title="No issues recorded" />
            ) : (
              <div className="mt-2 flex flex-col gap-3">
                {analysis.potentialIssues.map((issue, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-2">
                      <strong className="text-sm text-foreground">{issue.title}</strong>
                      <Badge className="bg-accent/10 text-accent">{issue.severity}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{issue.explanation}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
            <h2 className="font-display text-lg">Analysis record</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Requested by</dt><dd className="font-medium text-foreground">{analysis.requestedByName}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Requested</dt><dd className="font-mono text-xs text-muted-foreground">{new Date(analysis.requestedAt).toLocaleString()}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Completed</dt><dd className="font-mono text-xs text-muted-foreground">{analysis.completedAt ? new Date(analysis.completedAt).toLocaleString() : '—'}</dd></div>
            </dl>
          </section>

          <form onSubmit={handleAsk} className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
            <h2 className="font-display text-lg">Ask about this repository</h2>
            <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} required placeholder="Explain a function, dependency, architecture choice, or issue" className="mt-2 min-h-[80px] text-base" />
            <Button type="submit" className="mt-2 w-full" disabled={!question.trim()}>Ask question</Button>
          </form>
          {seamNotice && <div className="rounded-xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">{seamNotice}</div>}
        </aside>
      </div>
    </div>
  );
};
