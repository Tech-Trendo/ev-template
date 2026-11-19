import { useState, type ReactNode } from "react";
import {
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Copy,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
} from "lucide-react";
import type { CmsListFieldDef, CmsPrimitiveFieldDef } from "./schemas";

type Json = Record<string, unknown>;

export interface CmsListFieldProps {
  field: CmsListFieldDef;
  items: Json[];
  onChange: (items: Json[]) => void;
  renderSubField: (
    subField: CmsPrimitiveFieldDef,
    value: unknown,
    onSubChange: (v: unknown) => void,
    idPrefix: string,
  ) => ReactNode;
}

function blankItem(fields: CmsPrimitiveFieldDef[]): Json {
  const item: Json = {};
  for (const f of fields) {
    item[f.key] = f.type === "number" ? 0 : "";
  }
  return item;
}

function getItemTitle(item: Json, index: number, fallback: string): string {
  if (typeof item.title === "string" && item.title.trim()) return item.title.trim();
  if (typeof item.name === "string" && item.name.trim()) return item.name.trim();
  if (typeof item.word === "string" && item.word.trim()) return item.word.trim();
  if (typeof item.label === "string" && item.label.trim()) return item.label.trim();
  if (item.value !== undefined && item.value !== "") return String(item.value);
  return `${fallback} ${index + 1}`;
}

export function CmsListField({
  field,
  items,
  onChange,
  renderSubField,
}: CmsListFieldProps) {
  const [collapsedMap, setCollapsedMap] = useState<Record<number, boolean>>({});

  const toggleCollapse = (index: number) => {
    setCollapsedMap((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const expandAll = () => setCollapsedMap({});
  const collapseAll = () => {
    const all: Record<number, boolean> = {};
    items.forEach((_, i) => {
      all[i] = true;
    });
    setCollapsedMap(all);
  };

  const addItem = () => {
    const next = [...items, blankItem(field.itemFields)];
    onChange(next);
    // Auto-open new item
    setCollapsedMap((prev) => ({ ...prev, [next.length - 1]: false }));
  };

  const duplicateItem = (index: number) => {
    const target = JSON.parse(JSON.stringify(items[index])) as Json;
    const next = [...items.slice(0, index + 1), target, ...items.slice(index + 1)];
    onChange(next);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="border border-[#E8E8E5] rounded-2xl p-4 sm:p-6 bg-[#FAFAF8] shadow-xs">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E8E8E5]/70 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#10B981]/10 text-[#10B981] flex items-center justify-center">
            <Layers size={14} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-black tracking-[0.1em] uppercase text-[#0B3D2B]">
                {field.label}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#0B3D2B]/10 text-[#0B3D2B] text-[10px] font-bold">
                {items.length} {items.length === 1 ? field.itemName : `${field.itemName}s`}
              </span>
            </div>
            {field.hint && <p className="text-[11px] text-[#737373] mt-0.5">{field.hint}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {items.length > 1 && (
            <div className="flex items-center gap-1 mr-2 text-[10px] font-semibold text-[#737373]">
              <button
                type="button"
                onClick={expandAll}
                className="hover:text-[#10B981] px-1.5 py-0.5 rounded-md hover:bg-white transition-colors"
              >
                Expand all
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={collapseAll}
                className="hover:text-[#10B981] px-1.5 py-0.5 rounded-md hover:bg-white transition-colors"
              >
                Collapse all
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#10B981] text-white text-[11px] font-bold tracking-[0.04em] uppercase hover:bg-[#0B3D2B] transition-colors shadow-xs"
          >
            <Plus size={13} /> Add {field.itemName}
          </button>
        </div>
      </div>

      {/* Items List */}
      <div className="flex flex-col gap-3">
        {items.map((item, index) => {
          const isCollapsed = !!collapsedMap[index];
          const displayTitle = getItemTitle(item, index, field.itemName);

          return (
            <div
              key={index}
              className={`border rounded-xl bg-white transition-all overflow-hidden ${
                isCollapsed
                  ? "border-[#E8E8E5] hover:border-[#10B981]/50"
                  : "border-[#10B981]/30 shadow-xs ring-1 ring-[#10B981]/10"
              }`}
            >
              {/* Item Card Header */}
              <div
                onClick={() => toggleCollapse(index)}
                className="flex items-center justify-between px-4 py-3 bg-white hover:bg-[#FAFAF8] cursor-pointer select-none transition-colors border-b border-transparent data-[open=true]:border-[#E8E8E5]"
                data-open={!isCollapsed}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-md bg-[#0B3D2B] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    {index + 1}
                  </span>
                  <div className="truncate min-w-0">
                    <span className="text-[13px] font-bold text-[#0B3D2B] truncate block">
                      {displayTitle}
                    </span>
                    {isCollapsed && typeof item.desc === "string" && item.desc.trim() !== "" && (
                      <span className="text-[11px] text-[#737373] truncate block max-w-md">
                        {item.desc}
                      </span>
                    )}
                  </div>
                </div>

                <div
                  className="flex items-center gap-1 ml-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    title="Move item up"
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[#737373] hover:bg-[#F0F0ED] hover:text-[#0B3D2B] disabled:opacity-20 transition-colors"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === items.length - 1}
                    title="Move item down"
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[#737373] hover:bg-[#F0F0ED] hover:text-[#0B3D2B] disabled:opacity-20 transition-colors"
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicateItem(index)}
                    title="Duplicate item"
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[#737373] hover:bg-[#10B981]/10 hover:text-[#10B981] transition-colors"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    title="Remove item"
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[#B85C5C] hover:bg-[#B85C5C]/10 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleCollapse(index)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[#737373] hover:bg-[#F0F0ED] transition-colors ml-1"
                  >
                    {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </button>
                </div>
              </div>

              {/* Item Card Body */}
              {!isCollapsed && (
                <div className="p-4 sm:p-5 bg-white">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {field.itemFields.map((sub) => {
                      const isFullWidth =
                        sub.type === "textarea" ||
                        sub.type === "image" ||
                        sub.key === "desc" ||
                        sub.key === "subtext";
                      return (
                        <div
                          key={sub.key}
                          className={isFullWidth ? "sm:col-span-2" : "sm:col-span-1"}
                        >
                          {renderSubField(
                            sub,
                            item[sub.key],
                            (v) => {
                              const next = [...items];
                              next[index] = { ...next[index], [sub.key]: v };
                              onChange(next);
                            },
                            `${field.key}.${index}`,
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {items.length === 0 && (
          <div className="border border-dashed border-[#E0E0DC] rounded-xl p-8 text-center bg-white">
            <div className="w-10 h-10 rounded-full bg-[#10B981]/10 text-[#10B981] flex items-center justify-center mx-auto mb-2">
              <Sparkles size={18} />
            </div>
            <p className="text-[13px] font-bold text-[#0B3D2B]">No {field.itemName.toLowerCase()}s configured</p>
            <p className="text-[11px] text-[#737373] mt-1 mb-4">
              Click the button below to add your first {field.itemName.toLowerCase()}.
            </p>
            <button
              type="button"
              onClick={addItem}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#10B981] text-white text-[12px] font-bold tracking-[0.04em] uppercase hover:bg-[#0B3D2B] transition-colors"
            >
              <Plus size={14} /> Add {field.itemName}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
