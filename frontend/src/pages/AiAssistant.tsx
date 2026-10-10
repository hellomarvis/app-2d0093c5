import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states';
import { apiClient, ApiError } from '@/lib/apiClient';

interface AssistantQuestion {
  id: number;
  questionText: string;
  answerText: string;
  sourcesUsed: string[];
  askedAt: string;
}

export const AiAssistant = (): React.ReactElement => {
  const [history, setHistory] = React.useState<AssistantQuestion[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [question, setQuestion] = React.useState('');
  const [asking, setAsking] = React.useState(false);
  const [seamNotice, setSeamNotice] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    apiClient
      .get<AssistantQuestion[]>('/api/assistant/questions')
      .then((data) => {
        setHistory(data);
        setSelectedId((id) => id ?? data[0]?.id ?? null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load past questions'));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const current = history?.find((q) => q.id === selectedId) ?? null;

  const handleAsk = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    setSeamNotice(null);
    try {
      await apiClient.post('/api/assistant/questions', { question: question.trim() });
      setQuestion('');
      load();
    } catch (err) {
      setSeamNotice(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setAsking(false);
    }
  };

  return (
    <div data-sec="sec-10" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <div className="eyebrow">Permission-aware search</div>
        <div className="flex items-center gap-2">
          <h1 id="assistant-title">AI Assistant</h1>
          <Badge className="bg-secondary/10 text-secondary">Your access only</Badge>
        </div>
        <p className="subtle mt-1 max-w-xl text-muted-foreground">
          Question conversations, connected documents, emails, Slack messages, and code repositories in one place.
        </p>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_.36fr]">
        <section className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
            <div className="eyebrow text-xs">Current answer</div>
            {current ? (
              <>
                <h2 className="mt-1 font-display text-xl">{current.questionText}</h2>
                <p className="mt-2 text-base text-foreground">{current.answerText}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {current.sourcesUsed.map((source) => (
                    <span key={source} className="rounded-full bg-secondary/10 px-2.5 py-1 text-xs text-secondary">
                      {source}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState className="mt-3" title="Ask about your chats, documents, emails or repositories" />
            )}
          </div>

          {seamNotice && (
            <div className="rounded-xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">{seamNotice}</div>
          )}

          <form onSubmit={handleAsk} className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
            <label htmlFor="assistant-question" className="text-sm font-medium text-foreground">
              Ask across your permitted workspace
            </label>
            <Textarea
              id="assistant-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              required
              placeholder="Ask about a conversation, document, email, Slack message, or repository"
              className="mt-2 min-h-[88px] text-base"
            />
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">Sources are limited to content you have permission to access.</span>
              <Button type="submit" disabled={asking || !question.trim()}>
                {asking ? 'Tracing permitted sources…' : 'Ask question'}
              </Button>
            </div>
          </form>
        </section>

        <aside className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
          <h2 className="font-display text-lg">Past questions</h2>
          {error ? (
            <ErrorState className="mt-4" message={error} onRetry={load} />
          ) : !history ? (
            <LoadingState className="mt-4" />
          ) : history.length === 0 ? (
            <EmptyState className="mt-4" title="No questions yet" />
          ) : (
            <div className="mt-3 flex flex-col divide-y divide-border">
              {history.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setSelectedId(q.id)}
                  className={[
                    'flex flex-col gap-0.5 py-2.5 text-left text-sm transition',
                    q.id === current?.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  <span className="font-medium">{q.questionText}</span>
                  <span className="font-mono text-xs text-muted-foreground">{new Date(q.askedAt).toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
