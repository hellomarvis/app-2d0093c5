import * as React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LoadingRows, EmptyState, ErrorState } from '@/components/common/states';

export interface DataTableColumn<T> {
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableShellProps<T> {
  columns: Array<DataTableColumn<T>>;
  data: T[] | undefined;
  rowKey: (row: T) => string | number;
  isLoading?: boolean;
  error?: { message?: string } | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}

// Generic table wrapper: handles loading / error / empty / data states so
// generated and custom list pages don't re-implement them every time.
export function DataTableShell<T>({
  columns,
  data,
  rowKey,
  isLoading,
  error,
  onRetry,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
}: DataTableShellProps<T>): React.ReactElement {
  if (isLoading) return <LoadingRows />;
  if (error) return <ErrorState message={error.message} onRetry={onRetry} />;
  if (!data || data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col, i) => (
              <TableHead key={i} className={col.className}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((col, i) => (
                <TableCell key={i} className={col.className}>
                  {col.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
