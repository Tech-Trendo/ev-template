"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { Button } from "./Button";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/lib/pagination";

export type SortDirection = "asc" | "desc";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  width?: string;
  render?: (row: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string | number;
  loading?: boolean;
  stickyHeader?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  emptyState?: React.ReactNode;
  /** Client-side page size when uncontrolled. Default 10. */
  pageSize?: number;
  pageSizeOptions?: readonly number[];
  showPagination?: boolean;
  /**
   * Server-side mode: pass totalCount and control page (1-based).
   * `data` must already be the current page of rows.
   */
  totalCount?: number;
  page?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  /** Server-mode sort: when set, column header clicks call this instead of sorting locally. */
  onSortChange?: (key: string | null, direction: SortDirection) => void;
  sortKey?: string | null;
  sortDirection?: SortDirection;
  rowActions?: (row: T, index: number) => React.ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor,
  loading = false,
  stickyHeader = true,
  emptyTitle = "No records found",
  emptyDescription = "There are no records to display matching your criteria.",
  emptyAction,
  emptyState,
  pageSize: pageSizeProp = DEFAULT_PAGE_SIZE,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  showPagination = true,
  totalCount,
  page: pageProp,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  sortKey: sortKeyProp,
  sortDirection: sortDirectionProp,
  rowActions,
  onRowClick,
  className = "",
}: DataTableProps<T>) {
  const serverMode = typeof totalCount === "number" && typeof onPageChange === "function";
  const serverSortEnabled = serverMode && typeof onSortChange === "function";

  const [internalSortKey, setInternalSortKey] = useState<string | null>(null);
  const [internalSortDir, setInternalSortDir] = useState<SortDirection>("asc");
  const [internalPage, setInternalPage] = useState(1);
  const [internalPageSize, setInternalPageSize] = useState(pageSizeProp);

  const sortKey = serverSortEnabled
    ? (sortKeyProp !== undefined ? sortKeyProp : internalSortKey)
    : internalSortKey;
  const sortDir = serverSortEnabled
    ? (sortDirectionProp !== undefined ? sortDirectionProp : internalSortDir)
    : internalSortDir;
  const pageSize = serverMode ? pageSizeProp : internalPageSize;
  const currentPage = serverMode ? Math.max(1, pageProp ?? 1) : internalPage;

  useEffect(() => {
    if (!serverMode) setInternalPageSize(pageSizeProp);
  }, [pageSizeProp, serverMode]);

  useEffect(() => {
    if (!serverMode) setInternalPage(1);
  }, [data, serverMode]);

  const sortedData = useMemo(() => {
    if (!sortKey || serverMode) return data;

    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (aVal === bVal) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let comparison = 0;
      if (typeof aVal === "number" && typeof bVal === "number") {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sortDir === "asc" ? comparison : -comparison;
    });
  }, [data, sortKey, sortDir, serverMode]);

  const recordCount = serverMode ? totalCount! : sortedData.length;
  const totalPages = Math.max(1, Math.ceil(recordCount / pageSize) || 1);

  const paginatedData = useMemo(() => {
    if (!showPagination) return sortedData;
    if (serverMode) return sortedData;
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize, showPagination, serverMode]);

  useEffect(() => {
    if (serverMode) return;
    if (currentPage > totalPages) setInternalPage(totalPages);
  }, [currentPage, totalPages, serverMode]);

  const handleSort = (key: string) => {
    if (serverMode && !serverSortEnabled) return;

    let nextKey: string | null = key;
    let nextDir: SortDirection = "asc";
    if (sortKey === key) {
      if (sortDir === "asc") {
        nextDir = "desc";
      } else {
        nextKey = null;
        nextDir = "asc";
      }
    }

    if (serverSortEnabled) {
      if (sortKeyProp === undefined) setInternalSortKey(nextKey);
      if (sortDirectionProp === undefined) setInternalSortDir(nextDir);
      onSortChange?.(nextKey, nextDir);
      return;
    }

    setInternalSortKey(nextKey);
    setInternalSortDir(nextDir);
  };

  const sortInteractive = (col: Column<T>) => Boolean(col.sortable && (!serverMode || serverSortEnabled));

  const goToPage = (next: number) => {
    const clamped = Math.min(Math.max(1, next), totalPages);
    if (serverMode) onPageChange?.(clamped);
    else setInternalPage(clamped);
  };

  const changePageSize = (nextSize: number) => {
    if (serverMode) {
      onPageSizeChange?.(nextSize);
      onPageChange?.(1);
      return;
    }
    setInternalPageSize(nextSize);
    setInternalPage(1);
    onPageSizeChange?.(nextSize);
  };

  const startRecord = recordCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, recordCount);

  return (
    <div
      className={`w-full flex flex-col bg-white rounded-xl border border-[#E8E8E5] overflow-hidden dark:bg-[#0B2538] dark:border-[#174261] ${className}`}
    >
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr
              className={`border-b border-[#E8E8E5] bg-[#FAFAF8] text-[11px] font-semibold text-[#04314A] tracking-[0.02em] dark:bg-[#061824] dark:border-[#174261] dark:text-[#F7F7F5] ${
                stickyHeader ? "sticky top-0 z-10" : ""
              }`}
            >
              {columns.map((col) => {
                const alignClass =
                  col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : "text-left";

                return (
                  <th
                    key={col.key}
                    style={{ width: col.width }}
                    className={`px-4 py-3 select-none ${alignClass} ${
                      sortInteractive(col)
                        ? "cursor-pointer hover:bg-[#F0F0ED] transition-colors dark:hover:bg-[#10334C]"
                        : ""
                    }`}
                    onClick={() => sortInteractive(col) && handleSort(col.key)}
                  >
                    <div
                      className={`inline-flex items-center gap-1.5 ${
                        col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : ""
                      }`}
                    >
                      <span>{col.header}</span>
                      {sortInteractive(col) && (
                        <span className="text-[#A3A39E]">
                          {sortKey === col.key ? (
                            sortDir === "asc" ? (
                              <ChevronUp size={14} className="text-[#04314A] dark:text-[#F7F7F5]" />
                            ) : (
                              <ChevronDown size={14} className="text-[#04314A] dark:text-[#F7F7F5]" />
                            )
                          ) : (
                            <ChevronsUpDown size={14} />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}

              {rowActions && (
                <th className="px-4 py-3 text-right text-[11px] font-semibold w-24">Actions</th>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-[#E8E8E5] dark:divide-[#174261]">
            {loading ? (
              Array.from({ length: Math.min(pageSize, 5) }).map((_, rIdx) => (
                <tr key={`skeleton-${rIdx}`}>
                  {columns.map((col, cIdx) => (
                    <td key={`s-col-${cIdx}`} className="px-4 py-3.5">
                      <div className="h-4 bg-[#F0F0ED] rounded max-w-[80%] dark:bg-[#10334C]" />
                    </td>
                  ))}
                  {rowActions && (
                    <td className="px-4 py-3.5 text-right">
                      <div className="h-6 w-14 bg-[#F0F0ED] rounded ml-auto dark:bg-[#10334C]" />
                    </td>
                  )}
                </tr>
              ))
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (rowActions ? 1 : 0)} className="p-8 text-center">
                  {emptyState || (
                    <EmptyState
                      title={emptyTitle}
                      description={emptyDescription}
                      action={emptyAction}
                      className="border-0 shadow-none p-0"
                    />
                  )}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rIdx) => (
                <tr
                  key={String(keyExtractor(row, rIdx))}
                  onClick={() => onRowClick && onRowClick(row)}
                  className={`transition-colors hover:bg-[#FAFAF8] dark:hover:bg-[#10334C] ${
                    onRowClick ? "cursor-pointer" : ""
                  }`}
                >
                  {columns.map((col) => {
                    const alignClass =
                      col.align === "center"
                        ? "text-center"
                        : col.align === "right"
                          ? "text-right"
                          : "text-left";

                    return (
                      <td
                        key={col.key}
                        className={`px-4 py-3 text-[12px] text-[#04314A] dark:text-[#F7F7F5] ${alignClass}`}
                      >
                        {col.render
                          ? col.render(row, rIdx)
                          : row[col.key] != null
                            ? String(row[col.key])
                            : "-"}
                      </td>
                    );
                  })}

                  {rowActions && (
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">{rowActions(row, rIdx)}</div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showPagination && !loading && recordCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-[#E8E8E5] bg-[#FAFAF8] text-[11px] text-[#737373] dark:bg-[#061824] dark:border-[#174261] dark:text-[#94A3B8]">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              Showing <strong className="text-[#04314A] dark:text-[#F7F7F5]">{startRecord}</strong> to{" "}
              <strong className="text-[#04314A] dark:text-[#F7F7F5]">{endRecord}</strong> of{" "}
              <strong className="text-[#04314A] dark:text-[#F7F7F5]">{recordCount}</strong> records
            </div>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-[#737373]">
              <span className="whitespace-nowrap">Rows per page</span>
              <select
                value={pageSize}
                onChange={(event) => changePageSize(Number(event.target.value))}
                className="h-8 rounded-lg border border-[#E8E8E5] bg-white px-2 text-[11px] font-medium text-[#04314A] focus:outline-none focus:ring-1 focus:ring-[#00AAEB] dark:border-[#174261] dark:bg-[#0B2538] dark:text-[#F7F7F5]"
                aria-label="Rows per page"
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
              aria-label="Previous page"
              leftIcon={<ChevronLeft size={14} />}
            >
              Previous
            </Button>

            <span className="min-w-[5.5rem] text-center text-[11px] font-medium tabular-nums text-[#04314A] dark:text-[#F7F7F5]">
              Page {currentPage} of {totalPages}
            </span>

            <Button
              variant="secondary"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => goToPage(currentPage + 1)}
              aria-label="Next page"
              rightIcon={<ChevronRight size={14} />}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
