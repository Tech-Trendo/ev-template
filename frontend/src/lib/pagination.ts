/** Shared list pagination defaults for admin tables. */

export const PAGE_SIZE_OPTIONS = [10, 15, 20, 40, 60, 100] as const;

export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

// number (not PageSizeOption) so useState(DEFAULT_PAGE_SIZE) accepts onPageSizeChange(number)
export const DEFAULT_PAGE_SIZE: number = 10;

export type PagedResponse<T> = {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: T[];
};

export function isPagedResponse<T>(value: unknown): value is PagedResponse<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as PagedResponse<T>).results) &&
    typeof (value as PagedResponse<T>).count === "number"
  );
}
