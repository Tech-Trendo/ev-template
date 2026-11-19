import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Camera, Save, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAuth } from "../AuthContext";
import {
  createConditionReport,
  fetchActiveChecklist,
  fetchUnit,
  REPORT_TYPES,
  uploadConditionPhotos,
  uploadConditionResultPhoto,
  type ChecklistTemplate,
  type OverallRating,
  type ReportType,
  type UnitDetail,
} from "@/lib/inventory";
import { Field, inputCls, SelectField, useToast } from "../crm/ui";
import ChecklistSection, { type CheckValue } from "./ChecklistSection";

const GALLERY_PRESETS = ["Front", "Back", "Left", "Right", "Interior", "Odometer"];

export default function ConditionForm({
  unitId,
  onNavigate,
}: {
  unitId: string;
  onNavigate: (p: string) => void;
}) {
  const { me } = useAuth();
  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [reportType, setReportType] = useState<ReportType>("PRE_DELIVERY");
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [odometer, setOdometer] = useState("");
  const [rating, setRating] = useState<OverallRating | "">("");
  const [inspectedBy, setInspectedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [values, setValues] = useState<Record<number, CheckValue>>({});
  const [gallery, setGallery] = useState<{ file: File; preview: string; caption: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchUnit(unitId), fetchActiveChecklist()])
      .then(([u, t]) => {
        setUnit(u);
        setTemplate(t);
        const initial: Record<number, CheckValue> = {};
        t.items.forEach((item) => {
          initial[item.id] = { result: "NA", remark: "" };
        });
        setValues(initial);
        setOdometer(String(u.odometer_km));
        setInspectedBy(
          me && (me.first_name || me.last_name)
            ? `${me.first_name} ${me.last_name}`.trim()
            : (me?.username ?? ""),
        );
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Load failed"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  const stats = useMemo(() => {
    const vals = Object.values(values);
    return {
      notOk: vals.filter((v) => v.result === "NOT_OK").length,
      ok: vals.filter((v) => v.result === "OK").length,
      na: vals.filter((v) => v.result === "NA").length,
    };
  }, [values]);

  const markAllOk = () => {
    if (!template) return;
    const next: Record<number, CheckValue> = {};
    template.items.forEach((item) => {
      const prev = values[item.id];
      next[item.id] = {
        result: "OK",
        remark: prev?.remark ?? "",
        photoFile: prev?.photoFile,
        photoPreview: prev?.photoPreview,
        photoUrl: prev?.photoUrl,
      };
    });
    setValues(next);
    if (!rating) setRating("VERY_GOOD");
    toast.push("All condition checklist items marked as OK");
  };

  const save = async () => {
    if (!unit || !template) return;
    if (!inspectedBy.trim()) {
      setError("Inspected By is required.");
      return;
    }
    const missingRemark = template.items.find(
      (i) => values[i.id]?.result === "NOT_OK" && !values[i.id]?.remark.trim(),
    );
    if (missingRemark) {
      setError(`Add a remark for “${missingRemark.label}”.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const report = await createConditionReport({
        vehicle: unit.id,
        template: template.id,
        report_type: reportType,
        report_date: reportDate,
        odometer_km: Number(odometer) || 0,
        overall_rating: rating || null,
        inspected_by: inspectedBy,
        notes,
        results_write: Object.entries(values).map(([item, v]) => ({
          item: Number(item),
          result: v.result,
          remark: v.remark,
        })),
      });
      // Row photos.
      for (const [itemId, v] of Object.entries(values)) {
        if (v.photoFile) {
          try {
            await uploadConditionResultPhoto(report.id, Number(itemId), v.photoFile);
          } catch {
            // Non-fatal — report itself is saved.
          }
        }
      }
      // Gallery photos.
      if (gallery.length) {
        try {
          await uploadConditionPhotos(
            report.id,
            gallery.map((g) => g.file),
            gallery.map((g) => g.caption),
          );
        } catch {
          // Non-fatal.
        }
      }
      toast.push("Condition report saved");
      onNavigate(`units/${unit.id}/reports/${report.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !unit || !template) {
    return (
      <div className="py-24 text-center text-[13px] text-[#737373]">
        {error ? (
          <>
            <p className="font-bold text-[#0B3D2B] mb-2">Couldn&apos;t load form</p>
            <p className="mb-4">{error}</p>
            <button
              onClick={() => onNavigate(`units/${unitId}`)}
              className="px-6 py-3 rounded-full bg-[#0B3D2B] text-white text-[12px] font-semibold"
            >
              Back to Unit
            </button>
          </>
        ) : (
          "Loading condition report form…"
        )}
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <button
        onClick={() => onNavigate(`units/${unit.id}`)}
        className="flex items-center gap-1.5 text-[12px] font-semibold text-[#737373] hover:text-[#10B981] transition-colors mb-4"
      >
        <ArrowLeft size={14} /> Back to Unit
      </button>

      <div className="bg-white border border-[#E8E8E5] rounded-2xl p-5 sm:p-7">
        <div className="text-center mb-6">
          <p className="text-[11px] font-bold tracking-[0.22em] uppercase text-[#10B981] mb-1">
            Vehicle Full Condition Report
          </p>
          <h1 className="text-[22px] sm:text-[28px] font-black tracking-tight text-[#0B3D2B]">
            {unit.vin_chassis_no}
          </h1>
          <p className="text-[12px] text-[#737373] mt-1">
            {unit.model_detail.brand} {unit.model_detail.model_name} · Template v{template.version_no} ·{" "}
            <span className="font-bold text-[#0B3D2B]">{stats.ok} OK</span> ·{" "}
            <span className="font-bold text-[#737373]">{stats.notOk} Not OK</span>
          </p>
        </div>

        {error && (
          <p className="mb-4 text-[13px] text-[#10B981] bg-[#10B981]/5 border-l-2 border-[#10B981] px-3 py-2">
            {error}
          </p>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          <Field label="Report Type" required>
            <SelectField
              value={reportType}
              onChange={(v) => setReportType(v as ReportType)}
              options={REPORT_TYPES.map((r) => ({ value: r.value, label: r.label }))}
            />
          </Field>
          <Field label="Report Date">
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Odometer (KM)">
            <input value={odometer} onChange={(e) => setOdometer(e.target.value)} inputMode="numeric" className={inputCls} />
          </Field>
          <Field label="Inspected By" required>
            <input value={inspectedBy} onChange={(e) => setInspectedBy(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Overall Rating">
            <SelectField
              value={rating}
              onChange={(v) => setRating(v as OverallRating | "")}
              options={[
                { value: "", label: "—" },
                { value: "VERY_GOOD", label: "Very Good" },
                { value: "GOOD", label: "Good" },
                { value: "POOR", label: "Poor" },
              ]}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pt-4 border-t border-[#E8E8E5]">
          <div>
            <h3 className="text-[13px] font-bold tracking-[0.12em] uppercase text-[#0B3D2B]">
              Condition Inspection Checklist
            </h3>
            <p className="text-[11px] text-[#737373]">
              Check tools, equipment, interior/exterior condition, and electronics
            </p>
          </div>
          <button
            type="button"
            onClick={markAllOk}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0B3D2B] text-white text-[11px] font-bold uppercase tracking-wider hover:bg-[#10B981] transition-all shadow-xs"
            title="Mark all items as OK"
          >
            ⚡ Mark All OK
          </button>
        </div>

        <ChecklistSection
          items={template.items}
          sectionLabels={template.section_labels}
          values={values}
          onChange={(itemId, value) => setValues((prev) => ({ ...prev, [itemId]: value }))}
        />

        <h3 className="text-[12px] font-bold tracking-[0.12em] uppercase text-[#0B3D2B] mt-8 mb-3 pb-2 border-b border-[#E8E8E5]">
          Notes & Condition Gallery
        </h3>
        <Field label="Free-form Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Delivery condition, customer-visible damage, resale observations…"
            className={`${inputCls} resize-none`}
          />
        </Field>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">
              Gallery Photos ({gallery.length})
            </span>
            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-[#E8E8E5] rounded-full text-[11px] font-bold text-[#0B3D2B] hover:border-[#0B3D2B] cursor-pointer transition-colors">
              <Camera size={13} /> Add Photos
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) {
                    setGallery((g) => [
                      ...g,
                      ...files.map((f) => ({
                        file: f,
                        preview: URL.createObjectURL(f),
                        caption: "",
                      })),
                    ]);
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {GALLERY_PRESETS.map((preset) => (
              <span key={preset} className="text-[10px] text-[#B0B0AA]">
                {preset}
                {preset !== "Odometer" && <span className="mx-1">·</span>}
              </span>
            ))}
          </div>
          {gallery.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {gallery.map((g, i) => (
                <div key={i} className="border border-[#E8E8E5] rounded-xl overflow-hidden">
                  <div className="relative">
                    <img src={g.preview} alt="" className="aspect-[4/3] w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setGallery((list) => list.filter((_, j) => j !== i))}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-[#8B0000] text-white flex items-center justify-center"
                      title="Remove"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <input
                    value={g.caption}
                    onChange={(e) =>
                      setGallery((list) => list.map((item, j) => (j === i ? { ...item, caption: e.target.value } : item)))
                    }
                    placeholder="Caption (Front, Odo…)…"
                    className="w-full px-2.5 py-1.5 text-[11px] text-[#0B3D2B] placeholder:text-[#B0B0AA] focus:outline-none"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3 justify-end mt-6 pt-5 border-t border-[#E8E8E5]">
          <button
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#0B3D2B] text-white text-[12px] font-bold tracking-[0.06em] uppercase hover:bg-[#10B981] transition-colors disabled:opacity-50"
          >
            <Save size={14} /> {busy ? "Saving…" : "Save Report"}
          </button>
        </div>
      </div>

      {toast.node}
    </div>
  );
}
