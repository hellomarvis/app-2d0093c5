import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { InitialsAvatar } from '@/components/common/InitialsAvatar';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState, LoadingState } from '@/components/common/states';
import { apiClient, ApiError } from '@/lib/apiClient';

interface Member { id: number; userId: number; memberDisplayName: string; joinedAt: string }
interface Attachment { id: number; title: string; sharedByName: string }
interface ChannelDetail {
  id: number; name: string; purpose: string; isArchived: boolean; archivedAt: string | null;
  createdAt: string; creatorDisplayName: string; members: Member[]; attachments: Attachment[];
}

export const ChannelDetails = (): React.ReactElement => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [channel, setChannel] = React.useState<ChannelDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [purpose, setPurpose] = React.useState('');
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [leaveOpen, setLeaveOpen] = React.useState(false);

  const load = React.useCallback(() => {
    if (!id) return;
    setError(null);
    apiClient
      .get<ChannelDetail>(`/api/channels/${id}`)
      .then((c) => { setChannel(c); setName(c.name); setPurpose(c.purpose); })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load channel'));
  }, [id]);

  React.useEffect(() => { load(); }, [load]);

  const handleSave = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!name.trim() || !purpose.trim() || !id) return;
    try {
      await apiClient.put(`/api/channels/${id}`, { name, purpose });
      toast.success('Channel settings saved');
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save settings');
    }
  };

  const handleArchive = async (): Promise<void> => {
    if (!id) return;
    try {
      await apiClient.post(`/api/channels/${id}/archive`, {});
      toast.success('Channel archived');
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to archive channel');
    } finally {
      setArchiveOpen(false);
    }
  };

  const handleLeave = async (): Promise<void> => {
    if (!id) return;
    try {
      await apiClient.post(`/api/channels/${id}/leave`, {});
      toast.success('Left channel');
      navigate('/workspace-home');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to leave channel');
    } finally {
      setLeaveOpen(false);
    }
  };

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <EmptyState title="Channel not found" description={error} action={<Button asChild><Link to="/workspace-home">Back to Workspace Home</Link></Button>} />
      </div>
    );
  }
  if (!channel) return <LoadingState className="m-6" />;

  return (
    <div data-sec="sec-4" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="eyebrow">Channel governance</div>
          <div className="flex items-center gap-2">
            <h1># {channel.name}</h1>
            <Badge className={channel.isArchived ? 'bg-destructive/10 text-destructive' : 'bg-secondary/10 text-secondary'}>
              {channel.isArchived ? 'Archived' : 'Active'}
            </Badge>
          </div>
          <p className="subtle mt-1 text-muted-foreground">{channel.purpose}</p>
        </div>
        <Button variant="outline" onClick={() => navigate(`/channels/${channel.id}`)}>Back to conversation</Button>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_.8fr]">
        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
            <h2 className="font-display text-lg">Channel settings</h2>
            <form onSubmit={handleSave} className="mt-4 flex flex-col gap-4">
              <fieldset disabled={channel.isArchived} className="flex flex-col gap-4 disabled:opacity-60">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="channel-name">Channel name</Label>
                    <Input id="channel-name" value={name} onChange={(e) => setName(e.target.value)} required className="min-h-11" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Creator</Label>
                    <div className="flex min-h-11 items-center rounded-md border border-input bg-background/60 px-3 text-sm text-muted-foreground">
                      {channel.creatorDisplayName}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="channel-purpose">Purpose</Label>
                  <Textarea id="channel-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} required className="text-base" />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label>Created date</Label>
                    <div className="font-mono text-xs text-muted-foreground">{new Date(channel.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Archived date</Label>
                    <div className="font-mono text-xs text-muted-foreground">
                      {channel.archivedAt ? new Date(channel.archivedAt).toLocaleDateString() : 'Not archived'}
                    </div>
                  </div>
                </div>
                <Button type="submit">Rename channel and edit purpose</Button>
              </fieldset>
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button type="button" variant="destructive" disabled={channel.isArchived} onClick={() => setArchiveOpen(true)}>
                  Archive channel
                </Button>
                <Button type="button" variant="outline" onClick={() => setLeaveOpen(true)}>Leave channel</Button>
              </div>
            </form>
          </section>

          <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
            <h2 className="font-display text-lg">Members</h2>
            <div className="mt-4 flex flex-col divide-y divide-border">
              {channel.members.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <InitialsAvatar name={m.memberDisplayName} size="sm" />
                    <div>
                      <div className="font-medium text-foreground">{m.memberDisplayName}</div>
                      <div className="font-mono text-xs text-muted-foreground">Joined {new Date(m.joinedAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
          <h2 className="font-display text-lg">Shared history</h2>
          {channel.attachments.length === 0 ? (
            <EmptyState className="mt-4" title="Nothing shared yet" description="Files attached to this channel will appear here." />
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {channel.attachments.map((a) => (
                <div key={a.id} className="rounded-lg border border-border bg-background/60 p-3">
                  <div className="font-medium text-foreground">{a.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Shared by {a.sharedByName}</div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      <ConfirmDialog open={archiveOpen} onOpenChange={setArchiveOpen} title="Archive this channel?" confirmLabel="Archive channel" destructive onConfirm={handleArchive} />
      <ConfirmDialog open={leaveOpen} onOpenChange={setLeaveOpen} title="Leave this channel?" confirmLabel="Leave channel" destructive onConfirm={handleLeave} />
    </div>
  );
};
