import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  File,
  FileText,
  Filter,
  Grid,
  History,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  Upload,
  User,
  X,
  ExternalLink,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAuth } from "../AuthContext";
import {
  createDocument,
  deleteDocument,
  fetchDocuments,
  fetchDocumentTypes,
  formatFileSize,
  recordDocumentPrint,
  replaceDocumentFile,
  updateDocument,
  DOCUMENT_CATEGORY_LABELS,
  type DocumentCategory,
  type DocumentTypeMaster,
  type VaultDocument,
} from "@/lib/documents";
import { Modal, Field, inputCls, Badge, useToast } from "../crm/ui";

type TabMode = "media" | "document";
type ViewMode = "grid" | "list";

function withQueryParam(url: string, key: string, value: string): string {
  const u = new URL(url, window.location.origin);
  u.searchParams.set(key, value);
  return u.toString();
}

export default function LibraryPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { hasPerm, me } = useAuth();
  const canAdd = hasPerm("crm.add_document");
  const canChange = hasPerm("crm.change_document");
  const canDelete = hasPerm("crm.delete_document");

  const [activeTab, setActiveTab] = useState<TabMode>("document");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Modals & Drawers
  const [selectedDoc, setSelectedDoc] = useState<VaultDocument | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [replaceModalDoc, setReplaceModalDoc] = useState<VaultDocument | null>(null);
  const [editModalDoc, setEditModalDoc] = useState<VaultDocument | null>(null);
  const [deleteModalDoc, setDeleteModalDoc] = useState<VaultDocument | null>(null);

  // Upload state (multi-upload support)
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>("GENERAL");
  const [uploadExpiry, setUploadExpiry] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");

  // Replace file state
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [replaceChangeNote, setReplaceChangeNote] = useState("");
  const [replacing, setReplacing] = useState(false);

  // Edit metadata state
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState<DocumentCategory>("GENERAL");
  const [editExpiryDate, setEditExpiryDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editingBusy, setEditingBusy] = useState(false);

  // Soft delete state
  const [deleteReason, setDeleteReason] = useState("");
  const [confirmInUse, setConfirmInUse] = useState(false);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    setError("");
    const params: Record<string, string | number> = {
      tab: activeTab,
    };
    if (search.trim()) params.search = search.trim();
    if (categoryFilter !== "ALL") params.category = categoryFilter;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;

    fetchDocuments(params)
      .then((docs) => {
        setDocuments(docs);
        if (selectedDoc) {
          const updated = docs.find((d) => d.id === selectedDoc.id);
          if (updated) setSelectedDoc(updated);
        }
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load documents"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [activeTab, categoryFilter, dateFrom, dateTo]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search]);

  const kpis = useMemo(() => {
    const total = documents.length;
    const expiringSoon = documents.filter((d) => d.expiry_status === "EXPIRING_SOON").length;
    const expired = documents.filter((d) => d.expiry_status === "EXPIRED").length;
    const inUse = documents.filter((d) => d.attachments && d.attachments.length > 0).length;
    return { total, expiringSoon, expired, inUse };
  }, [documents]);

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate size and types
    const valid: File[] = [];
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024) {
        toast.push(`File "${f.name}" exceeds 10MB limit and was skipped.`);
        continue;
      }
      valid.push(f);
    }
    setUploadFiles(valid);
  };

  const handleMultiUploadSubmit = async () => {
    if (uploadFiles.length === 0) {
      toast.push("Please select at least one file to upload.");
      return;
    }
    setUploading(true);
    setError("");
    let successCount = 0;
    let duplicateWarnings = 0;

    for (let i = 0; i < uploadFiles.length; i++) {
      const f = uploadFiles[i];
      setUploadProgress(`Uploading ${i + 1} of ${uploadFiles.length}: ${f.name}...`);
      const fd = new FormData();
      fd.append("file", f);
      fd.append("title", f.name.replace(/\.[^/.]+$/, ""));
      fd.append("category", uploadCategory);
      if (uploadExpiry) fd.append("expiry_date", uploadExpiry);
      if (uploadNotes) fd.append("notes", uploadNotes);

      try {
        await createDocument(fd);
        successCount++;
      } catch (err: any) {
        const d = err instanceof ApiError ? (err.detail as any) : null;
        if (err instanceof ApiError && err.status === 409 && d?.duplicate_warning) {
          duplicateWarnings++;
          // Auto force if batch upload
          fd.append("force_duplicate", "true");
          try {
            await createDocument(fd);
            successCount++;
          } catch {
            // failed
          }
        }
      }
    }

    toast.push(`Successfully uploaded ${successCount} file(s).`);
    setUploading(false);
    setUploadModalOpen(false);
    setUploadFiles([]);
    load();
  };

  const openReplaceModal = (doc: VaultDocument) => {
    setReplaceModalDoc(doc);
    setReplacementFile(null);
    setReplaceChangeNote("");
  };

  const handleReplaceSubmit = async () => {
    if (!replaceModalDoc || !replacementFile) return;
    setReplacing(true);
    try {
      const fd = new FormData();
      fd.append("file", replacementFile);
      if (replaceChangeNote) fd.append("change_note", replaceChangeNote);

      const updated = await replaceDocumentFile(replaceModalDoc.id, fd);
      toast.push("File replaced and previous version archived.");
      setReplaceModalDoc(null);
      setSelectedDoc(updated);
      load();
    } catch (e: any) {
      toast.push(e instanceof ApiError ? e.message : "Failed to replace file.");
    } finally {
      setReplacing(false);
    }
  };

  const openEditModal = (doc: VaultDocument) => {
    setEditModalDoc(doc);
    setEditTitle(doc.title);
    setEditCategory(doc.category);
    setEditExpiryDate(doc.expiry_date || "");
    setEditNotes(doc.notes || "");
  };

  const handleEditSubmit = async () => {
    if (!editModalDoc) return;
    setEditingBusy(true);
    try {
      const updated = await updateDocument(editModalDoc.id, {
        title: editTitle,
        category: editCategory,
        expiry_date: editExpiryDate || null,
        notes: editNotes,
      });
      toast.push("Document details updated.");
      setEditModalDoc(null);
      if (selectedDoc?.id === updated.id) setSelectedDoc(updated);
      load();
    } catch (e: any) {
      toast.push(e instanceof ApiError ? e.message : "Failed to update document.");
    } finally {
      setEditingBusy(false);
    }
  };

  const openDeleteModal = (doc: VaultDocument) => {
    setDeleteModalDoc(doc);
    setDeleteReason("");
    setConfirmInUse(false);
  };

  const handleDeleteSubmit = async () => {
    if (!deleteModalDoc || !deleteReason.trim()) {
      toast.push("Please provide a deletion reason.");
      return;
    }
    setDeletingBusy(true);
    try {
      const res = await deleteDocument(deleteModalDoc.id, deleteReason, confirmInUse);
      if (res.in_use_warning && !confirmInUse) {
        setConfirmInUse(true);
        toast.push(`Warning: ${res.usage_count} records are linked to this document. Check confirm to delete.`);
        setDeletingBusy(false);
        return;
      }
      toast.push("Document soft deleted.");
      if (selectedDoc?.id === deleteModalDoc.id) setSelectedDoc(null);
      setDeleteModalDoc(null);
      load();
    } catch (e: any) {
      toast.push(e instanceof ApiError ? e.message : "Failed to delete document.");
    } finally {
      setDeletingBusy(false);
    }
  };

  const handlePrint = (doc: VaultDocument) => {
    recordDocumentPrint(doc.id, { notes: `User previewed document ${doc.title}` }).catch(() => {});
    window.open(doc.preview_url, "_blank");
  };

  const isImage = (type: string) => type.startsWith("image/");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-[#0B3D2B]">Media & Document Library.</h1>
          <p className="text-[13px] text-[#737373]">
            Centralized document vault for shipments, vehicle units, customer KYC, and promotional media.
          </p>
        </div>

        {canAdd && (
          <button
            onClick={() => {
              setUploadFiles([]);
              setUploadCategory(activeTab === "media" ? "GENERAL" : "SHIPMENT");
              setUploadExpiry("");
              setUploadNotes("");
              setUploadModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0B3D2B] text-white text-[12px] font-semibold hover:bg-[#10B981] transition-colors self-start sm:self-auto"
          >
            <Plus size={14} /> Upload Files
          </button>
        )}
      </div>

      {/* KPI Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E8E8E5] rounded-xl p-3.5">
          <div className="text-[11px] text-[#737373]">Total {activeTab === "media" ? "Media Files" : "Documents"}</div>
          <div className="text-[22px] font-bold text-[#0B3D2B] mt-0.5">{kpis.total}</div>
        </div>
        <div className="bg-white border border-[#E8E8E5] rounded-xl p-3.5">
          <div className="text-[11px] text-[#737373]">Linked to Records</div>
          <div className="text-[22px] font-bold text-[#0B3D2B] mt-0.5">{kpis.inUse}</div>
        </div>
        <div className="bg-white border border-[#E8E8E5] rounded-xl p-3.5">
          <div className="text-[11px] text-[#737373]">Expiring Soon (&le;30d)</div>
          <div className="text-[22px] font-bold text-amber-600 mt-0.5">{kpis.expiringSoon}</div>
        </div>
        <div className="bg-white border border-[#E8E8E5] rounded-xl p-3.5">
          <div className="text-[11px] text-[#737373]">Expired</div>
          <div className="text-[22px] font-bold text-red-600 mt-0.5">{kpis.expired}</div>
        </div>
      </div>

      {/* Tabs & Controls */}
      <div className="bg-white border border-[#E8E8E5] rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        {/* Main Tabs */}
        <div className="flex items-center border border-[#E8E8E5] rounded-lg p-0.5 bg-[#F7F7F5]">
          <button
            onClick={() => setActiveTab("document")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
              activeTab === "document"
                ? "bg-white text-[#0B3D2B] shadow-sm"
                : "text-[#737373] hover:text-[#0B3D2B]"
            }`}
          >
            <FileText size={14} /> Document Library
          </button>
          <button
            onClick={() => setActiveTab("media")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
              activeTab === "media"
                ? "bg-white text-[#0B3D2B] shadow-sm"
                : "text-[#737373] hover:text-[#0B3D2B]"
            }`}
          >
            <ImageIcon size={14} /> Media Library
          </button>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center border border-[#E8E8E5] rounded-lg p-0.5 bg-[#F7F7F5]">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded text-[12px] ${
              viewMode === "grid" ? "bg-white text-[#0B3D2B] shadow-sm" : "text-[#737373]"
            }`}
            title="Grid View"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded text-[12px] ${
              viewMode === "list" ? "bg-white text-[#0B3D2B] shadow-sm" : "text-[#737373]"
            }`}
            title="List View"
          >
            <List size={15} />
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-[#E8E8E5] rounded-xl p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#737373]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, filename, notes..."
            className="w-full border border-[#E8E8E5] rounded-lg pl-9 pr-3 py-1.5 text-[12px] text-[#0B3D2B] placeholder:text-[#A0A09C] focus:outline-none focus:border-[#10B981]"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="border border-[#E8E8E5] rounded-lg px-3 py-1.5 text-[12px] text-[#0B3D2B] focus:outline-none focus:border-[#10B981]"
        >
          <option value="ALL">All Categories</option>
          {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([cat, label]) => (
            <option key={cat} value={cat}>
              {label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-[#E8E8E5] rounded-lg px-2.5 py-1.5 text-[12px] text-[#0B3D2B] focus:outline-none focus:border-[#10B981]"
            title="From date"
          />
          <span className="text-[#A0A09C] text-[12px]">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-[#E8E8E5] rounded-lg px-2.5 py-1.5 text-[12px] text-[#0B3D2B] focus:outline-none focus:border-[#10B981]"
            title="To date"
          />
        </div>

        {(search || categoryFilter !== "ALL" || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setSearch("");
              setCategoryFilter("ALL");
              setDateFrom("");
              setDateTo("");
            }}
            className="text-[12px] text-[#10B981] hover:underline"
          >
            Reset
          </button>
        )}

        <button
          onClick={load}
          className="ml-auto flex items-center gap-1 px-3 py-1.5 border border-[#E8E8E5] rounded-lg text-[12px] text-[#737373] hover:text-[#0B3D2B]"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-[12px]">
          {error}
        </div>
      )}

      {/* Main Content: Grid or List */}
      {loading ? (
        <div className="py-20 text-center text-[13px] text-[#737373]">Loading items...</div>
      ) : documents.length === 0 ? (
        <div className="bg-white border border-[#E8E8E5] rounded-xl p-12 text-center text-[#737373]">
          <FileText size={36} className="mx-auto text-[#A0A09C] mb-2" />
          <p className="font-semibold text-[#0B3D2B]">No {activeTab === "media" ? "media" : "documents"} found</p>
          <p className="text-[12px] text-[#737373] mt-1">Upload files or adjust filters to view items.</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {documents.map((doc) => {
            const img = isImage(doc.file_type);
            const isSelected = selectedDoc?.id === doc.id;
            return (
              <div
                key={doc.id}
                onClick={() => setSelectedDoc(doc)}
                className={`bg-white border rounded-xl overflow-hidden cursor-pointer transition-all hover:border-[#10B981] flex flex-col ${
                  isSelected ? "border-[#10B981] ring-2 ring-[#10B981]/20" : "border-[#E8E8E5]"
                }`}
              >
                {/* Thumbnail */}
                <div className="h-36 bg-[#FAFAF8] border-b border-[#E8E8E5] flex items-center justify-center overflow-hidden relative">
                  {img ? (
                    <img
                      src={doc.preview_url}
                      alt={doc.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="text-center p-3">
                      <FileText size={32} className="mx-auto text-[#0B3D2B] mb-1" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#737373]">
                        {doc.file_type.split("/")[1] || "PDF"}
                      </span>
                    </div>
                  )}

                  {doc.attachments && doc.attachments.length > 0 && (
                    <span className="absolute top-2 right-2 bg-[#0B3D2B] text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                      {doc.attachments.length} link{doc.attachments.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="p-3 flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="text-[12px] font-bold text-[#0B3D2B] line-clamp-1" title={doc.title}>
                      {doc.title}
                    </h4>
                    <p className="text-[11px] text-[#737373] mt-0.5">
                      {DOCUMENT_CATEGORY_LABELS[doc.category] || doc.category}
                    </p>
                  </div>

                  <div className="mt-2 pt-2 border-t border-[#F0F0ED] flex items-center justify-between text-[10px] text-[#A0A09C]">
                    <span>{formatFileSize(doc.file_size)}</span>
                    {doc.expiry_date ? (
                      <span
                        className={`font-semibold ${
                          doc.expiry_status === "EXPIRED"
                            ? "text-red-600"
                            : doc.expiry_status === "EXPIRING_SOON"
                            ? "text-amber-600"
                            : "text-emerald-600"
                        }`}
                      >
                        {doc.expiry_date}
                      </span>
                    ) : (
                      <span>{doc.created_at?.slice(0, 10)}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-[#E8E8E5] bg-[#F7F7F5] text-[11px] font-semibold text-[#737373]">
                  <th className="px-4 py-3">File / Title</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Expiry</th>
                  <th className="px-4 py-3">Linked Records</th>
                  <th className="px-4 py-3">Uploaded</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => {
                  const img = isImage(doc.file_type);
                  return (
                    <tr
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className="border-b border-[#F0F0ED] hover:bg-[#FAFAF8] cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-[#F0F0ED] flex items-center justify-center text-[#0B3D2B] shrink-0">
                            {img ? <ImageIcon size={16} /> : <FileText size={16} />}
                          </div>
                          <div>
                            <div className="font-bold text-[#0B3D2B]">{doc.title}</div>
                            {doc.notes && <div className="text-[11px] text-[#737373] line-clamp-1">{doc.notes}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#737373]">
                        {DOCUMENT_CATEGORY_LABELS[doc.category] || doc.category}
                      </td>
                      <td className="px-4 py-3 text-[#737373] whitespace-nowrap">
                        {formatFileSize(doc.file_size)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {doc.expiry_date ? (
                          <span
                            className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              doc.expiry_status === "EXPIRED"
                                ? "bg-red-100 text-red-800"
                                : doc.expiry_status === "EXPIRING_SOON"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {doc.expiry_date}
                          </span>
                        ) : (
                          <span className="text-[#A0A09C]">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#737373]">
                        {doc.attachments && doc.attachments.length > 0 ? (
                          <span className="font-semibold text-[#0B3D2B]">
                            {doc.attachments.length} record{doc.attachments.length > 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="text-[#A0A09C]">Unlinked</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#737373] whitespace-nowrap">
                        <div>{doc.uploaded_by_name || "Staff"}</div>
                        <div className="text-[11px] text-[#A0A09C]">{doc.created_at?.slice(0, 10)}</div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setSelectedDoc(doc)}
                            className="p-1.5 rounded hover:bg-[#F0F0ED] text-[#0B3D2B]"
                            title="Preview"
                          >
                            <Eye size={14} />
                          </button>
                          <a
                            href={doc.download_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded hover:bg-[#F0F0ED] text-[#0B3D2B]"
                            title="Download"
                          >
                            <Download size={14} />
                          </a>
                          {canChange && (
                            <button
                              onClick={() => openEditModal(doc)}
                              className="p-1.5 rounded hover:bg-[#F0F0ED] text-[#737373] hover:text-[#0B3D2B]"
                              title="Edit Details"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => openDeleteModal(doc)}
                              className="p-1.5 rounded hover:bg-red-50 text-[#737373] hover:text-red-700"
                              title="Delete"
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
        </div>
      )}

      {/* Selected Document Drawer / Modal */}
      {selectedDoc && (
        <Modal
          title={selectedDoc.title}
          onClose={() => setSelectedDoc(null)}
          wide
        >
          <div className="space-y-5">
            {/* Main Preview Container */}
            <div className="border border-[#E8E8E5] rounded-xl overflow-hidden bg-[#FAFAF8] flex items-center justify-center min-h-[250px] max-h-[420px]">
              {isImage(selectedDoc.file_type) ? (
                <img
                  src={selectedDoc.preview_url}
                  alt={selectedDoc.title}
                  className="max-h-[420px] w-auto object-contain"
                />
              ) : (
                <div className="p-8 text-center">
                  <FileText size={48} className="mx-auto text-[#0B3D2B] mb-3" />
                  <p className="font-bold text-[#0B3D2B] text-[15px]">{selectedDoc.title}</p>
                  <p className="text-[12px] text-[#737373] mt-1 mb-4">
                    PDF Document ({formatFileSize(selectedDoc.file_size)})
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <a
                      href={selectedDoc.download_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0B3D2B] text-white text-[12px] font-semibold hover:bg-[#10B981] transition-colors"
                    >
                      <Download size={14} /> Download Document
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#FAFAF8] rounded-xl border border-[#E8E8E5]">
              <div className="flex items-center gap-2">
                <a
                  href={selectedDoc.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E8E8E5] bg-white text-[12px] font-semibold text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors"
                >
                  <Download size={13} /> Download
                </a>
                <button
                  onClick={() => handlePrint(selectedDoc)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E8E8E5] bg-white text-[12px] font-semibold text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors"
                >
                  <Eye size={13} /> Open Tab
                </button>
              </div>

              <div className="flex items-center gap-2">
                {canChange && (
                  <>
                    <button
                      onClick={() => openReplaceModal(selectedDoc)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#0B3D2B] text-[12px] font-semibold text-[#0B3D2B] hover:bg-[#0B3D2B] hover:text-white transition-colors"
                    >
                      <History size={13} /> Replace File
                    </button>
                    <button
                      onClick={() => openEditModal(selectedDoc)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E8E8E5] bg-white text-[12px] font-semibold text-[#737373] hover:text-[#0B3D2B] transition-colors"
                    >
                      <Pencil size={13} /> Edit Info
                    </button>
                  </>
                )}
                {canDelete && (
                  <button
                    onClick={() => openDeleteModal(selectedDoc)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-[12px] font-semibold text-red-700 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                )}
              </div>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
              <div className="p-3 bg-[#FAFAF8] rounded-xl">
                <span className="block text-[11px] text-[#737373]">Category</span>
                <span className="font-semibold text-[#0B3D2B]">
                  {DOCUMENT_CATEGORY_LABELS[selectedDoc.category] || selectedDoc.category}
                </span>
              </div>
              <div className="p-3 bg-[#FAFAF8] rounded-xl">
                <span className="block text-[11px] text-[#737373]">File Size</span>
                <span className="font-semibold text-[#0B3D2B]">{formatFileSize(selectedDoc.file_size)}</span>
              </div>
              <div className="p-3 bg-[#FAFAF8] rounded-xl">
                <span className="block text-[11px] text-[#737373]">Uploaded By</span>
                <span className="font-semibold text-[#0B3D2B]">{selectedDoc.uploaded_by_name || "Staff"}</span>
              </div>
              <div className="p-3 bg-[#FAFAF8] rounded-xl">
                <span className="block text-[11px] text-[#737373]">Expiry Status</span>
                <span
                  className={`font-semibold ${
                    selectedDoc.expiry_status === "EXPIRED"
                      ? "text-red-600"
                      : selectedDoc.expiry_status === "EXPIRING_SOON"
                      ? "text-amber-600"
                      : "text-emerald-600"
                  }`}
                >
                  {selectedDoc.expiry_date || "No Expiry"}
                </span>
              </div>
            </div>

            {selectedDoc.notes && (
              <div className="p-3 bg-[#FAFAF8] rounded-xl text-[12px]">
                <span className="block text-[11px] font-semibold text-[#737373] mb-1">Notes</span>
                <p className="text-[#0B3D2B]">{selectedDoc.notes}</p>
              </div>
            )}

            {/* Used in Entities Section */}
            <div className="border border-[#E8E8E5] rounded-xl p-4">
              <h4 className="text-[13px] font-bold text-[#0B3D2B] mb-2 flex items-center justify-between">
                <span>Used in Records ({selectedDoc.used_in?.length || 0})</span>
              </h4>
              {(!selectedDoc.used_in || selectedDoc.used_in.length === 0) ? (
                <p className="text-[12px] text-[#737373]">This document is not currently attached to any shipment, unit, customer, or sale.</p>
              ) : (
                <div className="divide-y divide-[#F0F0ED]">
                  {selectedDoc.used_in.map((item, idx) => (
                    <div key={idx} className="py-2 flex items-center justify-between text-[12px]">
                      <div>
                        <span className="font-semibold text-[#0B3D2B]">{item.summary}</span>
                        <span className="text-[11px] text-[#737373] ml-2 uppercase">({item.type})</span>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedDoc(null);
                          if (item.type === "SHIPMENT") onNavigate(`batches/${item.id}`);
                          else if (item.type === "UNIT") onNavigate(`units/${item.id}`);
                          else if (item.type === "CUSTOMER") onNavigate(`crm-customers/${item.id}`);
                        }}
                        className="text-[12px] font-semibold text-[#10B981] hover:underline flex items-center gap-1"
                      >
                        View Record &rarr;
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Version History Section */}
            {selectedDoc.versions && selectedDoc.versions.length > 0 && (
              <div className="border border-[#E8E8E5] rounded-xl p-4">
                <h4 className="text-[13px] font-bold text-[#0B3D2B] mb-2">
                  Version History ({selectedDoc.versions.length} prior version{selectedDoc.versions.length > 1 ? "s" : ""})
                </h4>
                <div className="divide-y divide-[#F0F0ED]">
                  {selectedDoc.versions.map((ver) => (
                    <div key={ver.id} className="py-2.5 flex items-center justify-between text-[12px]">
                      <div>
                        <div className="font-semibold text-[#0B3D2B]">Version {ver.version_no}</div>
                        <div className="text-[11px] text-[#737373]">
                          {formatFileSize(ver.file_size)} · {ver.change_note} · {ver.created_at?.slice(0, 10)}
                        </div>
                      </div>
                      <a
                        href={withQueryParam(selectedDoc.download_url, "version", String(ver.version_no))}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] font-semibold text-[#10B981] hover:underline inline-flex items-center gap-1"
                      >
                        <Download size={12} /> Download v{ver.version_no}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Multi-Upload Modal */}
      {uploadModalOpen && (
        <Modal
          title="Upload Files to Vault"
          onClose={() => setUploadModalOpen(false)}
          wide
        >
          <div className="space-y-4">
            <Field label="Choose Files (Max 10MB each; PDF, JPEG, PNG, WebP)">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={handleFilesSelected}
                className={inputCls}
              />
            </Field>

            {uploadFiles.length > 0 && (
              <div className="p-3 bg-[#FAFAF8] border border-[#E8E8E5] rounded-xl">
                <span className="block font-bold text-[12px] text-[#0B3D2B] mb-2">
                  {uploadFiles.length} file(s) ready to upload:
                </span>
                <ul className="divide-y divide-[#E8E8E5] max-h-40 overflow-y-auto text-[11px] text-[#737373]">
                  {uploadFiles.map((f, i) => (
                    <li key={i} className="py-1 flex items-center justify-between">
                      <span className="truncate pr-2">{f.name}</span>
                      <span className="shrink-0">{formatFileSize(f.size)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Default Category">
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value as DocumentCategory)}
                  className={inputCls}
                >
                  {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([cat, label]) => (
                    <option key={cat} value={cat}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Default Expiry Date (Optional)">
                <input
                  type="date"
                  value={uploadExpiry}
                  onChange={(e) => setUploadExpiry(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Notes (Optional)">
              <textarea
                value={uploadNotes}
                onChange={(e) => setUploadNotes(e.target.value)}
                placeholder="Reference context for these files..."
                rows={2}
                className={inputCls}
              />
            </Field>

            {uploadProgress && (
              <div className="p-3 bg-[#F0F7FA] border border-[#10B981]/20 rounded-xl text-[12px] text-[#0B3D2B] font-semibold">
                {uploadProgress}
              </div>
            )}

            <div data-modal-actions className="flex justify-end gap-2 pt-2 border-t border-[#E8E8E5]">
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-[#E8E8E5] text-[12px] font-semibold text-[#737373] hover:text-[#0B3D2B]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMultiUploadSubmit}
                disabled={uploading || uploadFiles.length === 0}
                className="px-4 py-2 rounded-lg bg-[#0B3D2B] text-white text-[12px] font-semibold hover:bg-[#10B981] disabled:opacity-50 transition-colors"
              >
                {uploading ? "Uploading..." : `Upload ${uploadFiles.length} File(s)`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Replace File Modal */}
      {replaceModalDoc && (
        <Modal
          title={`Replace File for "${replaceModalDoc.title}"`}
          onClose={() => setReplaceModalDoc(null)}
        >
          <div className="space-y-4">
            <p className="text-[12px] text-[#737373]">
              Uploading a replacement will preserve the existing file in the version history.
            </p>

            <Field label="New Replacement File (Max 10MB)">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setReplacementFile(e.target.files?.[0] || null)}
                className={inputCls}
              />
            </Field>

            <Field label="Change / Version Note (Optional)">
              <input
                value={replaceChangeNote}
                onChange={(e) => setReplaceChangeNote(e.target.value)}
                placeholder="e.g. Revised invoice from customs clearance"
                className={inputCls}
              />
            </Field>

            <div data-modal-actions className="flex justify-end gap-2 pt-2 border-t border-[#E8E8E5]">
              <button
                type="button"
                onClick={() => setReplaceModalDoc(null)}
                className="px-4 py-2 rounded-lg border border-[#E8E8E5] text-[12px] font-semibold text-[#737373] hover:text-[#0B3D2B]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReplaceSubmit}
                disabled={replacing || !replacementFile}
                className="px-4 py-2 rounded-lg bg-[#0B3D2B] text-white text-[12px] font-semibold hover:bg-[#10B981] disabled:opacity-50 transition-colors"
              >
                {replacing ? "Replacing..." : "Replace & Archive Previous"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Metadata Modal */}
      {editModalDoc && (
        <Modal
          title={`Edit Details: ${editModalDoc.title}`}
          onClose={() => setEditModalDoc(null)}
        >
          <div className="space-y-4">
            <Field label="Document Title">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className={inputCls}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as DocumentCategory)}
                  className={inputCls}
                >
                  {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([cat, label]) => (
                    <option key={cat} value={cat}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Expiry Date">
                <input
                  type="date"
                  value={editExpiryDate}
                  onChange={(e) => setEditExpiryDate(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Notes">
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                className={inputCls}
              />
            </Field>

            <div data-modal-actions className="flex justify-end gap-2 pt-2 border-t border-[#E8E8E5]">
              <button
                type="button"
                onClick={() => setEditModalDoc(null)}
                className="px-4 py-2 rounded-lg border border-[#E8E8E5] text-[12px] font-semibold text-[#737373] hover:text-[#0B3D2B]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEditSubmit}
                disabled={editingBusy}
                className="px-4 py-2 rounded-lg bg-[#0B3D2B] text-white text-[12px] font-semibold hover:bg-[#10B981] disabled:opacity-50 transition-colors"
              >
                {editingBusy ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Soft Delete Modal with Reason */}
      {deleteModalDoc && (
        <Modal
          title={`Delete Document: ${deleteModalDoc.title}`}
          onClose={() => setDeleteModalDoc(null)}
        >
          <div className="space-y-4">
            {deleteModalDoc.attachments && deleteModalDoc.attachments.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-[12px] text-red-900">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <AlertTriangle size={15} className="text-red-700" />
                  <span>Warning: Document is Currently In Use</span>
                </div>
                <p>
                  This file is attached to {deleteModalDoc.attachments.length} record(s). Deleting it will soft delete the document from the vault.
                </p>
                <label className="flex items-center gap-2 font-semibold mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmInUse}
                    onChange={(e) => setConfirmInUse(e.target.checked)}
                    className="rounded border-[#E8E8E5]"
                  />
                  <span>I confirm deletion despite active attachments</span>
                </label>
              </div>
            )}

            <Field label="Reason for deletion (Required)">
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="State the reason why this document is being removed..."
                rows={3}
                className={inputCls}
                required
              />
            </Field>

            <div data-modal-actions className="flex justify-end gap-2 pt-2 border-t border-[#E8E8E5]">
              <button
                type="button"
                onClick={() => setDeleteModalDoc(null)}
                className="px-4 py-2 rounded-lg border border-[#E8E8E5] text-[12px] font-semibold text-[#737373] hover:text-[#0B3D2B]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSubmit}
                disabled={deletingBusy || !deleteReason.trim()}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-[12px] font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deletingBusy ? "Deleting..." : "Confirm Soft Delete"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
