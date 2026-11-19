"use client";

import { useEffect, useRef, useState } from "react";
import {
  Search,
  Building2,
  Car,
  Wrench,
  UserPlus,
  FileText,
  Store,
  CalendarDays,
  Clock,
  Loader2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";

export interface SearchResultItem {
  id: string | number;
  type: "customer" | "unit" | "service_record" | "lead" | "quotation" | "dealer" | "event";
  title: string;
  subtitle: string;
  badge?: string;
  target: string;
}

interface SearchResponse {
  query: string;
  total: number;
  results: SearchResultItem[];
  groups: {
    customers: SearchResultItem[];
    units: SearchResultItem[];
    service_records: SearchResultItem[];
    leads: SearchResultItem[];
    quotations: SearchResultItem[];
    dealers: SearchResultItem[];
    events: SearchResultItem[];
  };
}

const TYPE_CONFIG: Record<
  SearchResultItem["type"],
  { label: string; icon: typeof Building2; badgeBg: string }
> = {
  customer: { label: "Customers", icon: Building2, badgeBg: "bg-[#0B3D2B] text-white" },
  unit: { label: "Vehicle Units", icon: Car, badgeBg: "bg-[#10B981] text-white" },
  service_record: { label: "Servicing", icon: Wrench, badgeBg: "bg-[#737373] text-white" },
  lead: { label: "Leads", icon: UserPlus, badgeBg: "bg-[#0B3D2B] text-white" },
  quotation: { label: "Quotations", icon: FileText, badgeBg: "bg-[#0B3D2B] text-white" },
  dealer: { label: "Dealers", icon: Store, badgeBg: "bg-[#737373] text-white" },
  event: { label: "Events", icon: CalendarDays, badgeBg: "bg-[#10B981] text-white" },
};

export default function GlobalSearch({
  onNavigate,
}: {
  onNavigate: (target: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [recentSearches, setRecentSearches] = useState<SearchResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load recent searches on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("vt_admin_recent_searches");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setRecentSearches(parsed);
      }
    } catch {
      // LocalStorage unavailable
    }
  }, []);

  const saveRecent = (item: SearchResultItem) => {
    try {
      const updated = [item, ...recentSearches.filter((x) => x.target !== item.target)].slice(0, 5);
      setRecentSearches(updated);
      localStorage.setItem("vt_admin_recent_searches", JSON.stringify(updated));
    } catch {
      // LocalStorage quota or blocked
    }
  };

  const clearRecent = () => {
    try {
      localStorage.removeItem("vt_admin_recent_searches");
      setRecentSearches([]);
    } catch {
      // LocalStorage blocked
    }
  };

  // Keyboard shortcut listener (/ or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInput = activeTag === "input" || activeTag === "textarea" || activeTag === "select";

      if ((e.key === "/" && !isInput) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      api<SearchResponse>(`/api/search/?q=${encodeURIComponent(trimmed)}`)
        .then((data) => {
          setResults(data.results || []);
          setSelectedIndex(0);
        })
        .catch(() => {
          setResults([]);
        })
        .finally(() => {
          setLoading(false);
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (item: SearchResultItem) => {
    saveRecent(item);
    setOpen(false);
    setQuery("");
    onNavigate(item.target);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length ? (prev + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-lg">
      <div className="relative flex items-center">
        <div className="absolute left-3 text-[#737373] pointer-events-none">
          {loading ? (
            <Loader2 size={15} className="animate-spin text-[#10B981]" />
          ) : (
            <Search size={15} />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search customer, VIN, VRO, lead, quote, dealer..."
          className="w-full h-9 pl-9 pr-14 bg-[#F7F7F5] hover:bg-white focus:bg-white border border-[#E8E8E5] focus:border-[#10B981] rounded-lg text-[13px] text-[#0B3D2B] placeholder-[#737373] outline-none transition-colors"
        />
        {query ? (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 p-0.5 text-[#737373] hover:text-[#0B3D2B] transition-colors"
            title="Clear search"
          >
            <X size={14} />
          </button>
        ) : (
          <div className="absolute right-2.5 pointer-events-none flex items-center gap-1">
            <kbd className="h-5 px-1.5 flex items-center justify-center rounded bg-white border border-[#E8E8E5] text-[10px] font-semibold text-[#737373] shadow-xs">
              /
            </kbd>
          </div>
        )}
      </div>

      {/* Recent Searches dropdown when query is empty */}
      {open && query.trim().length === 0 && recentSearches.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-[#E8E8E5] rounded-xl shadow-lg z-50 overflow-hidden max-h-[360px] flex flex-col">
          <div className="px-4 py-2 bg-[#FAFAF8] border-b border-[#E8E8E5] flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#737373] flex items-center gap-1.5">
              <Clock size={12} className="text-[#10B981]" /> Recent Searches
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearRecent();
              }}
              className="text-[10px] font-semibold text-[#737373] hover:text-[#0B3D2B]"
            >
              Clear
            </button>
          </div>
          <div className="overflow-y-auto divide-y divide-[#F0F0ED]">
            {recentSearches.map((item, idx) => {
              const config = TYPE_CONFIG[item.type] || {
                label: "Item",
                icon: FileText,
                badgeBg: "bg-[#F0F0ED] text-[#0B3D2B]",
              };
              const IconComponent = config.icon;

              return (
                <button
                  key={`recent-${item.type}-${item.id}-${idx}`}
                  onClick={() => handleSelect(item)}
                  className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-[#FAFAF8] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-3">
                    <div className="w-7 h-7 rounded-md bg-[#F0F0ED] text-[#0B3D2B] flex items-center justify-center flex-shrink-0">
                      <IconComponent size={14} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-[#0B3D2B] truncate">
                          {item.title}
                        </span>
                        <span className="text-[9px] font-bold tracking-[0.08em] uppercase px-1.5 py-0.5 rounded bg-[#F0F0ED] text-[#737373]">
                          {config.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#737373] truncate mt-0.5">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  {item.badge && (
                    <span className="text-[10px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 rounded bg-[#FAFAF8] border border-[#E8E8E5] text-[#0B3D2B] flex-shrink-0">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Search results dropdown panel */}
      {open && query.trim().length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-[#E8E8E5] rounded-xl shadow-lg z-50 overflow-hidden max-h-[420px] flex flex-col">
          {loading && results.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-[#737373] flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin text-[#10B981]" /> Searching records...
            </div>
          ) : results.length === 0 ? (
            <div className="py-8 text-center px-4">
              <p className="text-[13px] font-semibold text-[#0B3D2B]">No records found</p>
              <p className="text-[11px] text-[#737373] mt-1">
                No matching customer, vehicle, VRO, lead, or quotation for &ldquo;{query}&rdquo;.
              </p>
            </div>
          ) : (
            <div className="overflow-y-auto divide-y divide-[#F0F0ED]">
              {results.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const config = TYPE_CONFIG[item.type] || {
                  label: "Item",
                  icon: FileText,
                  badgeBg: "bg-[#F0F0ED] text-[#0B3D2B]",
                };
                const IconComponent = config.icon;

                return (
                  <button
                    key={`${item.type}-${item.id}-${idx}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full px-4 py-2.5 flex items-center justify-between text-left transition-colors ${
                      isSelected ? "bg-[#F7F7F5]" : "hover:bg-[#FAFAF8]"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-3">
                      <div className="w-7 h-7 rounded-md bg-[#F0F0ED] text-[#0B3D2B] flex items-center justify-center flex-shrink-0">
                        <IconComponent size={14} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-bold text-[#0B3D2B] truncate">
                            {item.title}
                          </span>
                          <span className="text-[9px] font-bold tracking-[0.08em] uppercase px-1.5 py-0.5 rounded bg-[#F0F0ED] text-[#737373]">
                            {config.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#737373] truncate mt-0.5">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>
                    {item.badge && (
                      <span className="text-[10px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 rounded bg-[#FAFAF8] border border-[#E8E8E5] text-[#0B3D2B] flex-shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {results.length > 0 && (
            <div className="px-4 py-2 bg-[#FAFAF8] border-t border-[#E8E8E5] flex items-center justify-between text-[11px] text-[#737373]">
              <span>
                Found {results.length} result{results.length > 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-2">
                <span>Navigate: &uarr; &darr;</span>
                <span>Select: Enter</span>
                <span>Close: Esc</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
