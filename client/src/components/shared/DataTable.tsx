import { useState, useMemo, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput } from "@/components/shared/SearchInput";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DataTablePagination } from "@/components/shared/DataTablePagination";
import { DataTableColumnToggle } from "@/components/shared/DataTableColumnToggle";
import { usePagination } from "@/hooks/usePagination";
import { useTableSort } from "@/hooks/useTableSort";
import { useSearchFilter } from "@/hooks/useSearchFilter";
import { cn } from "@/lib/utils";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  type LucideIcon,
} from "lucide-react";

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  type?: "text" | "financial" | "date" | "status";
  hidden?: boolean;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  pageSizes?: number[];
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  onRowClick?: (row: T) => void;
  actions?: React.ReactNode;
  className?: string;
}

// ────────────────────────────────────────────
// Formatters
// ────────────────────────────────────────────

const financialFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

function formatCellValue<T>(row: T, column: Column<T>): React.ReactNode {
  if (column.render) return column.render(row);

  const value = (row as Record<string, unknown>)[column.key];
  if (value == null) return "—";

  switch (column.type) {
    case "financial":
      return financialFormatter.format(Number(value));
    case "date": {
      const date = value instanceof Date ? value : new Date(String(value));
      return isNaN(date.getTime()) ? String(value) : dateFormatter.format(date);
    }
    case "status":
      return <StatusBadge status={String(value)} />;
    default:
      return String(value);
  }
}

// ────────────────────────────────────────────
// Sort icon for column headers
// ────────────────────────────────────────────

function SortIcon({
  columnKey,
  sortKey,
  sortDirection,
}: {
  columnKey: string;
  sortKey: string | null;
  sortDirection: "asc" | "desc";
}) {
  if (sortKey !== columnKey) {
    return <ChevronsUpDown className="ms-1 inline h-3.5 w-3.5 text-muted-foreground/50" />;
  }
  return sortDirection === "asc" ? (
    <ChevronUp className="ms-1 inline h-3.5 w-3.5" />
  ) : (
    <ChevronDown className="ms-1 inline h-3.5 w-3.5" />
  );
}

// ────────────────────────────────────────────
// Component
// ────────────────────────────────────────────

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns: initialColumns,
  loading = false,
  searchable = false,
  searchPlaceholder = "Search...",
  pageSizes = [25, 50, 100],
  emptyTitle = "No data found",
  emptyDescription = "Try adjusting your search or filters.",
  emptyIcon: EmptyIcon,
  onRowClick,
  actions,
  className,
}: DataTableProps<T>) {
  // Column visibility state
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
    const vis: Record<string, boolean> = {};
    initialColumns.forEach((col) => {
      vis[col.key] = !col.hidden;
    });
    return vis;
  });

  const columns = useMemo(
    () =>
      initialColumns.map((col) => ({
        ...col,
        hidden: !columnVisibility[col.key],
      })),
    [initialColumns, columnVisibility]
  );

  const visibleColumns = useMemo(() => columns.filter((c) => !c.hidden), [columns]);

  const toggleColumn = useCallback((key: string) => {
    setColumnVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Search
  const { searchTerm, setSearchTerm, debouncedTerm } = useSearchFilter();

  // Sort
  const { sortKey, sortDirection, toggleSort, sortData } = useTableSort<T>();

  // Filtered + sorted data
  const processedData = useMemo(() => {
    let result = data;

    // Client-side search
    if (debouncedTerm) {
      const term = debouncedTerm.toLowerCase();
      result = result.filter((row) =>
        visibleColumns.some((col) => {
          const val = (row as Record<string, unknown>)[col.key];
          return val != null && String(val).toLowerCase().includes(term);
        })
      );
    }

    // Sort
    result = sortData(result);

    return result;
  }, [data, debouncedTerm, visibleColumns, sortData]);

  // Pagination
  const pagination = usePagination({
    totalItems: processedData.length,
    initialPageSize: pageSizes[0] ?? 25,
  });

  const pageData = useMemo(
    () => processedData.slice(pagination.startIndex, pagination.endIndex),
    [processedData, pagination.startIndex, pagination.endIndex]
  );

  // ────────────────────────────────────────
  // Loading skeleton rows
  // ────────────────────────────────────────
  if (loading) {
    return (
      <div className={cn("space-y-4", className)}>
        {searchable && (
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-9 w-64" />
            {actions && <Skeleton className="h-9 w-32" />}
          </div>
        )}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {visibleColumns.map((col) => (
                  <TableHead key={col.key}>{col.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {visibleColumns.map((col) => (
                    <TableCell key={col.key}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────
  // Render
  // ────────────────────────────────────────
  return (
    <div className={cn("space-y-4", className)}>
      {/* Toolbar: search + actions + column toggle */}
      {(searchable || actions) && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {searchable && (
              <SearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder={searchPlaceholder}
                className="w-64"
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <DataTableColumnToggle columns={columns} onToggleColumn={toggleColumn} />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {visibleColumns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    col.sortable && "cursor-pointer select-none",
                    col.type === "financial" && "text-end",
                    col.className
                  )}
                  onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center">
                    {col.label}
                    {col.sortable && (
                      <SortIcon
                        columnKey={col.key}
                        sortKey={sortKey}
                        sortDirection={sortDirection}
                      />
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {pageData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleColumns.length}
                  className="h-48 text-center"
                >
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    {EmptyIcon && <EmptyIcon className="h-10 w-10 opacity-40" />}
                    <p className="text-sm font-medium">{emptyTitle}</p>
                    <p className="text-xs">{emptyDescription}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              pageData.map((row, rowIndex) => (
                <TableRow
                  key={(row as Record<string, unknown>).id != null ? String((row as Record<string, unknown>).id) : rowIndex}
                  className={cn(onRowClick && "cursor-pointer")}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {visibleColumns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(
                        col.type === "financial" && "font-mono tabular-nums text-end",
                        col.className
                      )}
                    >
                      {formatCellValue(row, col)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <DataTablePagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalPages={pagination.totalPages}
        totalItems={processedData.length}
        startIndex={pagination.startIndex}
        endIndex={pagination.endIndex}
        hasNext={pagination.hasNext}
        hasPrev={pagination.hasPrev}
        onNextPage={pagination.nextPage}
        onPrevPage={pagination.prevPage}
        onChangePageSize={pagination.changePageSize}
        pageSizes={pageSizes}
      />
    </div>
  );
}
