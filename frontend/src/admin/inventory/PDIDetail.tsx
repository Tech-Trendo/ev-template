import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Lock,
  Printer,
  RotateCcw,
  Unlock,
  X,
  AlertTriangle,
  Image as ImageIcon,
  Truck,
  Upload,
  Camera,
  Trash2,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAuth } from "../AuthContext";
import {
  approvePdi,
  fetchPdi,
  formatDate,
  lockPdi,
  recordPrintPdi,
  rejectPdi,
  reopenPdi,
  uploadInspectionGeneralPhoto,
  resolveInspectionIssue,
  uploadPdiResultPhoto,
  clearPdiResultPhoto,
  type PdiInspection,
  type PdiResult,
  type InspectionIssue,
  type InspectionPhoto,
} from "@/lib/inventory";
import { Field, inputCls, Modal, useToast } from "../crm/ui";
import { PrintFooter, logPrintEvent } from "@/components/PrintFooter";
import { Badge } from "@/components/ui";

export default function PDIDetail({
  unitId,
  pdiId,
  onNavigate,
}: {
  unitId: string;
  pdiId: string;
  onNavigate: (p: string) => void;
}) {
  const { hasPerm } = useAuth();
  const canReview = hasPerm("inventory.change_pdiinspection");
  const [pdi, setPdi] = useState<PdiInspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenNote, setReopenNote] = useState("");
  const [resolveIssueModal, setResolveIssueModal] = useState<InspectionIssue | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [resolveBusy, setResolveBusy] = useState(false);
  const [uploadPhotoModal, setUploadPhotoModal] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCaption, setPhotoCaption] = useState("");
  const [photoUploadError, setPhotoUploadError] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<InspectionPhoto | null>(null);
  const [uploadItemPhotoModal, setUploadItemPhotoModal] = useState<PdiResult | null>(null);
  const [itemPhotoFile, setItemPhotoFile] = useState<File | null>(null);
  const [itemPhotoError, setItemPhotoError] = useState("");
  const [itemPhotoBusy, setItemPhotoBusy] = useState(false);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    fetchPdi(pdiId)
      .then(setPdi)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  };

  useEffect(load, [pdiId]);

  const run = async (fn: () => Promise<PdiInspection>, label: string) => {
    setBusy(true);
    try {
      setPdi(await fn());
      toast.push(label);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusy(false);
      setRejectOpen(false);
    }
  };

  const handleResolveIssue = async () => {
    if (!resolveIssueModal) return;
    setResolveBusy(true);
    try {
      await resolveInspectionIssue(pdi!.id, {
        issue_id: resolveIssueModal.id,
        notes: resolutionNotes,
      });
      toast.push("Issue marked as resolved.");
      setResolveIssueModal(null);
      setResolutionNotes("");
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : "Failed to resolve issue");
    } finally {
      setResolveBusy(false);
    }
  };

  const handleUploadPhoto = async () => {
    if (!photoFile) {
      setPhotoUploadError("Please select an image file.");
      return;
    }
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(photoFile.type)) {
      setPhotoUploadError("Only JPEG, PNG, or WebP images are allowed.");
      return;
    }
    if (photoFile.size > 5 * 1024 * 1024) {
      setPhotoUploadError("Image size must not exceed 5MB.");
      return;
    }
    setUploadBusy(true);
    try {
      await uploadInspectionGeneralPhoto(pdi!.id, photoFile, photoCaption);
      toast.push("Inspection photo uploaded.");
      setUploadPhotoModal(false);
      setPhotoFile(null);
      setPhotoCaption("");
      setPhotoUploadError("");
      load();
    } catch (e) {
      setPhotoUploadError(e instanceof ApiError ? e.message : "Upload failed");
    } finally {
      setUploadBusy(false);
    }
  };

  const handleItemPhotoUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadItemPhotoModal || !itemPhotoFile || !pdi) return;
    if (itemPhotoFile.size > 5 * 1024 * 1024) {
      setItemPhotoError("Image exceeds 5MB limit. Please upload an image under 5MB.");
      return;
    }
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(itemPhotoFile.type)) {
      setItemPhotoError("Invalid image format. Allowed formats: JPEG, PNG, WebP.");
      return;
    }
    setItemPhotoBusy(true);
    setItemPhotoError("");
    try {
      await uploadPdiResultPhoto(pdi.id, uploadItemPhotoModal.item, itemPhotoFile);
      toast.push("Checklist item photo uploaded.");
      setUploadItemPhotoModal(null);
      setItemPhotoFile(null);
      load();
    } catch (err) {
      setItemPhotoError(err instanceof ApiError ? err.message : "Failed to upload photo.");
    } finally {
      setItemPhotoBusy(false);
    }
  };

  const handleClearItemPhoto = async (itemResult: PdiResult) => {
    if (!pdi) return;
    try {
      await clearPdiResultPhoto(pdi.id, itemResult.item);
      toast.push("Checklist item photo removed.");
      load();
    } catch {
      toast.push("Failed to remove photo.");
    }
  };

  if (loading) {
    return <div className="py-24 text-center text-[13px] text-[#737373]">Loading PDI…</div>;
  }

  if (!pdi) {
    return (
      <div className="max-w-lg mx-auto mt-16 bg-white border border-[#E8E8E5] rounded-2xl p-8 text-center">
        <p className="text-[15px] font-bold text-[#04314A] mb-2">PDI not found</p>
        <p className="text-[13px] text-[#737373] mb-6">{error}</p>
        <button
          onClick={() => onNavigate(`units/${unitId}`)}
          className="px-6 py-3 rounded-full bg-[#04314A] text-white text-[12px] font-semibold"
        >
          Back to Unit
        </button>
      </div>
    );
  }

  const bySection: { key: string; sub: string | null; rows: typeof pdi.results }[] = [];
  pdi.results.forEach((r: PdiResult) => {
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

    const isVei = pdi.inspection_type === "VEI";
    const docTitle = isVei
      ? "VEHICLE ENTRY INSPECTION (VEI) / CHINA ARRIVAL CHECK LIST"
      : "PRE-DELIVERY INSPECTION / VEHICLE DELIVERY CHECK LIST";
    const docNoLabel = isVei ? "VEI NO./DATE: " : "PDI NO./DATE: ";

    const handlePrint = async () => {
      try {
        await recordPrintPdi(pdi.id);
      } catch {
        // Fallback gracefully
      }
      await logPrintEvent({
        documentType: isVei ? "VEI_REPORT" : "PDI_REPORT",
        objectId: pdi.id,
        title: pdi.pdi_no,
      });
      window.print();
    };

  const renderChecklistRow = (r: PdiResult) => {
    const hasPhoto = Boolean(r.photo_display || r.photo);
    const photoUrl = r.photo_display || r.photo || "";
    const isEditable = !pdi.is_locked && (pdi.status === "DRAFT" || pdi.status === "SUBMITTED");

    return (
      <div key={r.id} className="flex items-center justify-between px-2 py-1 gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="uppercase font-semibold text-[#04314A] truncate">
            {r.label}
            {r.remark && (
              <span className="block text-[9px] text-[#8B0000] italic font-normal">
                ({r.remark})
              </span>
            )}
          </span>
          {hasPhoto && (
            <button
              type="button"
              onClick={() =>
                setPreviewPhoto({
                  id: r.id,
                  inspection: pdi.id,
                  photo: photoUrl,
                  photo_display: photoUrl,
                  caption: `${r.label}${r.remark ? `: ${r.remark}` : ""}`,
                  created_at: "",
                })
              }
              className="inline-flex items-center gap-1 px-1 py-0.5 rounded text-[9px] font-semibold bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0] shrink-0 hover:bg-[#DCFCE7]"
              title="Click to view photo evidence"
            >
              <img src={photoUrl} alt="Photo" className="w-3.5 h-3.5 object-cover rounded" />
              <span className="no-print">Photo</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Action buttons on screen */}
          {isEditable && (
            <div className="no-print flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setUploadItemPhotoModal(r);
                  setItemPhotoFile(null);
                  setItemPhotoError("");
                }}
                className="p-1 text-[#737373] hover:text-[#00AAEB] hover:bg-[#F0F9FF] rounded transition-colors"
                title={hasPhoto ? "Replace photo" : "Attach photo evidence"}
              >
                <Camera size={12} />
              </button>
              {hasPhoto && (
                <button
                  type="button"
                  onClick={() => handleClearItemPhoto(r)}
                  className="p-1 text-[#737373] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded transition-colors"
                  title="Remove photo"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          )}

          <span
            className={`w-4 h-4 border border-[#04314A] flex items-center justify-center text-[10px] font-bold ${
              r.result === "OK"
                ? "text-[#04314A]"
                : r.result === "NOT_OK"
                ? "text-[#04314A] bg-[#F7F7F5]"
                : ""
            }`}
          >
            {r.result === "OK" ? "✓" : r.result === "NOT_OK" ? "✕" : ""}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full pb-16">
        <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-4">
          <button
            onClick={() => onNavigate(`units/${unitId}`)}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-[#737373] hover:text-[#00AAEB] transition-colors"
          >
            <ArrowLeft size={14} /> Back to Unit
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <Badge status={pdi.status.toLowerCase()}>
              {pdi.status}
            </Badge>
            {pdi.status === "DRAFT" && canReview && (
              <button
                onClick={() => onNavigate(`units/${unitId}/${isVei ? "vei" : "pdi"}/${pdi.id}/edit`)}
                className="px-4 py-2.5 rounded-full border border-[#04314A] text-[#04314A] text-[12px] font-bold tracking-[0.04em] uppercase hover:bg-[#04314A] hover:text-white transition-colors"
              >
                Continue Editing
              </button>
            )}
            {pdi.status === "SUBMITTED" && canReview && (
              <>
                <button
                  onClick={() => run(() => approvePdi(pdi.id), `${pdi.inspection_type} approved`)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#04314A] text-white text-[12px] font-bold tracking-[0.04em] uppercase hover:bg-[#00AAEB] transition-colors disabled:opacity-50"
                >
                  <Check size={14} /> Approve
                </button>
                <button
                  onClick={() => setRejectOpen(true)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-[#E8E8E5] text-[#737373] text-[12px] font-bold tracking-[0.04em] uppercase hover:border-[#04314A] hover:text-[#04314A] bg-white transition-colors disabled:opacity-50"
                >
                  <X size={14} /> Reject
                </button>
              </>
            )}
            {(pdi.status === "COMPLETED" || pdi.status === "APPROVED" || pdi.status === "SUBMITTED") && !pdi.is_locked && canReview && (
              <button
                onClick={() => run(() => lockPdi(pdi.id), `${pdi.inspection_type} locked`)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-[#04314A] text-[#04314A] text-[12px] font-bold tracking-[0.04em] uppercase hover:bg-[#04314A] hover:text-white transition-colors disabled:opacity-50"
              >
                <Lock size={14} /> Lock
              </button>
            )}
            {pdi.can_reopen && pdi.status !== "DRAFT" && (
              <button
                onClick={() => setReopenOpen(true)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-[#C53030] text-[#C53030] text-[12px] font-bold tracking-[0.04em] uppercase hover:bg-[#C53030] hover:text-white transition-colors disabled:opacity-50"
              >
                <Unlock size={14} /> Reopen
              </button>
            )}
            {(pdi.status === "APPROVED" || pdi.status === "REJECTED" || pdi.status === "SUBMITTED" || pdi.status === "COMPLETED" || pdi.status === "LOCKED") && canReview && (
              <button
                onClick={() => onNavigate(`units/${unitId}/${isVei ? "vei" : "pdi"}/new`)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-[#E8E8E5] bg-white text-[#04314A] text-[12px] font-bold tracking-[0.04em] uppercase hover:border-[#04314A] transition-colors"
              >
                <RotateCcw size={14} /> Re-inspect
              </button>
            )}
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#04314A] text-white text-[12px] font-bold tracking-[0.04em] uppercase hover:bg-[#00AAEB] transition-colors"
            >
              <Printer size={14} /> Download PDF
            </button>
          </div>
        </div>

        {error && (
          <p className="no-print mb-4 text-[13px] text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] px-3 py-2 rounded">
            {error}
          </p>
        )}

        {/* Linked Import Batch / Shipment */}
        {pdi.import_batch_detail && (
          <div className="no-print mb-6 bg-white border border-[#E8E8E5] rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Truck size={16} className="text-[#04314A]" />
                <h3 className="font-bold text-[14px] text-[#04314A]">
                  Arrival Consignment / Import Batch
                </h3>
              </div>
              <button
                onClick={() => onNavigate(`batches/${pdi.import_batch_detail?.id}`)}
                className="text-[12px] font-semibold text-[#04314A] hover:underline"
              >
                View Batch {pdi.import_batch_detail.batch_no} &rarr;
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[12px]">
              <div>
                <span className="text-[#737373] block text-[11px]">Batch Number</span>
                <span className="font-semibold text-[#04314A]">{pdi.import_batch_detail.batch_no}</span>
              </div>
              <div>
                <span className="text-[#737373] block text-[11px]">Consignment Status</span>
                <span className="font-semibold text-[#04314A]">{pdi.import_batch_detail.transport_status}</span>
              </div>
              <div>
                <span className="text-[#737373] block text-[11px]">Border Entry</span>
                <span className="font-semibold text-[#04314A]">{pdi.import_batch_detail.border_crossing || "—"}</span>
              </div>
              <div>
                <span className="text-[#737373] block text-[11px]">Container / Truck</span>
                <span className="font-semibold text-[#04314A]">{pdi.import_batch_detail.container_or_truck_no || "—"}</span>
              </div>
            </div>
          </div>
        )}

        {/* Inspection Issues & Defects List */}
        <div className="no-print mb-6 bg-white border border-[#E8E8E5] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className={pdi.open_issues_count ? "text-[#DC2626]" : "text-[#737373]"} />
              <h3 className="font-bold text-[14px] text-[#04314A]">
                Checklist Issues & Defects
              </h3>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                pdi.open_issues_count
                  ? "bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]"
                  : "bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]"
              }`}>
                {pdi.open_issues_count || 0} open
              </span>
            </div>
          </div>

          {!pdi.issues || pdi.issues.length === 0 ? (
            <p className="text-[12px] text-[#737373] py-2">
              No defects recorded on this inspection. All checked items passed.
            </p>
          ) : (
            <div className="divide-y divide-[#E8E8E5] border border-[#E8E8E5] rounded-lg overflow-hidden">
              {pdi.issues.map((issue: InspectionIssue) => (
                <div key={issue.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-[#FAFAF8]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border ${
                        issue.resolved
                          ? "bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]"
                          : "bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]"
                      }`}>
                        {issue.resolved ? "Resolved" : "Open Issue"}
                      </span>
                      {issue.item_section && (
                        <span className="text-[11px] text-[#737373] font-medium">
                          {sectionLabel(issue.item_section)}
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] font-medium text-[#04314A]">
                      {issue.description}
                    </p>
                    {issue.item_label && (
                      <p className="text-[11px] text-[#737373]">
                        Item: {issue.item_label}
                      </p>
                    )}
                    {issue.resolved && (
                      <div className="text-[11px] text-[#065F46] bg-[#ECFDF5] px-2.5 py-1 rounded border border-[#A7F3D0] inline-block mt-1">
                        Resolved by {issue.resolved_by_name || "Staff"} on {formatDate(issue.resolved_at)}
                        {issue.resolution_notes ? `: ${issue.resolution_notes}` : ""}
                      </div>
                    )}
                  </div>
                  <div>
                    {!issue.resolved && canReview && (
                      <button
                        onClick={() => {
                          setResolveIssueModal(issue);
                          setResolutionNotes("");
                        }}
                        className="px-3.5 py-1.5 text-[11px] font-semibold rounded-full bg-[#04314A] text-white hover:bg-[#00AAEB] transition-colors"
                      >
                        Resolve Defect
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* General Inspection Photos Gallery */}
        <div className="no-print mb-6 bg-white border border-[#E8E8E5] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ImageIcon size={16} className="text-[#04314A]" />
              <h3 className="font-bold text-[14px] text-[#04314A]">
                General Inspection Photos
              </h3>
              <span className="text-[11px] text-[#737373]">
                ({pdi.general_photos?.length || 0})
              </span>
            </div>
            {canReview && (
              <button
                onClick={() => {
                  setUploadPhotoModal(true);
                  setPhotoFile(null);
                  setPhotoCaption("");
                  setPhotoUploadError("");
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#04314A] text-[#04314A] text-[11px] font-bold tracking-[0.03em] uppercase hover:bg-[#04314A] hover:text-white transition-colors"
              >
                <Upload size={12} /> Add Photo
              </button>
            )}
          </div>

          {!pdi.general_photos || pdi.general_photos.length === 0 ? (
            <p className="text-[12px] text-[#737373] py-2">
              No general inspection photos attached. Upload overall vehicle condition photos (max 5MB, JPEG/PNG/WebP).
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
              {pdi.general_photos.map((ph: InspectionPhoto) => (
                <div
                  key={ph.id}
                  onClick={() => setPreviewPhoto(ph)}
                  className="cursor-pointer group border border-[#E8E8E5] rounded-lg overflow-hidden bg-[#FAFAF8] hover:border-[#04314A] transition-colors"
                >
                  <img
                    src={ph.photo_display || ph.photo}
                    alt={ph.caption || "Inspection photo"}
                    className="w-full h-32 object-cover group-hover:scale-105 transition-transform"
                  />
                  {ph.caption && (
                    <div className="p-2 text-[11px] text-[#04314A] font-medium truncate">
                      {ph.caption}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Paper-form rendering matching physical sheet */}
        <div className="print-area bg-white border border-[#04314A] rounded-xl p-4 sm:p-7 print:p-2 print:border-2 print:border-[#04314A] shadow-sm text-[#04314A]">
          {/* Document Header */}
          <div className="text-center pb-3 mb-3 border-b-2 border-[#04314A]">
            <h2 className="text-[13px] sm:text-[15px] font-black tracking-[0.14em] uppercase text-[#04314A]">
              VEHICLE TEMPLATE
            </h2>
            <h1 className="text-[12px] sm:text-[14px] font-extrabold uppercase text-[#04314A] tracking-wider mt-0.5">
              {docTitle}
            </h1>
          </div>

          {/* Header Metadata Table */}
          <table className="w-full border-collapse border border-[#04314A] text-[11px] mb-3">
            <tbody>
              <tr className="border-b border-[#04314A]">
                <td className="border-r border-[#04314A] px-2.5 py-1 font-bold w-1/2">
                  <span className="text-[#555]">EV COMPANY NAME: </span>
                  <span className="text-[#04314A] uppercase">{pdi.ev_company_name || "VEHICLE TEMPLATE"}</span>
                </td>
                <td className="px-2.5 py-1 font-bold w-1/2">
                  <span className="text-[#555]">{docNoLabel}</span>
                  <span className="text-[#04314A]">{pdi.pdi_no} / {formatDate(pdi.inspection_date)}</span>
                </td>
              </tr>
            <tr className="border-b border-[#04314A]">
              <td className="border-r border-[#04314A] px-2.5 py-1 font-bold">
                <span className="text-[#555]">VIN/CHASSIS No.: </span>
                <span className="text-[#04314A] font-semibold">{pdi.vin_chassis_no}</span>
              </td>
              <td className="px-2.5 py-1 font-bold">
                <span className="text-[#555]">MANUFACTURE DATE: </span>
                <span className="text-[#04314A]">{formatDate(pdi.manufacture_date_snapshot) || "—"}</span>
              </td>
            </tr>
            <tr className="border-b border-[#04314A]">
              <td className="border-r border-[#04314A] px-2.5 py-1 font-bold">
                <span className="text-[#555]">MODEL & BATTERY POWER(KW): </span>
                <span className="text-[#04314A]">{pdi.model_snapshot}{pdi.variant_name ? ` · ${pdi.variant_name}` : ""}{pdi.battery_power_snapshot ? ` · ${pdi.battery_power_snapshot} kW` : ""}</span>
              </td>
              <td className="px-2.5 py-1 font-bold">
                <span className="text-[#555]">VEHICLE COLOR: </span>
                <span className="text-[#04314A]">{pdi.color_snapshot || "—"}</span>
              </td>
            </tr>
            <tr>
              <td className="border-r border-[#04314A] px-2.5 py-1 font-bold">
                <span className="text-[#555]">MOTOR POWER(KW)/MOTOR NO.: </span>
                <span className="text-[#04314A]">
                  {pdi.motor_power_snapshot ? `${pdi.motor_power_snapshot} kW / ` : ""}{pdi.motor_no_snapshot || "—"}
                </span>
              </td>
              <td className="px-2.5 py-1 font-bold">
                <span className="text-[#555]">VEHICLE RUN(KM): </span>
                <span className="text-[#04314A]">{pdi.odometer_km_snapshot} KM</span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Sections */}
        {bySection.map((group) => {
          const isAppearance = group.key === "APPEARANCE_AND_CONDITION";
          const midpoint = Math.ceil(group.rows.length / 2);
          const leftRows = group.rows.slice(0, midpoint);
          const rightRows = group.rows.slice(midpoint);

          return (
            <div key={`${group.key}-${group.sub ?? ""}`} className="mb-3 break-inside-avoid border border-[#04314A]">
              {/* Section Header */}
              <div className="bg-[#EAEAEA] border-b border-[#04314A] py-1 text-center font-black text-[11px] tracking-[0.14em] uppercase text-[#04314A]">
                {sectionLabel(group.key)}
              </div>

              {isAppearance ? (
                // Appearance & Condition has 2 distinct sub-tables: Interior & Exterior
                <div className="grid grid-cols-2 divide-x divide-[#04314A] text-[10px]">
                  <div>
                    <div className="bg-[#F3F3F3] border-b border-[#04314A] py-1 px-2 text-center font-bold text-[10px] tracking-wider uppercase">
                      INTERIOR CLEANLINESS
                    </div>
                    <div className="divide-y divide-[#E0E0E0]">
                      {group.rows
                        .filter((r: PdiResult) => r.sub_section_snapshot === "INTERIOR_CLEANLINESS" || (!r.sub_section_snapshot && group.rows.indexOf(r) < 9))
                        .map(renderChecklistRow)}
                    </div>
                  </div>

                  <div>
                    <div className="bg-[#F3F3F3] border-b border-[#04314A] py-1 px-2 text-center font-bold text-[10px] tracking-wider uppercase">
                      EXTERIOR BODY PARTS
                    </div>
                    <div className="divide-y divide-[#E0E0E0]">
                      {group.rows
                        .filter((r: PdiResult) => r.sub_section_snapshot === "EXTERIOR_BODY_PARTS" || (!r.sub_section_snapshot && group.rows.indexOf(r) >= 9))
                        .map(renderChecklistRow)}
                    </div>
                  </div>
                </div>
              ) : (
                // 2-Column Checklist for Tools & Functionality
                <div className="grid grid-cols-2 divide-x divide-[#04314A] text-[10px]">
                  <div className="divide-y divide-[#E0E0E0]">
                    {leftRows.map(renderChecklistRow)}
                  </div>

                  <div className="divide-y divide-[#E0E0E0]">
                    {rightRows.map(renderChecklistRow)}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Checklist Item Photo Evidence Gallery (Print & Screen) */}
        {pdi.results.some((r) => r.photo_display || r.photo) && (
          <div className="mb-3 border border-[#04314A] p-3 break-inside-avoid">
            <div className="bg-[#EAEAEA] border-b border-[#04314A] py-1 px-2 text-center font-black text-[11px] tracking-[0.14em] uppercase text-[#04314A] mb-3">
              CHECKLIST ITEM PHOTO EVIDENCE
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {pdi.results
                .filter((r) => r.photo_display || r.photo)
                .map((r) => (
                  <div
                    key={r.id}
                    onClick={() =>
                      setPreviewPhoto({
                        id: r.id,
                        inspection: pdi.id,
                        photo: r.photo_display || r.photo || "",
                        photo_display: r.photo_display || r.photo || "",
                        caption: `${r.label}${r.remark ? `: ${r.remark}` : ""}`,
                        created_at: "",
                      })
                    }
                    className="border border-[#04314A] rounded p-2 text-[10px] cursor-pointer hover:bg-[#FAFAF8] transition-colors"
                  >
                    <img
                      src={r.photo_display || r.photo || ""}
                      alt={r.label}
                      className="w-full h-24 object-cover rounded mb-1.5"
                    />
                    <div className="font-bold text-[#04314A] uppercase truncate">{r.label}</div>
                    <div className="text-[#737373] text-[9px] truncate">
                      {r.section_snapshot ? r.section_snapshot.replace(/_/g, " ") : ""}
                    </div>
                    {r.remark && (
                      <div className="text-[#8B0000] italic text-[9px] mt-0.5 truncate">
                        {r.remark}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Bottom Verdict & Sign-off Box */}
        <div className="border border-[#04314A] p-3 text-[11px] grid sm:grid-cols-2 gap-4 items-center">
          {/* Rating Rectangles */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className={`w-9 h-6 border-2 border-[#04314A] flex items-center justify-center font-black text-[13px] ${
                pdi.overall_rating === "VERY_GOOD" ? "bg-[#04314A] text-white" : ""
              }`}>
                {pdi.overall_rating === "VERY_GOOD" ? "✓" : ""}
              </div>
              <span className="font-extrabold text-[10px] uppercase">VERY GOOD</span>
            </div>

            <div className="flex items-center gap-2">
              <div className={`w-9 h-6 border-2 border-[#04314A] flex items-center justify-center font-black text-[13px] ${
                pdi.overall_rating === "GOOD" ? "bg-[#04314A] text-white" : ""
              }`}>
                {pdi.overall_rating === "GOOD" ? "✓" : ""}
              </div>
              <span className="font-extrabold text-[10px] uppercase">GOOD</span>
            </div>

            <div className="flex items-center gap-2">
              <div className={`w-9 h-6 border-2 border-[#04314A] flex items-center justify-center font-black text-[13px] ${
                pdi.overall_rating === "POOR" ? "bg-[#04314A] text-white" : ""
              }`}>
                {pdi.overall_rating === "POOR" ? "✓" : ""}
              </div>
              <span className="font-extrabold text-[10px] uppercase">POOR</span>
            </div>
          </div>

          {/* Representative info */}
          <div className="sm:text-right font-bold text-[11px]">
            <div>
              <span className="text-[#555]">CHECK STAFF/ REPRESENTATIVE : </span>
              <span className="text-[#04314A] uppercase underline">{pdi.checked_by || "SHAILENDRA KUMAR YADAV"}</span>
            </div>
            <div className="mt-1">
              <span className="text-[#555]">DATE: </span>
              <span className="text-[#04314A]">{formatDate(pdi.inspection_date)}</span>
            </div>
          </div>
        </div>

        {/* Signatures Row */}
        <div className="mt-4 pt-3 border-t border-dashed border-[#04314A] grid grid-cols-2 gap-6 text-[11px]">
          <div>
            <span className="text-[10px] font-bold uppercase text-[#555] block mb-1">
              Inspector Signature
            </span>
            {pdi.signature_display ? (
              <img src={pdi.signature_display} alt="Inspector signature" className="h-12 w-auto object-contain" />
            ) : (
              <div className="h-10 border-b border-dotted border-[#04314A] w-48 mt-2" />
            )}
            <span className="text-[10px] text-[#737373] mt-1 block">Authorized Inspector: {pdi.checked_by || "Shailendra Kumar Yadav"}</span>
          </div>

          <div className="text-right flex flex-col items-end">
            <span className="text-[10px] font-bold uppercase text-[#555] block mb-1">
              Customer / Receiver Signature
            </span>
            <div className="h-10 border-b border-dotted border-[#04314A] w-48 mt-2" />
            <span className="text-[10px] text-[#737373] mt-1 block">Vehicle Received in Satisfactory Condition</span>
          </div>
        </div>

        <PrintFooter
          documentType={isVei ? "VEI_REPORT" : "PDI_REPORT"}
          objectId={pdi.id}
          className="mt-6"
        />
      </div>

      {rejectOpen && (
        <Modal title={`Reject ${pdi.inspection_type}?`} onClose={() => setRejectOpen(false)}>
          <p className="text-[13px] text-[#737373] mb-4">
            The vehicle returns to Pending for re-inspection.
          </p>
          <Field label="Rejection note">
            <input
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Why is this inspection rejected…"
              className={inputCls}
            />
          </Field>
          <div data-modal-actions className="flex gap-3 justify-end mt-6">
            <button
              onClick={() => setRejectOpen(false)}
              className="px-6 py-2.5 border border-[#E8E8E5] rounded-full text-[12px] font-semibold text-[#737373] hover:border-[#04314A] hover:text-[#04314A] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => run(() => rejectPdi(pdi.id, rejectNote), `${pdi.inspection_type} rejected`)}
              disabled={busy}
              className="px-6 py-2.5 rounded-full bg-[#8B0000] text-white text-[12px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {busy ? "Rejecting…" : "Reject"}
            </button>
          </div>
        </Modal>
      )}

      {reopenOpen && (
        <Modal title={`Reopen ${pdi.inspection_type}?`} onClose={() => setReopenOpen(false)}>
          <p className="text-[13px] text-[#737373] mb-4">
            Reopening changes the inspection status back to Draft so you can adjust items. This action is recorded in the audit log.
          </p>
          <Field label="Reason for reopening">
            <input
              value={reopenNote}
              onChange={(e) => setReopenNote(e.target.value)}
              placeholder="Explain why this inspection is being reopened…"
              className={inputCls}
            />
          </Field>
          <div data-modal-actions className="flex gap-3 justify-end mt-6">
            <button
              onClick={() => setReopenOpen(false)}
              className="px-6 py-2.5 border border-[#E8E8E5] rounded-full text-[12px] font-semibold text-[#737373] hover:border-[#04314A] hover:text-[#04314A] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => run(() => reopenPdi(pdi.id, reopenNote), `${pdi.inspection_type} reopened to Draft`)}
              disabled={busy}
              className="px-6 py-2.5 rounded-full bg-[#04314A] text-white text-[12px] font-semibold hover:bg-[#00AAEB] transition-colors disabled:opacity-50"
            >
              {busy ? "Reopening…" : "Reopen to Draft"}
            </button>
          </div>
        </Modal>
      )}

      {/* Resolve Issue Modal */}
      {resolveIssueModal && (
        <Modal title="Resolve Checklist Defect" onClose={() => setResolveIssueModal(null)}>
          <div className="space-y-4">
            <div className="p-3 bg-[#FAFAF8] border border-[#E8E8E5] rounded-lg text-[12px]">
              <span className="text-[#737373] block text-[11px]">Defect description:</span>
              <p className="font-semibold text-[#04314A] mt-0.5">{resolveIssueModal.description}</p>
              {resolveIssueModal.item_label && (
                <p className="text-[#737373] text-[11px] mt-1">Checklist item: {resolveIssueModal.item_label}</p>
              )}
            </div>

            <Field label="Resolution Notes / Corrective Action">
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Explain what repair or adjustment was made to rectify this defect…"
                rows={3}
                className="w-full px-3 py-2 text-[12px] border border-[#E8E8E5] rounded-lg focus:outline-none focus:border-[#04314A]"
              />
            </Field>

            <div data-modal-actions className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setResolveIssueModal(null)}
                className="px-5 py-2 rounded-full border border-[#E8E8E5] text-[12px] font-semibold text-[#737373] hover:text-[#04314A]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResolveIssue}
                disabled={resolveBusy}
                className="px-6 py-2 rounded-full bg-[#04314A] text-white text-[12px] font-semibold hover:bg-[#00AAEB] transition-colors disabled:opacity-50"
              >
                {resolveBusy ? "Saving…" : "Mark Resolved"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Upload General Photo Modal */}
      {uploadPhotoModal && (
        <Modal title="Upload Inspection Photo" onClose={() => setUploadPhotoModal(false)}>
          <div className="space-y-4">
            <p className="text-[12px] text-[#737373]">
              Upload overall vehicle photos (underbody, battery pack, exterior condition). Only JPEG, PNG, or WebP images up to 5MB.
            </p>

            <Field label="Select Image File">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setPhotoFile(file);
                  setPhotoUploadError("");
                }}
                className="block w-full text-[12px] text-[#737373] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[11px] file:font-semibold file:bg-[#FAFAF8] file:text-[#04314A] hover:file:bg-[#E8E8E5]"
              />
            </Field>

            <Field label="Photo Caption (optional)">
              <input
                type="text"
                value={photoCaption}
                onChange={(e) => setPhotoCaption(e.target.value)}
                placeholder="e.g. Front bumper transit film inspection"
                className={inputCls}
              />
            </Field>

            {photoUploadError && (
              <p className="text-[12px] text-[#DC2626]">{photoUploadError}</p>
            )}

            <div data-modal-actions className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setUploadPhotoModal(false)}
                className="px-5 py-2 rounded-full border border-[#E8E8E5] text-[12px] font-semibold text-[#737373] hover:text-[#04314A]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUploadPhoto}
                disabled={uploadBusy || !photoFile}
                className="px-6 py-2 rounded-full bg-[#04314A] text-white text-[12px] font-semibold hover:bg-[#00AAEB] transition-colors disabled:opacity-50"
              >
                {uploadBusy ? "Uploading…" : "Upload Photo"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Photo Preview Modal */}
      {previewPhoto && (
        <Modal title={previewPhoto.caption || "Inspection Photo"} onClose={() => setPreviewPhoto(null)}>
          <div className="space-y-3">
            <img
              src={previewPhoto.photo_display || previewPhoto.photo}
              alt={previewPhoto.caption || "Inspection Photo"}
              className="max-h-[70vh] w-auto mx-auto object-contain rounded"
            />
            <div className="flex justify-between items-center text-[11px] text-[#737373] pt-2">
              <span>{previewPhoto.caption || "Inspection photo"}</span>
              <span>{formatDate(previewPhoto.created_at)}</span>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal to Upload Checklist Item Photo */}
      {uploadItemPhotoModal && (
        <Modal
          title={`Attach Photo: ${uploadItemPhotoModal.label}`}
          onClose={() => setUploadItemPhotoModal(null)}
        >
          <form onSubmit={handleItemPhotoUpload} className="space-y-4">
            <p className="text-[12px] text-[#737373]">
              Upload evidence photo for this checklist item (JPEG, PNG, WebP up to 5MB).
            </p>

            <Field label="Select Image File">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setItemPhotoFile(file);
                  setItemPhotoError("");
                }}
                className="block w-full text-[12px] text-[#737373] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[11px] file:font-semibold file:bg-[#FAFAF8] file:text-[#04314A] hover:file:bg-[#E8E8E5]"
                required
              />
            </Field>

            {itemPhotoError && (
              <p className="text-[12px] text-[#DC2626]">{itemPhotoError}</p>
            )}

            <div data-modal-actions className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setUploadItemPhotoModal(null)}
                className="px-5 py-2 rounded-full border border-[#E8E8E5] text-[12px] font-semibold text-[#737373] hover:text-[#04314A]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={itemPhotoBusy || !itemPhotoFile}
                className="px-6 py-2 rounded-full bg-[#04314A] text-white text-[12px] font-semibold hover:bg-[#00AAEB] transition-colors disabled:opacity-50"
              >
                {itemPhotoBusy ? "Uploading…" : "Upload Evidence Photo"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {toast.node}
    </div>
  );
}
