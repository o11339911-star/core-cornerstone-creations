import * as React from "react";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { EmptyState, ErrorState, LoadingState } from "./states";

export type DataTableColumn<T> = {
  id: string;
  header: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  /** Numeric columns stay LTR-aligned even in RTL layouts. */
  numeric?: boolean | undefined;
  className?: string | undefined;
  headerClassName?: string | undefined;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T, index: number) => string;
  caption?: React.ReactNode | undefined;
  isLoading?: boolean | undefined;
  isError?: boolean | undefined;
  onRetry?: (() => void) | undefined;
  emptyTitle?: string | undefined;
  emptyDescription?: string | undefined;
  onRowClick?: ((row: T) => void) | undefined;
  className?: string | undefined;
};

/**
 * Rakeez data table: responsive (horizontal scroll instead of overflow),
 * direction-aware and wired to the shared loading/empty/error states.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  caption,
  isLoading = false,
  isError = false,
  onRetry,
  emptyTitle,
  emptyDescription,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const t = useT();

  if (isLoading) return <LoadingState rows={4} />;
  if (isError) return <ErrorState {...(onRetry ? { onRetry } : {})} />;
  if (rows.length === 0)
    return (
      <EmptyState
        {...(emptyTitle ? { title: emptyTitle } : { title: t("table.empty") })}
        {...(emptyDescription ? { description: emptyDescription } : {})}
      />
    );

  return (
    <div className={cn("w-full max-w-full overflow-x-auto rounded-xl border border-border bg-card", className)}>
      <Table>
        {caption ? <TableCaption>{caption}</TableCaption> : null}
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.id}
                scope="col"
                className={cn(
                  "whitespace-nowrap text-start",
                  column.numeric && "text-end tabular-nums",
                  column.headerClassName,
                )}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow
              key={getRowId(row, index)}
              {...(onRowClick
                ? {
                    onClick: () => onRowClick(row),
                    tabIndex: 0,
                    role: "button",
                    onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    },
                    className: "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  }
                : {})}
            >
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  className={cn("text-start align-middle", column.numeric && "text-end tabular-nums", column.className)}
                >
                  {column.cell(row, index)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
