import { useState, useRef } from "react";
import {
  Monitor,
  Tablet,
  Smartphone,
  RotateCcw,
  ExternalLink,
  X,
} from "lucide-react";

export interface CmsLivePreviewProps {
  sitePath: string;
  pageTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

type DeviceMode = "desktop" | "tablet" | "mobile";

export function CmsLivePreview({
  sitePath,
  pageTitle,
  isOpen,
  onClose,
}: CmsLivePreviewProps) {
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [refreshKey, setRefreshKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  if (!isOpen) return null;

  const getContainerWidth = () => {
    switch (device) {
      case "mobile":
        return "w-[390px] h-[780px]";
      case "tablet":
        return "w-[768px] h-[850px]";
      case "desktop":
      default:
        return "w-full h-full";
    }
  };

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex flex-col p-3 sm:p-6 animate-in fade-in duration-200"
    >
      {/* Top Controller Bar */}
      <div className="w-full bg-[#04314A] text-white rounded-2xl px-5 py-3.5 mb-4 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#00AAEB] animate-pulse" />
          <span className="text-[13px] font-black tracking-[0.06em] uppercase">
            Live Preview: {pageTitle}
          </span>
          <span className="hidden sm:inline-block text-[11px] text-white/50 border-l border-white/20 pl-3">
            {sitePath}
          </span>
        </div>

        {/* Device Switcher */}
        <div className="flex items-center gap-1 bg-white/10 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setDevice("desktop")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
              device === "desktop" ? "bg-[#00AAEB] text-white shadow-xs" : "text-white/60 hover:text-white"
            }`}
          >
            <Monitor size={14} />
            <span className="hidden md:inline">Desktop</span>
          </button>
          <button
            type="button"
            onClick={() => setDevice("tablet")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
              device === "tablet" ? "bg-[#00AAEB] text-white shadow-xs" : "text-white/60 hover:text-white"
            }`}
          >
            <Tablet size={14} />
            <span className="hidden md:inline">Tablet</span>
          </button>
          <button
            type="button"
            onClick={() => setDevice("mobile")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
              device === "mobile" ? "bg-[#00AAEB] text-white shadow-xs" : "text-white/60 hover:text-white"
            }`}
          >
            <Smartphone size={14} />
            <span className="hidden md:inline">Mobile</span>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            title="Reload preview"
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <RotateCcw size={14} />
          </button>
          <a
            href={sitePath}
            target="_blank"
            rel="noreferrer"
            title="Open in new tab"
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <ExternalLink size={14} />
          </a>
          <button
            type="button"
            onClick={onClose}
            title="Close preview"
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-[#B85C5C] flex items-center justify-center text-white transition-colors ml-1"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Frame Container */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`bg-white rounded-2xl shadow-2xl overflow-hidden border border-white/20 transition-all duration-300 flex flex-col ${getContainerWidth()}`}
        >
          {device !== "desktop" && (
            <div className="bg-[#E8E8E5] px-4 py-2 flex items-center justify-between text-[11px] text-[#737373] font-medium border-b border-[#D0D0CB]">
              <span>{device === "mobile" ? "Mobile (390px)" : "Tablet (768px)"} Viewport</span>
              <span className="text-[10px] font-medium">VT Responsive Engine</span>
            </div>
          )}
          <iframe
            key={refreshKey}
            ref={iframeRef}
            src={sitePath}
            title={`Preview of ${pageTitle}`}
            className="w-full flex-1 border-0 bg-[#F7F7F5]"
          />
        </div>
      </div>
    </div>
  );
}
