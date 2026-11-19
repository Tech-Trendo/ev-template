import { useState, useRef, type DragEvent, type ChangeEvent } from "react";
import { ImagePlus, Upload, Trash2, ExternalLink, RefreshCw, Link as LinkIcon, Check, Loader2 } from "lucide-react";
import { resolveImg, imgFallback } from "@/lib/cms";

export interface CmsImageFieldProps {
  label: string;
  value: string;
  defaultValue?: string;
  hint?: string;
  onChange: (url: string) => void;
  onUpload: (file: File) => Promise<string>;
  disabled?: boolean;
}

export function CmsImageField({
  label,
  value,
  defaultValue,
  hint,
  onChange,
  onUpload,
  disabled,
}: CmsImageFieldProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayUrl = resolveImg(value);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select a valid image file (JPG, PNG, WebP, SVG).");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const url = await onUpload(file);
      onChange(url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload image.");
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      e.target.value = "";
      void handleFile(file);
    }
  };

  const handleApplyUrl = () => {
    if (urlInput.trim()) {
      onChange(urlInput.trim());
      setShowUrlInput(false);
      setUrlInput("");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#737373]">
          {label}
        </label>
        <div className="flex items-center gap-2">
          {defaultValue && value !== defaultValue && (
            <button
              type="button"
              onClick={() => onChange(defaultValue)}
              title="Reset to default image"
              className="text-[10px] font-semibold text-[#737373] hover:text-[#10B981] flex items-center gap-1 transition-colors"
            >
              <RefreshCw size={10} /> Default
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setShowUrlInput(!showUrlInput);
              if (!showUrlInput) setUrlInput(value || "");
            }}
            className="text-[10px] font-semibold text-[#10B981] hover:text-[#0B3D2B] flex items-center gap-1 transition-colors"
          >
            <LinkIcon size={10} /> {showUrlInput ? "Hide URL" : "Paste URL"}
          </button>
        </div>
      </div>

      {showUrlInput && (
        <div className="flex items-center gap-2 p-2 bg-[#FAFAF8] rounded-xl border border-[#E8E8E5]">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://... or /static/images/..."
            className="flex-1 bg-white border border-[#E8E8E5] rounded-lg px-3 py-1.5 text-[12px] text-[#0B3D2B] focus:outline-none focus:border-[#10B981]"
          />
          <button
            type="button"
            onClick={handleApplyUrl}
            className="px-3 py-1.5 rounded-lg bg-[#10B981] text-white text-[11px] font-bold tracking-[0.04em] uppercase flex items-center gap-1 hover:bg-[#0B3D2B] transition-colors"
          >
            <Check size={12} /> Apply
          </button>
        </div>
      )}

      {value ? (
        /* Image Preview Box */
        <div className="relative group border border-[#E8E8E5] rounded-2xl p-3 bg-[#FAFAF8] flex flex-col sm:flex-row items-start sm:items-center gap-4 transition-all">
          <div
            className="relative w-full sm:w-36 h-24 rounded-xl overflow-hidden bg-[#E8E8E5] border border-[#E0E0DC] flex-shrink-0 cursor-pointer group/img"
            onClick={() => setPreviewOpen(true)}
          >
            <img
              src={displayUrl}
              alt={label}
              className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
              onError={(e) =>
                imgFallback(e, "https://placehold.co/600x400/04314A/ffffff?text=Image+Preview")
              }
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-white text-[11px] font-semibold transition-opacity">
              <ExternalLink size={14} className="mr-1" /> View
            </div>
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch py-1">
            <div>
              <p className="text-[12px] font-semibold text-[#0B3D2B] truncate max-w-full" title={value}>
                {value.split("/").pop() || value}
              </p>
              <p className="text-[11px] text-[#737373] truncate mt-0.5" title={value}>
                {value}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || disabled}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E8E8E5] bg-white text-[11px] font-bold text-[#0B3D2B] hover:border-[#10B981] hover:text-[#10B981] transition-colors disabled:opacity-50"
              >
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                Replace Image
              </button>
              <button
                type="button"
                onClick={() => onChange("")}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-transparent text-[11px] font-bold text-[#B85C5C] hover:bg-[#B85C5C]/10 transition-colors"
              >
                <Trash2 size={12} /> Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Empty / Drop Zone */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
            isDragging
              ? "border-[#10B981] bg-[#10B981]/5 scale-[0.99]"
              : "border-[#E0E0DC] hover:border-[#10B981] bg-[#FAFAF8] hover:bg-[#F4F4F0]"
          }`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-[#10B981]">
              <Loader2 size={24} className="animate-spin" />
              <span className="text-[12px] font-bold tracking-[0.04em] uppercase">Uploading image…</span>
            </div>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-white border border-[#E8E8E5] shadow-xs flex items-center justify-center text-[#0B3D2B] mb-3">
                <ImagePlus size={20} />
              </div>
              <p className="text-[12px] font-bold text-[#0B3D2B] tracking-[0.02em]">
                Click to upload or drag & drop
              </p>
              <p className="text-[11px] text-[#737373] mt-1">
                Supports WebP, PNG, JPG, or SVG (Up to 10MB)
              </p>
            </>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {uploadError && (
        <p className="text-[11px] text-[#B85C5C] font-semibold flex items-center gap-1">
          ⚠ {uploadError}
        </p>
      )}

      {hint && <p className="text-[11px] text-[#737373]">{hint}</p>}

      {/* Full preview lightbox modal */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewOpen(false)}
        >
          <div className="relative max-w-4xl max-h-[85vh] bg-white rounded-2xl overflow-hidden shadow-2xl p-2" onClick={(e) => e.stopPropagation()}>
            <img
              src={displayUrl}
              alt={label}
              className="max-h-[75vh] w-auto object-contain rounded-xl"
            />
            <div className="p-3 flex items-center justify-between">
              <span className="text-[12px] font-bold text-[#0B3D2B] truncate">{label}</span>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="px-3 py-1 bg-[#0B3D2B] text-white text-[11px] font-bold rounded-full hover:bg-[#10B981] transition-colors"
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
