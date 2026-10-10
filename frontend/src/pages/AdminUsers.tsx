import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InitialsAvatar } from '@/components/common/InitialsAvatar';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorState, LoadingState } from '@/components/common/states';
import { apiClient, ApiError } from '@/lib/apiClient';

type Role = 'admin' | 'professional' | 'developer';
interface AdminUser {
  id: number;
  email: string;
  displayName: string;
  role: Role;
  status: 'active' | 'suspended';
  createdAt: string;
}

const ROLE_OPTIONS: Role[] = ['professional', 'developer', 'admin'];
const ROLE_LABEL: Record<Role, string> = { professional: 'Connected Professional', developer: 'Developer Collaborator', admin: 'Admin' };

export const AdminUsers = (): React.ReactElement => {
  const [people, setPeople] = React.useState<AdminUser[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = React.useState<AdminUser | null>(null);
  const [restoreTarget, setRestoreTarget] = React.useState<AdminUser | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    apiClient
      .get<AdminUser[]>('/api/admin/users')
      .then(setPeople)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load users'));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleRoleChange = async (person: AdminUser, role: Role): Promise<void> => {
    if (role === person.role) return;
    try {
      await apiClient.put(`/api/admin/users/${person.id}/role`, { role });
      toast.success(`${person.displayName} is now ${ROLE_LABEL[role]}`);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to change role');
    }
  };

  const handleSuspend = async (): Promise<void> => {
    if (!suspendTarget) return;
    try {
      await apiClient.post(`/api/admin/users/${suspendTarget.id}/suspend`, {});
      toast.success(`Suspended ${suspendTarget.displayName}`);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to suspend user');
    } finally {
      setSuspendTarget(null);
    }
  };

  const handleRestore = async (): Promise<void> => {
    if (!restoreTarget) return;
    try {
      await apiClient.post(`/api/admin/users/${restoreTarget.id}/restore`, {});
      toast.success(`Restored ${restoreTarget.displayName}`);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to restore user');
    } finally {
      setRestoreTarget(null);
    }
  };

  return (
    <div data-sec="sec-12" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <div className="eyebrow">Account governance</div>
        <h1 id="users-title">Admin Users</h1>
        <p className="subtle mt-1 max-w-2xl text-muted-foreground">Manage user accounts, roles, permissions, and access status.</p>
      </header>

      {error ? (
        <ErrorState className="mt-6" message={error} onRetry={load} />
      ) : !people ? (
        <LoadingState className="mt-6" />
      ) : (
        <section className="mt-6 rounded-xl border border-border bg-card shadow-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Display name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={person.displayName} size="sm" />
                        <span className="font-medium text-foreground">{person.displayName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{person.email}</TableCell>
                    <TableCell>
                      <Select value={person.role} onValueChange={(value) => handleRoleChange(person, value as Role)}>
                        <SelectTrigger className="min-h-11 w-[210px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((role) => (
                            <SelectItem key={role} value={role}>
                              {ROLE_LABEL[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge className={person.status === 'active' ? 'bg-secondary/10 text-secondary' : 'bg-destructive/10 text-destructive'}>
                        {person.status === 'active' ? 'Active' : 'Suspended'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{new Date(person.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="destructive" disabled={person.status === 'suspended'} onClick={() => setSuspendTarget(person)}>
                          Suspend user
                        </Button>
                        <Button size="sm" variant="outline" disabled={person.status !== 'suspended'} onClick={() => setRestoreTarget(person)}>
                          Restore user
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={!!suspendTarget}
        onOpenChange={(open) => !open && setSuspendTarget(null)}
        title="Suspend this user?"
        description={suspendTarget ? `${suspendTarget.displayName} will lose access to the workspace until restored.` : undefined}
        confirmLabel="Suspend user"
        destructive
        onConfirm={handleSuspend}
      />
      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
        title="Restore this user?"
        description={restoreTarget ? `${restoreTarget.displayName} will regain access to the workspace.` : undefined}
        confirmLabel="Restore user"
        onConfirm={handleRestore}
      />
    </div>
  );
};
