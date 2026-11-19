import { useEffect, useState, useRef } from "react";
import {
  Download,
  Eye,
  File,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  X,
  AlertTriangle,
  Link as LinkIcon,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  attachDocument,
  createDocument,
  detachDocument,
  fetchDocuments,
  formatFileSize,
  type DocumentCategory,
  type VaultDocument,
} from "@/lib/documents";
import { Modal, Field, inputCls, Badge, useToast } from "../crm/ui";

interface DocumentAttachmentWidgetProps {
  targetType: "shipment" | "unit" | "customer" | "sale" | "employee";
  targetId: string | number;
  targetTitle: string;
  onCountChange?: (count: number) => void;
  canManage?: boolean;
}

export default function DocumentAttachmentWidget({
  targetType,
  targetId,
  targetTitle,
  onCountChange,
  canManage = true,
}: DocumentAttachmentWidgetProps) {
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [attachExistingModalOpen, setAttachExistingModalOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<VaultDocument | null>(null);

  // Upload Form state
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<DocumentCategory>(
    targetType === "shipment"
      ? "SHIPMENT"
      : targetType === "unit"
      ? "VEHICLE_UNIT"
      : targetType === "customer"
      ? "CUSTOMER"
      : targetType === "employee"
      ? "GENERAL"
      : "SALE"
  );
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [forceDuplicate, setForceDuplicate] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Attach existing state
  const [availableDocs, setAvailableDocs] = useState<VaultDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | number>("");
  const [searchExisting, setSearchExisting] = useState("");
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const loadDocuments = () => {
    setLoading(true);
    setError("");
    const params: Record<string, string | number> = { [targetType]: targetId };
    fetchDocuments(params)
      .then((docs) => {
        setDocuments(docs);
        if (onCountChange) onCountChange(docs.length);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load documents"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (targetId) {
      loadDocuments();
    }
  }, [targetType, targetId]);

  const openUploadModal = () => {
    setFile(null);
    setTitle("");
    setExpiryDate("");
    setNotes("");
    setDuplicateWarning(null);
    setForceDuplicate(false);
    setCategory(
      targetType === "shipment"
        ? "SHIPMENT"
        : targetType === "unit"
        ? "VEHICLE_UNIT"
        : targetType === "customer"
        ? "CUSTOMER"
        : targetType === "employee"
        ? "GENERAL"
        : "SALE"
    );
    setUploadModalOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.size > 10 * 1024 * 1024) {
      toast.push("File exceeds 10MB limit.");
      return;
    }
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(selected.type) && !/\.(pdf|jpe?g|png|webp)$/i.test(selected.name)) {
      toast.push("Only PDF, JPEG, PNG, or WebP files are allowed.");
      return;
    }

    setFile(selected);
    if (!title) {
      setTitle(selected.name.replace(/\.[^/.]+$/, ""));
    }
    setDuplicateWarning(null);
    setForceDuplicate(false);
  };

  const handleUploadSubmit = async () => {
    if (!file) {
      toast.push("Please select a file to upload.");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title || file.name);
      formData.append("category", category);
      if (expiryDate) formData.append("expiry_date", expiryDate);
      if (notes) formData.append("notes", notes);
      if (forceDuplicate) formData.append("force_duplicate", "true");

      // Set target assignment
      if (targetType === "shipment") formData.append("shipment_id", String(targetId));
      else if (targetType === "unit") formData.append("unit_id", String(targetId));
      else if (targetType === "customer") formData.append("customer_id", String(targetId));
      else if (targetType === "sale") formData.append("sale_id", String(targetId));
      else if (targetType === "employee") formData.append("employee_id", String(targetId));

      await createDocument(formData);
      toast.push("Document uploaded and attached successfully.");
      setUploadModalOpen(false);
      loadDocuments();
    } catch (err: any) {
      const d = err instanceof ApiError ? (err.detail as any) : null;
      if (err instanceof ApiError && err.status === 409 && d?.duplicate_warning) {
        setDuplicateWarning(d.message || "A file with identical content already exists.");
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to upload document.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openAttachExistingModal = () => {
    setSelectedDocId("");
    setSearchExisting("");
    setAttachExistingModalOpen(true);
    setLoadingAvailable(true);

    fetchDocuments()
      .then((allDocs) => {
        // Filter out docs already attached
        const existingIds = new Set(documents.map((d) => d.id));
        setAvailableDocs(allDocs.filter((d) => !existingIds.has(d.id)));
      })
      .catch(() => setAvailableDocs([]))
      .finally(() => setLoadingAvailable(false));
  };

  const handleAttachExistingSubmit = async () => {
    if (!selectedDocId) {
      toast.push("Select a document to attach.");
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {};
      if (targetType === "shipment") payload.shipment = Number(targetId);
      else if (targetType === "unit") payload.unit = Number(targetId);
      else if (targetType === "customer") payload.customer = String(targetId);
      else if (targetType === "sale") payload.sale = Number(targetId);
      else if (targetType === "employee") payload.employee = Number(targetId);

      await attachDocument(selectedDocId, payload);
      toast.push("Document attached successfully.");
      setAttachExistingModalOpen(false);
      loadDocuments();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to attach document.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDetach = async (doc: VaultDocument) => {
    if (!window.confirm(`Detach "${doc.title}" from this ${targetType}?`)) return;

    try {
      const payload: any = {};
      if (targetType === "shipment") payload.shipment = Number(targetId);
      else if (targetType === "unit") payload.unit = Number(targetId);
      else if (targetType === "customer") payload.customer = String(targetId);
      else if (targetType === "sale") payload.sale = Number(targetId);
      else if (targetType === "employee") payload.employee = Number(targetId);

      await detachDocument(doc.id, payload);
      toast.push("Attachment removed.");
      loadDocuments();
    } catch (err: any) {
      toast.push(err instanceof ApiError ? err.message : "Failed to remove attachment.");
    }
  };

  const isImage = (type: string) => type.startsWith("image/");

  const filteredAvailable = availableDocs.filter((d) => {
    if (!searchExisting.trim()) return true;
    const term = searchExisting.toLowerCase();
    return (
      d.title.toLowerCase().includes(term) ||
      (d.file_type && d.file_type.toLowerCase().includes(term)) ||
      (d.notes && d.notes.toLowerCase().includes(term))
    );
  });

  return (
    <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#E8E8E5] flex flex-wrap items-center justify-between gap-3 bg-[#FAFAF8]">
        <div className="flex items-center gap-2">
          <Paperclip size={16} className="text-[#04314A]" />
          <h3 className="text-[14px] font-bold text-[#04314A]">
            Attached Documents ({documents.length})
          </h3>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <button
              onClick={openAttachExistingModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E8E8E5] bg-white text-[12px] font-semibold text-[#04314A] hover:bg-[#F0F0ED] transition-colors"
            >
              <LinkIcon size={13} /> Link Existing
            </button>
            <button
              onClick={openUploadModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#04314A] text-[12px] font-semibold text-white hover:bg-[#00AAEB] transition-colors"
            >
              <Plus size={13} /> Upload Document
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="m-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-[12px]">
          {error}
        </div>
      )}

      {/* Document List */}
      {loading ? (
        <div className="p-8 text-center text-[12px] text-[#737373]">Loading documents...</div>
      ) : documents.length === 0 ? (
        <div className="p-8 text-center text-[12px] text-[#737373]">
          No documents attached to this {targetType}. Click &quot;Upload Document&quot; or &quot;Link Existing&quot; above to attach files.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[#E8E8E5] bg-[#F7F7F5] text-[11px] font-semibold text-[#737373]">
                <th className="px-4 py-2.5">Document Title</th>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">File Details</th>
                <th className="px-4 py-2.5">Expiry</th>
                <th className="px-4 py-2.5">Uploaded By</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const img = isImage(doc.file_type);
                return (
                  <tr key={doc.id} className="border-b border-[#F0F0ED] hover:bg-[#FAFAF8]">
                    <td className="px-4 py-3 text-[#04314A]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded bg-[#F0F0ED] flex items-center justify-center text-[#04314A] shrink-0">
                          {img ? <ImageIcon size={14} /> : <FileText size={14} />}
                        </div>
                        <div>
                          <div className="font-semibold text-[#04314A]">{doc.title}</div>
                          {doc.notes && (
                            <div className="text-[11px] text-[#737373] line-clamp-1">{doc.notes}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#737373]">
                      <span className="inline-block px-2 py-0.5 rounded bg-[#F0F0ED] text-[11px] font-medium text-[#04314A]">
                        {doc.document_type_master_detail?.name || doc.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#737373] whitespace-nowrap">
                      <div>{formatFileSize(doc.file_size)}</div>
                      <div className="text-[11px] text-[#A0A09C] uppercase">
                        {doc.file_type.split("/")[1] || "FILE"}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {doc.expiry_date ? (
                        <div>
                          <div className="text-[11px] text-[#04314A]">{doc.expiry_date}</div>
                          <span
                            className={`inline-block text-[10px] font-bold px-1.5 py-0.2 rounded ${
                              doc.expiry_status === "EXPIRED"
                                ? "bg-red-100 text-red-800"
                                : doc.expiry_status === "EXPIRING_SOON"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {doc.expiry_status.replace("_", " ")}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[#A0A09C]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#737373] whitespace-nowrap">
                      <div>{doc.uploaded_by_name || doc.created_by_name || "Staff"}</div>
                      <div className="text-[11px] text-[#A0A09C]">
                        {doc.created_at ? doc.created_at.slice(0, 10) : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => setPreviewDoc(doc)}
                          className="p-1.5 rounded hover:bg-[#F0F0ED] text-[#04314A]"
                          title="Preview document"
                        >
                          <Eye size={14} />
                        </button>
                        <a
                          href={doc.download_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded hover:bg-[#F0F0ED] text-[#04314A]"
                          title="Download document"
                        >
                          <Download size={14} />
                        </a>
                        {canManage && (
                          <button
                            onClick={() => handleDetach(doc)}
                            className="p-1.5 rounded hover:bg-red-50 text-[#737373] hover:text-red-700"
                            title="Detach document"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Modal */}
      {uploadModalOpen && (
        <Modal
          title={`Upload & Attach to ${targetTitle}`}
          onClose={() => setUploadModalOpen(false)}
        >
          <div className="space-y-4">
            <Field label="Select File (Max 10MB; PDF, JPEG, PNG, WebP)">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={handleFileChange}
                className={inputCls}
              />
            </Field>

            {file && (
              <div className="p-3 bg-[#FAFAF8] border border-[#E8E8E5] rounded-lg text-[12px] flex items-center justify-between">
                <div>
                  <span className="font-semibold text-[#04314A]">{file.name}</span>
                  <span className="text-[#737373] ml-2">({formatFileSize(file.size)})</span>
                </div>
              </div>
            )}

            <Field label="Document Title / Name">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Bill of Lading, Citizenship, Inspection Sheet"
                className={inputCls}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                  className={inputCls}
                >
                  <option value="SHIPMENT">Shipment / Import</option>
                  <option value="VEHICLE_UNIT">Vehicle Unit</option>
                  <option value="CUSTOMER">Customer KYC / Docs</option>
                  <option value="SALE">Sale / Delivery</option>
                  <option value="GENERAL">General / Media</option>
                </select>
              </Field>

              <Field label="Expiry Date (Optional)">
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Notes (Optional)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any specific context or reference notes..."
                rows={2}
                className={inputCls}
              />
            </Field>

            {/* Duplicate File Warning Box */}
            {duplicateWarning && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-[12px] text-amber-900">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <AlertTriangle size={15} className="text-amber-700" />
                  <span>Identical File Detected</span>
                </div>
                <p className="mb-2">{duplicateWarning}</p>
                <label className="flex items-center gap-2 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forceDuplicate}
                    onChange={(e) => setForceDuplicate(e.target.checked)}
                    className="rounded border-[#E8E8E5]"
                  />
                  <span>Upload anyway (bypass duplicate check)</span>
                </label>
              </div>
            )}

            <div data-modal-actions className="flex justify-end gap-2 pt-2 border-t border-[#E8E8E5]">
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-[#E8E8E5] text-[12px] font-semibold text-[#737373] hover:text-[#04314A]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUploadSubmit}
                disabled={submitting || (!!duplicateWarning && !forceDuplicate)}
                className="px-4 py-2 rounded-lg bg-[#04314A] text-white text-[12px] font-semibold hover:bg-[#00AAEB] disabled:opacity-50 transition-colors"
              >
                {submitting ? "Uploading..." : "Upload & Attach"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Link Existing Document Modal */}
      {attachExistingModalOpen && (
        <Modal
          title={`Link Existing Document from Vault`}
          onClose={() => setAttachExistingModalOpen(false)}
          wide
        >
          <div className="space-y-4">
            <Field label="Search Document Vault">
              <input
                value={searchExisting}
                onChange={(e) => setSearchExisting(e.target.value)}
                placeholder="Search by title, notes, or filename..."
                className={inputCls}
              />
            </Field>

            <div className="max-h-64 overflow-y-auto border border-[#E8E8E5] rounded-lg">
              {loadingAvailable ? (
                <div className="p-6 text-center text-[12px] text-[#737373]">
                  Loading vault documents...
                </div>
              ) : filteredAvailable.length === 0 ? (
                <div className="p-6 text-center text-[12px] text-[#737373]">
                  No other documents available in the vault.
                </div>
              ) : (
                <div className="divide-y divide-[#E8E8E5]">
                  {filteredAvailable.map((d) => (
                    <label
                      key={d.id}
                      className={`p-3 flex items-center justify-between gap-3 text-[12px] cursor-pointer hover:bg-[#FAFAF8] ${
                        selectedDocId === d.id ? "bg-[#F0F7FA]" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="existingDoc"
                          checked={selectedDocId === d.id}
                          onChange={() => setSelectedDocId(d.id)}
                        />
                        <div>
                          <div className="font-semibold text-[#04314A]">{d.title}</div>
                          <div className="text-[11px] text-[#737373]">
                            {d.category} · {formatFileSize(d.file_size)} · {d.created_at?.slice(0, 10)}
                          </div>
                        </div>
                      </div>
                      <span className="text-[11px] text-[#A0A09C]">
                        {d.attachments?.length || 0} link(s)
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div data-modal-actions className="flex justify-end gap-2 pt-2 border-t border-[#E8E8E5]">
              <button
                type="button"
                onClick={() => setAttachExistingModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-[#E8E8E5] text-[12px] font-semibold text-[#737373] hover:text-[#04314A]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAttachExistingSubmit}
                disabled={submitting || !selectedDocId}
                className="px-4 py-2 rounded-lg bg-[#04314A] text-white text-[12px] font-semibold hover:bg-[#00AAEB] disabled:opacity-50 transition-colors"
              >
                {submitting ? "Attaching..." : "Link Document"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <Modal
          title={previewDoc.title}
          onClose={() => setPreviewDoc(null)}
          wide
        >
          <div className="space-y-4">
            <div className="border border-[#E8E8E5] rounded-lg overflow-hidden bg-[#FAFAF8] flex items-center justify-center min-h-[300px] max-h-[500px]">
              {isImage(previewDoc.file_type) ? (
                <img
                  src={previewDoc.preview_url}
                  alt={previewDoc.title}
                  className="max-h-[500px] w-auto object-contain"
                />
              ) : (
                <div className="p-8 text-center">
                  <FileText size={48} className="mx-auto text-[#04314A] mb-3" />
                  <p className="font-semibold text-[#04314A]">{previewDoc.title}</p>
                  <p className="text-[12px] text-[#737373] mt-1 mb-4">
                    PDF / Document ({formatFileSize(previewDoc.file_size)})
                  </p>
                  <a
                    href={previewDoc.download_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#04314A] text-white text-[12px] font-semibold hover:bg-[#00AAEB] transition-colors"
                  >
                    <Download size={14} /> Download Document
                  </a>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-[#FAFAF8] rounded-lg text-[11px] text-[#737373]">
              <div>
                <span className="block font-medium text-[#04314A]">Category</span>
                {previewDoc.category}
              </div>
              <div>
                <span className="block font-medium text-[#04314A]">File Size</span>
                {formatFileSize(previewDoc.file_size)}
              </div>
              <div>
                <span className="block font-medium text-[#04314A]">Uploaded</span>
                {previewDoc.created_at?.slice(0, 10)}
              </div>
              <div>
                <span className="block font-medium text-[#04314A]">SHA256 Hash</span>
                <span className="font-mono text-[10px] truncate block" title={previewDoc.file_hash}>
                  {previewDoc.file_hash ? previewDoc.file_hash.slice(0, 12) + "..." : "-"}
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-[#E8E8E5]">
              <a
                href={previewDoc.download_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#00AAEB] hover:underline"
              >
                <Download size={14} /> Download File
              </a>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-2 rounded-lg bg-[#04314A] text-white text-[12px] font-semibold hover:bg-[#00AAEB] transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
