import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { InitialsAvatar } from '@/components/common/InitialsAvatar';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';

interface ChannelSummary {
  id: number;
  name: string;
  purpose: string;
  isArchived: boolean;
  memberCount: number;
  lastMessageAt: string;
}

interface Person {
  id: number;
  displayName: string;
  role: string;
}

export const WorkspaceHome = (): React.ReactElement => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [channels, setChannels] = React.useState<ChannelSummary[] | null>(null);
  const [people, setPeople] = React.useState<Person[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [purpose, setPurpose] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  const load = React.useCallback(() => {
    setError(null);
    Promise.all([apiClient.get<ChannelSummary[]>('/api/channels'), apiClient.get<Person[]>('/api/people')])
      .then(([c, p]) => {
        setChannels(c);
        setPeople(p);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load workspace'));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!name.trim() || !purpose.trim()) return;
    setCreating(true);
    try {
      const channel = await apiClient.post<{ id: number; name: string }>('/api/channels', { name, purpose });
      toast.success(`Channel created: #${channel.name}`);
      setCreateOpen(false);
      setName('');
      setPurpose('');
      navigate(`/channels/${channel.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create channel');
    } finally {
      setCreating(false);
    }
  };

  if (error) return <ErrorState className="m-6" message={error} onRetry={load} />;
  if (!channels || !people) return <LoadingState className="m-6" />;

  return (
    <div data-sec="sec-2" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="eyebrow">Operational nexus</div>
          <h1>Good morning, {user?.email.split('@')[0] ?? 'there'}</h1>
          <p className="subtle mt-1 max-w-xl text-muted-foreground">
            Your channels, messages, and recent AI knowledge are organized around the work that needs attention.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate('/people')}>
            Start direct message
          </Button>
          <Button onClick={() => setCreateOpen(true)}>Create channel</Button>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_.72fr]">
        <section className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between gap-3 border-b border-border p-4">
            <div>
              <h2 className="font-display text-lg">Active channels</h2>
              <span className="meta font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Live conversations</span>
            </div>
          </div>
          {channels.length === 0 ? (
            <EmptyState
              className="m-4"
              title="No channels yet"
              description="Create your first channel to start collaborating."
              action={<Button onClick={() => setCreateOpen(true)}>Create channel</Button>}
            />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {channels.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => navigate(`/channels/${channel.id}`)}
                  className="flex items-center justify-between gap-4 p-4 text-left transition hover:bg-muted/60"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-foreground"># {channel.name}</div>
                    <div className="mt-0.5 truncate text-sm text-muted-foreground">{channel.purpose}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                    <span className="font-mono text-xs text-muted-foreground">{channel.memberCount} members</span>
                    <span className="rounded-md border border-border px-2 py-0.5 text-xs">Open channel</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg">Direct messages</h2>
              <Button size="sm" variant="outline" onClick={() => navigate('/people')}>
                New
              </Button>
            </div>
            {people.length === 0 ? (
              <EmptyState className="mt-3" title="No teammates yet" />
            ) : (
              <div className="mt-3 flex flex-col gap-1">
                {people.slice(0, 5).map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => navigate(`/direct/${person.id}`)}
                    className="flex items-center gap-2.5 rounded-lg p-2 text-left transition hover:bg-muted/60"
                  >
                    <InitialsAvatar name={person.displayName} size="sm" />
                    <span className="font-medium text-foreground">{person.displayName}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4 shadow-card">
            <h2 className="font-display text-lg">Recent AI summaries</h2>
            <EmptyState
              className="mt-3"
              title="No summaries yet"
              description="Ask AI to summarise a channel once OpenAI is connected."
            />
          </section>
        </aside>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a group channel</DialogTitle>
            <DialogDescription>Give it a name and purpose — you can invite collaborators afterward.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="channel-name">Channel name</Label>
              <Input id="channel-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="design-review" className="min-h-11" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="channel-purpose">Purpose</Label>
              <Textarea
                id="channel-purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                required
                placeholder="What will this group coordinate?"
                className="text-base"
              />
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? 'Creating channel…' : 'Create channel'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
