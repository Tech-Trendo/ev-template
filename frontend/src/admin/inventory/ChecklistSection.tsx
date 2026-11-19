import { Camera, X } from "lucide-react";
import type { ChecklistItem, CheckResult } from "@/lib/inventory";

export type CheckValue = {
  result: CheckResult;
  remark: string;
  /** Newly selected file (pending upload) */
  photoFile?: File | null;
  photoPreview?: string;
  /** Existing server photo URL */
  photoUrl?: string;
};

const RESULT_STYLES: Record<CheckResult, string> = {
  OK: "bg-[#0B3D2B] text-white border-[#0B3D2B]",
  NOT_OK: "bg-[#8B0000] text-white border-[#8B0000]",
  NA: "bg-white text-[#737373] border-[#E8E8E5]",
};

const RESULT_LABELS: Record<CheckResult, string> = {
  OK: "OK",
  NOT_OK: "Not OK",
  NA: "N/A",
};

function splitColumns<T>(items: T[]): [T[], T[]] {
  const mid = Math.ceil(items.length / 2);
  return [items.slice(0, mid), items.slice(mid)];
}

function groupBySection(items: ChecklistItem[]) {
  const order: string[] = [];
  const map = new Map<string, ChecklistItem[]>();
  for (const item of items) {
    if (!map.has(item.section)) {
      order.push(item.section);
      map.set(item.section, []);
    }
    map.get(item.section)!.push(item);
  }
  return order.map((section) => ({ section, items: map.get(section)! }));
}

function groupBySub(items: ChecklistItem[]) {
  const order: (string | null)[] = [];
  const map = new Map<string, ChecklistItem[]>();
  for (const item of items) {
    const key = item.sub_section || "";
    if (!map.has(key)) {
      order.push(item.sub_section);
      map.set(key, []);
    }
    map.get(key)!.push(item);
  }
  return order.map((sub) => ({ sub, items: map.get(sub || "")! }));
}

export function sectionTitle(section: string, sub: string | null, labels: Record<string, string>): string {
  if (sub === "INTERIOR_CLEANLINESS") return "Interior Cleanliness";
  if (sub === "EXTERIOR_BODY_PARTS") return "Exterior Body Parts";
  return labels[section] ?? section.replace(/_/g, " ");
}

function ItemCard({
  item,
  index,
  value,
  onChange,
  readOnly,
}: {
  item: ChecklistItem;
  index: number;
  value: CheckValue;
  onChange?: (itemId: number, value: CheckValue) => void;
  readOnly?: boolean;
}) {
  const photoSrc = value.photoPreview ?? value.photoUrl ?? "";
  return (
    <div
      className={`border rounded-xl p-3 transition-colors ${
        !readOnly
          ? value.result === "NOT_OK"
            ? "border-[#8B0000]/40 bg-[#8B0000]/[0.02]"
            : "border-[#E8E8E5] bg-white"
          : value.result === "NOT_OK"
            ? "border-[#8B0000]/40 bg-[#8B0000]/[0.03]"
            : value.result === "OK"
              ? "border-[#10B981]/30 bg-[#10B981]/[0.02]"
              : "border-[#E8E8E5] bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-semibold text-[#0B3D2B] leading-snug">
          <span className="text-[#B0B0AA] font-medium mr-1.5">{index}.</span>
          {item.label}
        </span>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        {(["OK", "NOT_OK", "NA"] as CheckResult[]).map((r) => (
          <button
            key={r}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(item.id, { ...value, result: r })}
            className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all ${
              RESULT_STYLES[value.result === r ? r : "NA"]
            } ${value.result === r ? "" : "opacity-70 hover:opacity-100"} ${
              readOnly ? "cursor-default" : "cursor-pointer"
            }`}
          >
            {RESULT_LABELS[r]}
          </button>
        ))}
        {!readOnly && (
          <label
            className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-[#10B981] hover:text-[#0B3D2B] cursor-pointer transition-colors"
            title="Attach defect photo"
          >
            <Camera size={14} />
            {photoSrc ? "Change" : "Photo"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f) {
                  onChange?.(item.id, {
                    ...value,
                    photoFile: f,
                    photoPreview: URL.createObjectURL(f),
                  });
                }
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      {photoSrc && (
        <div className="mt-2 relative inline-block">
          <img
            src={photoSrc}
            alt=""
            className="h-16 w-24 object-cover rounded-lg border border-[#E8E8E5]"
          />
          {!readOnly && value.photoFile && (
            <button
              type="button"
              onClick={() =>
                onChange?.(item.id, {
                  ...value,
                  photoFile: null,
                  photoPreview: undefined,
                })
              }
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[#8B0000] text-white flex items-center justify-center"
              title="Remove photo"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}
      {!readOnly ? (
        (value.result === "NOT_OK" || value.remark) && (
          <input
            value={value.remark}
            onChange={(e) => onChange?.(item.id, { ...value, remark: e.target.value })}
            placeholder={value.result === "NOT_OK" ? "Describe the defect… (required)" : "Remark (optional)…"}
            className="mt-2 w-full border border-[#E8E8E5] rounded-lg bg-white px-2.5 py-1.5 text-[12px] text-[#0B3D2B] placeholder:text-[#B0B0AA] focus:outline-none focus:border-[#10B981]"
          />
        )
      ) : (
        value.remark && (
          <p className="mt-2 text-[12px] text-[#737373] italic leading-relaxed">
            “{value.remark}”
          </p>
        )
      )}
    </div>
  );
}

function ColumnList({
  items,
  startIndex,
  values,
  onChange,
  readOnly,
}: {
  items: ChecklistItem[];
  startIndex: number;
  values: Record<number, CheckValue>;
  onChange?: (itemId: number, value: CheckValue) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <ItemCard
          key={item.id}
          item={item}
          index={startIndex + i}
          value={values[item.id] ?? { result: "NA", remark: "" }}
          onChange={onChange}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

export default function ChecklistSection({
  items,
  sectionLabels,
  values,
  onChange,
  readOnly,
}: {
  items: ChecklistItem[];
  sectionLabels: Record<string, string>;
  values: Record<number, CheckValue>;
  onChange?: (itemId: number, value: CheckValue) => void;
  readOnly?: boolean;
}) {
  const sections = groupBySection(items);

  return (
    <div className="space-y-8">
      {sections.map(({ section, items: sectionItems }) => {
        const subs = groupBySub(sectionItems);
        const hasSubs = subs.some((s) => s.sub);

        return (
          <div key={section}>
            <h4 className="text-center text-[12px] font-bold tracking-[0.18em] uppercase text-[#0B3D2B] mb-4 py-2 border-y border-[#E8E8E5] bg-[#FAFAF8]">
              {sectionLabels[section] ?? section.replace(/_/g, " ")}
            </h4>

            {hasSubs ? (
              <div className="grid md:grid-cols-2 gap-6">
                {subs.map(({ sub, items: subItems }, colIdx) => {
                  const start =
                    1 +
                    subs.slice(0, colIdx).reduce((n, s) => n + s.items.length, 0);
                  return (
                    <div key={sub ?? "none"}>
                      <p className="text-center text-[10px] font-bold tracking-[0.14em] uppercase text-[#0B3D2B] mb-3">
                        {sectionTitle(section, sub, sectionLabels)}
                      </p>
                      <ColumnList
                        items={subItems}
                        startIndex={start}
                        values={values}
                        onChange={onChange}
                        readOnly={readOnly}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              (() => {
                const [left, right] = splitColumns(sectionItems);
                return (
                  <div className="grid md:grid-cols-2 gap-6">
                    <ColumnList
                      items={left}
                      startIndex={1}
                      values={values}
                      onChange={onChange}
                      readOnly={readOnly}
                    />
                    <ColumnList
                      items={right}
                      startIndex={left.length + 1}
                      values={values}
                      onChange={onChange}
                      readOnly={readOnly}
                    />
                  </div>
                );
              })()
            )}
          </div>
        );
      })}
    </div>
  );
}
