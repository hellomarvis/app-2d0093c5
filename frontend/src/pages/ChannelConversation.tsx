import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { InitialsAvatar } from '@/components/common/InitialsAvatar';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states';
import { apiClient, ApiError } from '@/lib/apiClient';
import { GenerateImageButton } from '@/components/capabilities/GenerateImageButton';
import { GenerateVideoButton } from '@/components/capabilities/GenerateVideoButton';

interface Member { id: number; userId: number; memberDisplayName: string; isOwner: boolean }
interface ChannelDetail {
  id: number; name: string; purpose: string; isArchived: boolean; members: Member[];
}
interface Message {
  id: number; authorDisplayName: string; body: string; createdAt: string; isDeleted: boolean;
  kind: string; mediaUrl: string | null;
}

export const ChannelConversation = (): React.ReactElement => {
  const { id } = useParams<{ id: string }>();
  const [channel, setChannel] = React.useState<ChannelDetail | null>(null);
  const [messages, setMessages] = React.useState<Message[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [seamNotice, setSeamNotice] = React.useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = React.useState('');
  const [videoPrompt, setVideoPrompt] = React.useState('');

  const load = React.useCallback(() => {
    if (!id) return;
    setError(null);
    Promise.all([
      apiClient.get<ChannelDetail>(`/api/channels/${id}`),
      apiClient.get<Message[]>(`/api/channels/${id}/messages`),
    ])
      .then(([c, m]) => { setChannel(c); setMessages(m); })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load channel'));
  }, [id]);

  React.useEffect(() => { load(); }, [load]);

  const handleSend = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!draft.trim() || !id) return;
    setSending(true);
    try {
      await apiClient.post(`/api/channels/${id}/messages`, { body: draft.trim() });
      setDraft('');
      load();
      toast.success('Message sent');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleSummarise = async (): Promise<void> => {
    if (!id) return;
    setSeamNotice(null);
    try {
      await apiClient.post(`/api/channels/${id}/summary`, {});
    } catch (err) {
      setSeamNotice(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  if (error) return <ErrorState className="m-6" message={error} onRetry={load} />;
  if (!channel || !messages) return <LoadingState className="m-6" />;

  return (
    <div data-sec="sec-3" className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 px-4 py-4 sm:px-6 sm:py-6 md:grid-cols-[minmax(0,1fr)_300px]">
      <section className="flex min-w-0 flex-col rounded-xl border border-border bg-card">
        <header className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl"># {channel.name}</h2>
              <Badge className={channel.isArchived ? 'bg-destructive/10 text-destructive' : 'bg-secondary/10 text-secondary'}>
                {channel.isArchived ? 'Archived' : 'Active'}
              </Badge>
            </div>
            <p className="subtle mt-1 text-sm text-muted-foreground">{channel.purpose}</p>
            <div className="mt-2 flex -space-x-2">
              {channel.members.map((m) => (
                <InitialsAvatar key={m.id} name={m.memberDisplayName} size="sm" className="ring-2 ring-card" />
              ))}
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/channels/${id}/details`}>Details</Link>
          </Button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4" style={{ maxHeight: '55vh' }}>
          {messages.length === 0 ? (
            <EmptyState title="No messages yet" description="Send the first message in this channel." />
          ) : (
            messages.map((message) => (
              <article key={message.id} id={`message-${message.id}`} className="flex gap-3">
                <InitialsAvatar name={message.authorDisplayName} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <strong className="text-sm font-semibold text-foreground">{message.authorDisplayName}</strong>
                    <time className="font-mono text-xs text-muted-foreground">{new Date(message.createdAt).toLocaleTimeString()}</time>
                  </div>
                  <div className="mt-0.5 text-base text-foreground">{message.body}</div>
                  {message.mediaUrl && (
                    message.kind === 'ai_video' ? (
                      <video
                        src={message.mediaUrl}
                        controls
                        className="mt-2 max-w-xs rounded-lg border border-border"
                      />
                    ) : (
                      <img
                        src={message.mediaUrl}
                        alt={message.body}
                        className="mt-2 max-w-xs rounded-lg border border-border"
                        loading="lazy"
                      />
                    )
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
            placeholder={channel.isArchived ? 'This channel is archived.' : `Message #${channel.name}`}
            required
            disabled={channel.isArchived}
            className="min-h-[72px] text-base"
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={sending || !draft.trim() || channel.isArchived}>
              {sending ? 'Sending…' : 'Send message'}
            </Button>
          </div>
        </form>
      </section>

      <aside className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg">Nexus intelligence</h2>
          <Button size="sm" onClick={handleSummarise}>Summarise channel</Button>
        </div>
        {seamNotice ? (
          <div className="mt-4 rounded-lg border border-border bg-background/60 p-3 text-sm text-muted-foreground">{seamNotice}</div>
        ) : (
          <EmptyState className="mt-4" title="No summary yet" description="Summaries and key insights appear here once requested." />
        )}

        <div className="mt-6 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-foreground mb-2">Generate AI image</h3>
          <p className="text-xs text-muted-foreground mb-3">Describe an image to share in the channel.</p>
          <Input
            value={imagePrompt}
            onChange={(e) => setImagePrompt(e.target.value)}
            placeholder="A sunset over mountains…"
            className="mb-2 text-sm"
            disabled={channel.isArchived}
          />
          <GenerateImageButton
            prompt={imagePrompt.trim()}
            imageSize="landscape_4_3"
            showPreview={false}
            disabled={channel.isArchived || !imagePrompt.trim()}
            onReady={(result) => {
              apiClient
                .post(`/api/channels/${id}/media`, { kind: 'image', prompt: imagePrompt.trim(), mediaUrl: result.url })
                .then(() => { setImagePrompt(''); load(); toast.success('Image shared in channel'); })
                .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to share image'));
            }}
            onError={(msg) => toast.error(msg)}
          />
        </div>

        <div className="mt-6 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-foreground mb-2">Generate AI video</h3>
          <p className="text-xs text-muted-foreground mb-3">Describe a short video clip to share in the channel.</p>
          <Input
            value={videoPrompt}
            onChange={(e) => setVideoPrompt(e.target.value)}
            placeholder="A timelapse of code being written, soft keyboard sounds…"
            className="mb-2 text-sm"
            disabled={channel.isArchived}
          />
          <GenerateVideoButton
            prompt={videoPrompt.trim()}
            durationSecs={4}
            disabled={channel.isArchived || !videoPrompt.trim()}
            label="Generate video"
            onReady={(job) => {
              if (!job.videoUrl) return;
              apiClient
                .post(`/api/channels/${id}/media`, { kind: 'video', prompt: videoPrompt.trim(), mediaUrl: job.videoUrl })
                .then(() => { setVideoPrompt(''); load(); toast.success('Video shared in channel'); })
                .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to share video'));
            }}
            onError={(msg) => toast.error(msg)}
          />
        </div>
      </aside>
    </div>
  );
};
