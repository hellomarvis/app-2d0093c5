import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InitialsAvatar } from '@/components/common/InitialsAvatar';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states';
import { apiClient, ApiError } from '@/lib/apiClient';

interface Person {
  id: number;
  displayName: string;
  role: 'admin' | 'professional' | 'developer';
  createdAt: string;
}

const ROLE_LABEL: Record<Person['role'], string> = {
  admin: 'Admin',
  professional: 'Connected Professional',
  developer: 'Developer Collaborator',
};

function roleBadgeVariant(role: Person['role']): 'default' | 'secondary' | 'outline' {
  if (role === 'admin') return 'default';
  if (role === 'developer') return 'secondary';
  return 'outline';
}

export const People = (): React.ReactElement => {
  const navigate = useNavigate();
  const [people, setPeople] = React.useState<Person[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    setPeople(null);
    apiClient
      .get<Person[]>('/api/people')
      .then(setPeople)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load the directory'));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div data-sec="sec-6" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <div data-edit-id="sec-6:div:2" className="eyebrow">
          Connected workspace
        </div>
        <h1 data-edit-id="sec-6:h1:3" id="people-title">
          People Directory
        </h1>
        <p data-edit-id="sec-6:p:4" className="subtle mt-1 max-w-xl text-muted-foreground">
          Find a collaborator and begin a real-time conversation.
        </p>
      </header>

      {error ? (
        <ErrorState className="mt-6" message={error} onRetry={load} />
      ) : !people ? (
        <LoadingState className="mt-6" />
      ) : people.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="No people yet"
          description="Invited teammates will appear here once they join the workspace."
        />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((person) => (
            <article key={person.id} className="lift flex flex-col rounded-xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-center gap-3">
                <InitialsAvatar name={person.displayName} size="md" />
                <div className="min-w-0">
                  <h2 className="truncate font-display text-lg">{person.displayName}</h2>
                  <Badge variant={roleBadgeVariant(person.role)} className="mt-1">
                    {ROLE_LABEL[person.role]}
                  </Badge>
                </div>
              </div>
              <div className="mt-4 border-t border-border pt-3">
                <div className="meta font-mono text-xs text-muted-foreground">
                  Joined {new Date(person.createdAt).toLocaleDateString()}
                </div>
              </div>
              <Button className="mt-4 w-full" onClick={() => navigate(`/direct/${person.id}`)}>
                Start chat
              </Button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
