/**
 * crm/ui.tsx — compatibility shim
 *
 * All new code should import directly from "@/components/ui".
 * This file bridges the old API so existing screens do not need to be
 * touched immediately. Gradually migrate callers and delete this file
 * once crm/ui is no longer referenced anywhere.
 */

"use client";

import React, { useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import {
  Button,
  Modal as NewModal,
  PageHeader as NewPageHeader,
  type ModalProps,
  type PageHeaderProps,
} from "@/components/ui";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/lib/pagination";

// ─── Re-export shared primitives directly ────────────────────────────────────
export {
  FormField as Field,
  Input,
  Select,
  Textarea,
  Button,
  EmptyState,
  ConfirmDialog,
} from "@/components/ui";

// ─── Backward-compat Modal (adds `wide` prop → size="lg") ─────────────────────
export function Modal({
  wide,
  ...rest
}: ModalProps & { wide?: boolean }) {
  return <NewModal {...rest} size={wide ? "lg" : rest.size ?? "md"} />;
}

// ─── Backward-compat PageHeader (adds `eyebrow` and `action` props) ──────────
export function PageHeader({
  eyebrow: _eyebrow,   // deprecated, ignored — was a decorative label
  action,
  actions,
  ...rest
}: PageHeaderProps & { eyebrow?: string; action?: React.ReactNode }) {
  return <NewPageHeader {...rest} actions={actions ?? action} />;
}

// ─── Backward-compat Badge ────────────────────────────────────────────────────
// Old API: <Badge status="new" />  (single string prop, no variant)
// New API: <Badge variant="success">...</Badge>
// This wrapper maps status strings to new variant+children form.

import { Badge as NewBadge } from "@/components/ui";

const PRIMARY_STATUSES = new Set([
  "new",
  "contacted",
  "scheduled",
  "sent",
  "viewed",
  "active",
  "converted",
  "won",
  "completed",
  "accepted",
  "ready_for_sale",
]);

const STATUS_TO_VARIANT: Record<string, "success" | "info" | "warning" | "danger" | "neutral"> = {
  new: "info",
  contacted: "info",
  scheduled: "info",
  sent: "info",
  viewed: "info",
  active: "success",
  converted: "success",
  won: "success",
  completed: "success",
  accepted: "success",
  ready_for_sale: "success",
  rejected: "danger",
  expired: "danger",
  lost: "danger",
  cancelled: "danger",
  on_hold: "warning",
};

export function Badge({ status }: { status: string }) {
  const norm = (status || "").toLowerCase();
  const variant = STATUS_TO_VARIANT[norm] ?? "neutral";
  return (
    <NewBadge variant={variant} size="sm">
      {status.replace(/_/g, " ")}
    </NewBadge>
  );
}

// ─── SelectField ─────────────────────────────────────────────────────────────
// Thin wrapper for screens that render <SelectField value onChange options />.
import { Select as NewSelect } from "@/components/ui";

export function SelectField({
  value,
  onChange,
  options,
  children,
  label,
  disabled,
}: {
  value?: string;
  onChange?: (v: string) => void;
  options?: { value: string; label: string }[];
  children?: React.ReactNode;
  label?: string;
  disabled?: boolean;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (onChange) onChange(e.target.value);
  };
  return (
    <div>
      {label && (
        <label className="block text-[10px] font-semibold tracking-[0.1em] uppercase text-[#737373] mb-1">
          {label}
        </label>
      )}
      <NewSelect value={value} onChange={handleChange} options={options} disabled={disabled}>
        {!options && children}
      </NewSelect>
    </div>
  );
}

// ─── TableState ───────────────────────────────────────────────────────────────
export function TableState({
  loading,
  empty,
  colSpan,
  error,
  onRetry,
}: {
  loading: boolean;
  empty: boolean;
  colSpan: number;
  error?: string;
  onRetry?: () => void;
}) {
  if (!loading && !empty) return null;
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-14 text-center">
        {loading ? (
          <p className="text-[13px] text-[#737373]">Loading…</p>
        ) : error ? (
          <>
            <p className="text-[13px] text-[#991B1B] mb-3">{error}</p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-4 py-2 border border-[#E8E8E5] rounded-lg text-[12px] font-semibold text-[#04314A] hover:border-[#04314A] transition-colors"
              >
                Retry
              </button>
            )}
          </>
        ) : (
          <>
            <Inbox size={22} className="mx-auto mb-3 text-[#B0B0AA]" />
            <p className="text-[13px] text-[#737373]">No records match your filters.</p>
          </>
        )}
      </td>
    </tr>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────
/** Zero-based page index (legacy CRM pages). */
export function Pagination({
  page,
  pageCount,
  onPage,
  total,
  pageSize = DEFAULT_PAGE_SIZE,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
  total: number;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: readonly number[];
}) {
  const displayPageCount = Math.max(1, pageCount);
  const startRecord = total === 0 ? 0 : page * pageSize + 1;
  const endRecord = Math.min((page + 1) * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-[#E8E8E5] bg-[#FAFAF8]">
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#737373]">
        <span>
          Showing <strong className="text-[#04314A]">{startRecord}</strong> to{" "}
          <strong className="text-[#04314A]">{endRecord}</strong> of{" "}
          <strong className="text-[#04314A]">{total}</strong> records
        </span>
        {onPageSizeChange ? (
          <label className="inline-flex items-center gap-1.5">
            <span className="whitespace-nowrap">Rows per page</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-8 rounded-lg border border-[#E8E8E5] bg-white px-2 text-[11px] font-medium text-[#04314A] focus:outline-none focus:ring-1 focus:ring-[#00AAEB]"
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 0}
          onClick={() => onPage(page - 1)}
          leftIcon={<ChevronLeft size={14} />}
          aria-label="Previous page"
        >
          Previous
        </Button>
        <span className="min-w-[5.5rem] text-center text-[11px] font-medium tabular-nums text-[#04314A]">
          Page {page + 1} of {displayPageCount}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= displayPageCount - 1}
          onClick={() => onPage(page + 1)}
          rightIcon={<ChevronRight size={14} />}
          aria-label="Next page"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// ─── useToast ─────────────────────────────────────────────────────────────────
// Old API: const toast = useToast(); toast.push("msg"); {toast.node}
// New API: const { success, error } = useToast(); (context-based, no node)
//
// This shim provides the old { push, node } surface backed by the new context.
// Components wrapped under AdminApp (which now includes ToastProvider) can use
// either API.
import { useToast as useNewToast } from "@/components/ui";

export function useToast() {
  const ctx = useNewToast();
  const push = useCallback(
    (message: string) => {
      ctx.info(message);
    },
    [ctx]
  );
  // Memoized: a fresh object identity every render retriggers any caller
  // effect that lists `toast` (or a callback built on it) as a dependency,
  // causing infinite refetch loops (e.g. HistoricalImportPage import history
  // stuck on "Loading…"). node is rendered by ToastProvider globally.
  // ponytail: stable identity only; migrate callers to "@/components/ui" and delete this shim.
  return useMemo(() => ({ push, node: null as React.ReactNode }), [push]);
}

// ─── CSS class string constants (kept for screens that use them inline) ───────
export const inputCls =
  "border border-[#E8E8E5] rounded-xl bg-white px-3 py-2.5 text-[13px] font-medium text-[#04314A] placeholder:text-[#B0B0AA] focus:outline-none focus:border-[#00AAEB] transition-colors w-full";

export const selectCls = `${inputCls} cursor-pointer appearance-none pr-9`;

export const primaryBtnCls =
  "inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#00AAEB] text-white text-[12px] font-bold tracking-[0.06em] uppercase hover:bg-[#04314A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export const ghostBtnCls =
  "inline-flex items-center gap-2 px-4 py-2.5 border border-[#E8E8E5] rounded-full text-[12px] font-semibold tracking-[0.04em] uppercase text-[#04314A] hover:border-[#04314A] transition-colors";

// ─── exportCsv ────────────────────────────────────────────────────────────────
export function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
