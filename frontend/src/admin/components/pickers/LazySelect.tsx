"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Search, X, Loader2, ChevronDown, Check } from "lucide-react";

export interface LazySelectProps<T> {
  value: string | number | null | undefined;
  onChange: (value: string | number | null, item: T | null) => void;
  fetchPage: (
    query: string,
    page: number,
    pageSize: number
  ) => Promise<{ results: T[]; totalPages?: number; count?: number }>;
  fetchById?: (id: string | number) => Promise<T | null>;
  getItemId: (item: T) => string | number;
  getItemLabel: (item: T) => string;
  renderItem?: (item: T, isSelected: boolean) => React.ReactNode;
  renderSelected?: (item: T) => React.ReactNode;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  allowClear?: boolean;
  pageSize?: number;
  emptyMessage?: string;
  headerAction?: React.ReactNode;
  /** Hide the in-dropdown search field (still supports paginated scroll). */
  hideSearch?: boolean;
  /** Compact trigger height for toolbars / filter rows. */
  compact?: boolean;
}

export function LazySelect<T>({
  value,
  onChange,
  fetchPage,
  fetchById,
  getItemId,
  getItemLabel,
  renderItem,
  renderSelected,
  label,
  placeholder = "Select an option...",
  searchPlaceholder = "Search...",
  required = false,
  error,
  disabled = false,
  allowClear = true,
  pageSize = 10,
  emptyMessage = "No items found.",
  headerAction,
  hideSearch = false,
  compact = false,
}: LazySelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<T[]>([]);
  const [selected, setSelected] = useState<T | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load single entity if value is set but selected is null
  useEffect(() => {
    let active = true;
    if (value !== null && value !== undefined && value !== "") {
      const stringId = String(value);
      if (selected && String(getItemId(selected)) === stringId) {
        return;
      }
      const existing = options.find((opt) => String(getItemId(opt)) === stringId);
      if (existing) {
        setSelected(existing);
        return;
      }
      if (fetchById) {
        fetchById(value).then((res) => {
          if (active && res) {
            setSelected(res);
          }
        }).catch(() => {});
      }
    } else {
      setSelected(null);
    }
    return () => {
      active = false;
    };
  }, [value, selected, options, fetchById, getItemId]);

  // Load initial page of options
  const loadInitial = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const res = await fetchPage(q, 1, pageSize);
        setOptions(res.results || []);
        setPage(1);
        const tp = res.totalPages ?? Math.max(1, Math.ceil((res.count || res.results.length) / pageSize));
        setTotalPages(tp);
        setTotalCount(res.count ?? res.results.length);
      } catch {
        setOptions([]);
        setTotalPages(1);
        setTotalCount(0);
      } finally {
        setLoading(false);
      }
    },
    [fetchPage, pageSize]
  );

  // Load next page on scroll
  const loadNextPage = useCallback(async () => {
    if (loading || loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const res = await fetchPage(query, nextPage, pageSize);
      setOptions((prev) => {
        const seen = new Set(prev.map((item) => String(getItemId(item))));
        const newItems = (res.results || []).filter(
          (item) => !seen.has(String(getItemId(item)))
        );
        return [...prev, ...newItems];
      });
      setPage(nextPage);
      if (res.totalPages !== undefined) setTotalPages(res.totalPages);
    } catch {
      // keep existing
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, page, totalPages, fetchPage, query, pageSize, getItemId]);

  // Handle open dropdown
  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
    setQuery("");
    loadInitial("");
    if (!hideSearch) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Debounced search when query changes (skipped when search UI is hidden)
  useEffect(() => {
    if (!isOpen || hideSearch) return;
    const t = setTimeout(() => {
      loadInitial(query.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [query, isOpen, hideSearch, loadInitial]);

  // Infinite scroll trigger
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 32) {
      loadNextPage();
    }
  };

  const handleSelect = (item: T) => {
    setSelected(item);
    onChange(getItemId(item), item);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(null);
    onChange(null, null);
  };

  return (
    <div className="relative flex flex-col gap-1.5" ref={containerRef}>
      {label && (
        <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-[#737373]">
          {label}
          {required && <span className="text-[#00AAEB]"> *</span>}
        </label>
      )}

      {/* Trigger Button */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleOpen();
          }
        }}
        className={`w-full ${compact ? "h-9 px-3 rounded-lg" : "h-[42px] px-3.5 rounded-xl"} bg-white border text-left flex items-center justify-between gap-2 transition-colors cursor-pointer select-none ${
          disabled
            ? "bg-[#FAFAF8] text-[#A0A09C] border-[#E8E8E5] cursor-not-allowed"
            : isOpen
            ? "border-[#00AAEB] ring-1 ring-[#00AAEB]"
            : error
            ? "border-[#D9383A]"
            : "border-[#E8E8E5] hover:border-[#00AAEB]"
        }`}
      >
        <div className="flex-1 min-w-0 overflow-hidden">
          {selected ? (
            renderSelected ? (
              renderSelected(selected)
            ) : (
              <span
                className={`${compact ? "text-[12px]" : "text-[13px]"} font-medium text-[#04314A] truncate block whitespace-nowrap`}
              >
                {getItemLabel(selected)}
              </span>
            )
          ) : (
            <span
              className={`${compact ? "text-[12px]" : "text-[13px]"} text-[#A0A09C] truncate block whitespace-nowrap`}
            >
              {placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {selected && allowClear && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded text-[#737373] hover:text-[#04314A] hover:bg-[#F0F0ED] transition-colors"
              title="Clear selection"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown
            size={16}
            className={`text-[#737373] transition-transform ${isOpen ? "rotate-180 text-[#00AAEB]" : ""}`}
          />
        </div>
      </div>

      {error && <span className="text-[11px] text-[#D9383A]">{error}</span>}

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-40 mt-1.5 bg-white border border-[#E8E8E5] rounded-xl shadow-lg overflow-hidden flex flex-col max-h-80 animate-in fade-in-50 duration-100">
          {/* Header & optional Search */}
          {(headerAction || !hideSearch) && (
            <div className="p-2.5 border-b border-[#E8E8E5] bg-[#FAFAF8] flex flex-col gap-2 shrink-0">
              {headerAction && (
                <div className="flex justify-between items-center px-1">
                  <span className="text-[11px] font-semibold text-[#737373]">
                    {totalCount !== null ? `${totalCount} available` : "Select item"}
                  </span>
                  {headerAction}
                </div>
              )}
              {!hideSearch && (
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#737373] pointer-events-none"
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full pl-8 pr-7 py-1.5 bg-white border border-[#E8E8E5] rounded-lg text-[12px] text-[#04314A] placeholder:text-[#A0A09C] focus:outline-none focus:border-[#00AAEB]"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#737373] hover:text-[#04314A]"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* List Options with Infinite Scroll */}
          <div
            ref={listRef}
            onScroll={handleScroll}
            className="overflow-y-auto flex-1 divide-y divide-[#F0F0ED] min-h-[120px] max-h-56"
          >
            {loading ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-[12px] text-[#737373]">
                <Loader2 size={16} className="animate-spin text-[#00AAEB]" />
                <span>Loading options...</span>
              </div>
            ) : options.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-[#737373]">
                {emptyMessage}
              </div>
            ) : (
              <>
                {options.map((item) => {
                  const itemId = getItemId(item);
                  const isSelected = selected ? String(getItemId(selected)) === String(itemId) : false;
                  return (
                    <div
                      key={String(itemId)}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(item)}
                      className={`px-3.5 py-2.5 cursor-pointer flex items-center justify-between gap-3 text-left transition-colors ${
                        isSelected
                          ? "bg-[#F7FCFE] border-l-2 border-[#00AAEB]"
                          : "hover:bg-[#FAFAF8]"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        {renderItem ? renderItem(item, isSelected) : (
                          <span
                            className={`text-[12px] block truncate ${
                              isSelected ? "font-bold text-[#04314A]" : "text-[#04314A]"
                            }`}
                          >
                            {getItemLabel(item)}
                          </span>
                        )}
                      </div>
                      {isSelected && (
                        <Check size={14} className="text-[#00AAEB] shrink-0" />
                      )}
                    </div>
                  );
                })}

                {/* Bottom Sentinel / Loading More */}
                {loadingMore && (
                  <div className="py-3 flex items-center justify-center gap-2 text-[11px] text-[#737373] bg-[#FAFAF8]">
                    <Loader2 size={13} className="animate-spin text-[#00AAEB]" />
                    <span>Loading more items...</span>
                  </div>
                )}
                {!loadingMore && page < totalPages && (
                  <div className="py-2 text-center text-[10px] text-[#A0A09C] uppercase tracking-[0.06em]">
                    Scroll for more (page {page} of {totalPages})
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
