import { useEffect, useState } from "react";
import { ArrowLeft, Printer, Camera, X, ExternalLink } from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  fetchConditionReport,
  formatDate,
  type ConditionReport,
} from "@/lib/inventory";
import { Badge } from "../crm/ui";
import { sectionTitle } from "./ChecklistSection";

export default function ConditionDetail({
  unitId,
  reportId,
  onNavigate,
}: {
  unitId: string;
  reportId: string;
  onNavigate: (p: string) => void;
}) {
  const [report, setReport] = useState<ConditionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePhoto, setActivePhoto] = useState<{
    url: string;
    title: string;
    subtitle?: string;
  } | null>(null);

  useEffect(() => {
    fetchConditionReport(reportId)
      .then(setReport)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, [reportId]);

  useEffect(() => {
    if (!activePhoto) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActivePhoto(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePhoto]);

  if (loading) {
    return <div className="py-24 text-center text-[13px] text-[#737373]">Loading report…</div>;
  }

  if (!report) {
    return (
      <div className="max-w-lg mx-auto mt-16 bg-white border border-[#E8E8E5] rounded-2xl p-8 text-center">
        <p className="text-[15px] font-bold text-[#0B3D2B] mb-2">Report not found</p>
        <p className="text-[13px] text-[#737373] mb-6">{error}</p>
        <button
          onClick={() => onNavigate(`units/${unitId}`)}
          className="px-6 py-3 rounded-full bg-[#0B3D2B] text-white text-[12px] font-semibold"
        >
          Back to Unit
        </button>
      </div>
    );
  }

  const bySection: { key: string; sub: string | null; rows: typeof report.results }[] = [];
  report.results.forEach((r) => {
    const section = r.section_snapshot || "GENERAL";
    const sub = r.sub_section_snapshot || null;
    let group = bySection.find((g) => g.key === section && g.sub === sub);
    if (!group) {
      group = { key: section, sub, rows: [] };
      bySection.push(group);
    }
    group.rows.push(r);
  });

  const sectionLabel = (key: string) => {
    const map: Record<string, string> = {
      TOOLS_AND_EQUIPMENT: "Tools & Equipment",
      FUNCTIONALITY: "Functionality",
      APPEARANCE_AND_CONDITION: "Appearance & Condition",
    };
    return map[key] ?? key.replace(/_/g, " ");
  };

  return (
    <div className="w-full pb-16">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-4">
        <button
          onClick={() => onNavigate(`units/${unitId}`)}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-[#737373] hover:text-[#10B981] transition-colors"
        >
          <ArrowLeft size={14} /> Back to Unit
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#0B3D2B] text-white text-[12px] font-bold tracking-[0.04em] uppercase hover:bg-[#10B981] transition-colors"
        >
          <Printer size={14} /> Download PDF
        </button>
      </div>

      <div className="print-area bg-white border border-[#E8E8E5] rounded-2xl p-5 sm:p-8 print:border-0 print:rounded-none">
        <div className="text-center border-b-2 border-[#0B3D2B] pb-4 mb-5">
          <p className="text-[11px] font-bold tracking-[0.24em] uppercase text-[#737373]">
            Vehicle Full Condition Report
          </p>
          <h1 className="text-[22px] sm:text-[26px] font-black tracking-tight text-[#0B3D2B] mt-1">
            {report.vehicle_vin}
          </h1>
          <div className="mt-2 flex items-center justify-center gap-3">
            <span className="text-[13px] font-bold text-[#0B3D2B]">
              {report.report_type.replace(/_/g, " ")}
            </span>
            <Badge status="completed" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-2.5 text-[12px] mb-6">
          <InfoRow label="Report Date" value={formatDate(report.report_date)} />
          <InfoRow label="Odometer" value={`${report.odometer_km} km`} />
          <InfoRow label="Inspected By" value={report.inspected_by || "-"} />
          <InfoRow
            label="Overall Rating"
            value={report.overall_rating ? report.overall_rating.replace(/_/g, " ") : "-"}
            strong
          />
          <InfoRow label="Template" value={`v${report.template_version}`} />
        </div>

        {report.notes && (
          <div className="mb-6 bg-[#FAFAF8] border border-[#E8E8E5] rounded-xl p-4">
            <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#737373] mb-1">
              Notes
            </p>
            <p className="text-[13px] text-[#0B3D2B] leading-relaxed whitespace-pre-wrap">
              {report.notes}
            </p>
          </div>
        )}

        {bySection.map((group) => (
          <div key={`${group.key}-${group.sub ?? ""}`} className="mb-5 break-inside-avoid">
            <h3 className="text-[12px] font-black tracking-[0.14em] uppercase text-white bg-[#0B3D2B] rounded-lg px-3 py-2 mb-1">
              {sectionLabel(group.key)}
              {group.sub && (
                <span className="text-[#10B981]"> · {sectionTitle(group.key, group.sub, {})}</span>
              )}
            </h3>
            <div className="grid md:grid-cols-2 gap-x-6">
              {group.rows.map((r, idx) => (
                <div
                  key={r.id}
                  className="flex items-start justify-between gap-3 py-1.5 border-b border-[#F0F0ED] text-[12px]"
                >
                  <div className="text-[#0B3D2B] font-medium leading-snug flex-1 min-w-0 pr-2">
                    <span>
                      <span className="text-[#B0B0AA] mr-1.5">{idx + 1}.</span>
                      {r.label}
                    </span>
                    {r.remark && (
                      <span className="block text-[11px] italic text-[#737373] mt-0.5">
                        Note: {r.remark}
                      </span>
                    )}
                    {r.photo_display && (
                      <div className="no-print mt-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setActivePhoto({
                              url: r.photo_display!,
                              title: r.label,
                              subtitle: r.remark || `Item ${idx + 1} inspection photo`,
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#F7F7F5] hover:bg-[#E8E8E5] text-[#0B3D2B] hover:text-[#10B981] text-[11px] font-semibold border border-[#E8E8E5] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]"
                        >
                          <Camera size={13} className="text-[#10B981]" />
                          <span>View Photo</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <span
                    className={`shrink-0 w-6 h-6 rounded-md border flex items-center justify-center text-[13px] font-black ${
                      r.result === "OK"
                        ? "border-[#0B3D2B] text-[#0B3D2B]"
                        : r.result === "NOT_OK"
                          ? "border-[#0B3D2B] text-[#0B3D2B] bg-[#F7F7F5]"
                          : "border-[#B0B0AA] text-[#B0B0AA]"
                    }`}
                  >
                    {r.result === "OK" ? "✓" : r.result === "NOT_OK" ? "✕" : "-"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {report.photos.length > 0 && (
          <div className="mt-6 break-inside-avoid">
            <h3 className="text-[12px] font-black tracking-[0.14em] uppercase text-[#0B3D2B] mb-3">
              Condition Gallery ({report.photos.length})
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {report.photos.map((p) => (
                <figure
                  key={p.id}
                  onClick={() =>
                    setActivePhoto({
                      url: p.image_display,
                      title: p.caption || "Condition Photo",
                      subtitle: report.vehicle_vin,
                    })
                  }
                  className="border border-[#E8E8E5] rounded-xl overflow-hidden cursor-pointer hover:border-[#10B981] transition-colors group bg-[#FAFAF8]"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden">
                    <img
                      src={p.image_display}
                      alt={p.caption || "Condition Photo"}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-[#0B3D2B]/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0B3D2B] text-white text-[11px] font-bold">
                        <Camera size={13} className="text-[#10B981]" />
                        <span>View Photo</span>
                      </span>
                    </div>
                  </div>
                  {p.caption && (
                    <figcaption className="px-2.5 py-1.5 text-[11px] font-medium text-[#737373]">
                      {p.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Photo Preview Modal ─────────────────────────────────────────── */}
      {activePhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo Preview"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#0B3D2B]/75"
          onClick={() => setActivePhoto(null)}
        >
          <div
            className="relative bg-white border border-[#E8E8E5] rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#E8E8E5] bg-[#FAFAF8]">
              <div className="min-w-0 pr-4">
                <p className="text-[13px] font-bold text-[#0B3D2B] truncate">
                  {activePhoto.title}
                </p>
                {activePhoto.subtitle && (
                  <p className="text-[11px] text-[#737373] truncate mt-0.5">
                    {activePhoto.subtitle}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={activePhoto.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg text-[#737373] hover:text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]"
                  title="Open original in new tab"
                >
                  <ExternalLink size={16} />
                </a>
                <button
                  type="button"
                  onClick={() => setActivePhoto(null)}
                  className="p-1.5 rounded-lg text-[#737373] hover:text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]"
                  title="Close preview (Esc)"
                  aria-label="Close photo preview"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Photo viewport */}
            <div className="flex-1 bg-[#0B3D2B]/5 flex items-center justify-center p-4 overflow-auto min-h-[280px] max-h-[70vh]">
              <img
                src={activePhoto.url}
                alt={activePhoto.title}
                className="max-h-[65vh] max-w-full object-contain rounded-lg border border-[#E8E8E5] shadow-sm select-none"
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-2.5 border-t border-[#E8E8E5] bg-white text-[11px] text-[#737373]">
              <span>VIN: {report.vehicle_vin}</span>
              <button
                type="button"
                onClick={() => setActivePhoto(null)}
                className="px-4 py-1.5 rounded bg-[#0B3D2B] text-white font-semibold text-[11px] hover:bg-[#10B981] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-dotted border-[#E8E8E5] pb-1.5">
      <span className="text-[#737373] font-medium shrink-0">{label}</span>
      <span className={`text-right ${strong ? "font-black text-[#0B3D2B]" : "font-semibold text-[#0B3D2B]"}`}>
        {value || "-"}
      </span>
    </div>
  );
}
