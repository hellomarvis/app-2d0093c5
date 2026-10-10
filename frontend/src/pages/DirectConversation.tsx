import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { InitialsAvatar } from '@/components/common/InitialsAvatar';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states';
import { apiClient, ApiError } from '@/lib/apiClient';

interface Member { userId: number; memberDisplayName: string }
interface Channel { id: number; name: string }
interface Message { id: number; authorDisplayName: string; body: string; createdAt: string; mediaUrl: string | null }

export const DirectConversation = (): React.ReactElement => {
  const { id } = useParams<{ id: string }>();
  const [channel, setChannel] = React.useState<(Channel & { members: Member[] }) | null>(null);
  const [messages, setMessages] = React.useState<Message[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);

  const load = React.useCallback(() => {
    if (!id) return;
    setError(null);
    apiClient
      .post<Channel & { members: Member[] }>(`/api/channels/direct/${id}`, {})
      .then((c) =>
        apiClient.get<Message[]>(`/api/channels/${c.id}/messages`).then((m) => {
          setChannel(c);
          setMessages(m);
        }),
      )
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load conversation'));
  }, [id]);

  React.useEffect(() => { load(); }, [load]);

  const handleSend = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!draft.trim() || !channel) return;
    setSending(true);
    try {
      await apiClient.post(`/api/channels/${channel.id}/messages`, { body: draft.trim() });
      setDraft('');
      load();
      toast.success('Message sent');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <ErrorState message={error} onRetry={load} />
        <div className="mt-4 text-center">
          <Button asChild variant="outline"><Link to="/people">Back to People Directory</Link></Button>
        </div>
      </div>
    );
  }
  if (!channel || !messages) return <LoadingState className="m-6" />;

  const counterpart = channel.name;

  return (
    <div data-sec="sec-5" className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
      <section className="flex min-w-0 flex-col rounded-xl border border-border bg-card">
        <header className="flex items-center gap-3 border-b border-border p-4">
          <InitialsAvatar name={counterpart} size="sm" />
          <h2 className="font-display text-xl">{counterpart}</h2>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4" style={{ maxHeight: '60vh' }}>
          {messages.length === 0 ? (
            <EmptyState title="No messages yet" description={`Send the first message to ${counterpart}.`} />
          ) : (
            messages.map((message) => (
              <article key={message.id} className="flex gap-3">
                <InitialsAvatar name={message.authorDisplayName} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <strong className="text-sm font-semibold text-foreground">{message.authorDisplayName}</strong>
                    <time className="font-mono text-xs text-muted-foreground">{new Date(message.createdAt).toLocaleTimeString()}</time>
                  </div>
                  <div className="mt-0.5 text-base text-foreground">{message.body}</div>
                  {message.mediaUrl && (
                    <div className="mt-2 flex h-24 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 via-background to-secondary/10">
                      <strong className="text-sm text-foreground">Media attachment</strong>
                    </div>
                  )}
                </div>
              </article>
            ))
          )}
        </div>

        <form onSubmit={handleSend} className="flex flex-col gap-3 border-t border-border p-4">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message ${counterpart}`}
            required
            className="min-h-[72px] text-base"
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={sending || !draft.trim()}>
              {sending ? 'Sending…' : 'Send message'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
};
