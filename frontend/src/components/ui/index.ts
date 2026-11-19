/**
 * EV OS Shared UI Primitives
 * 
 * Reusable components conforming strictly to UI Guidelines:
 * Poppins typography, solid color tokens, no gradients, no emojis,
 * clear hover/focus states, and accessible semantics.
 */

export * from "./Button";
export * from "./Input";
export * from "./Select";
export * from "./Textarea";
export * from "./FormField";
export * from "./DataTable";
export * from "./Modal";
export * from "./PageHeader";
export * from "./Badge";
export * from "./EmptyState";
export * from "./ConfirmDialog";
export * from "./Toast";
export { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, isPagedResponse } from "@/lib/pagination";
export type { PagedResponse, PageSizeOption } from "@/lib/pagination";
