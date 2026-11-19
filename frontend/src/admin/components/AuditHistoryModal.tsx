"use client";

import { useEffect, useState } from "react";
import { History, X, Loader2, User, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";

export interface AuditLogEntry {
  id: number;
  model_name: string;
  object_id: string;
  field_name: string;
  old_value: string;
  new_value: string;
  action?: string;
  summary?: string;
  ip_address?: string | null;
  changed_by: number | null;
  changed_by_username: string;
  changed_by_name: string;
  source: string;
  timestamp: string;
}

export default function AuditHistoryModal({
  isOpen,
  onClose,
  modelName,
  objectId,
  title,
}: {
  isOpen: boolean;
  onClose: () => void;
  modelName: string;
  objectId: string | number;
  title?: string;
}) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    api<AuditLogEntry[] | { results: AuditLogEntry[] }>(
      `/api/audit-logs/?model=${encodeURIComponent(modelName)}&object_id=${encodeURIComponent(
        String(objectId)
      )}`
    )
      .then((data) => {
        const list = Array.isArray(data) ? data : data.results || [];
        setLogs(list);
      })
      .catch(() => {
        setLogs([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, modelName, objectId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        className="w-full max-w-2xl bg-white border border-[#E8E8E5] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-modal-title"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#FAFAF8] border-b border-[#E8E8E5] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#04314A] text-white flex items-center justify-center">
              <History size={16} />
            </div>
            <div>
              <h3 id="audit-modal-title" className="text-[14px] font-bold text-[#04314A]">
                {title || `Change History: ${modelName} #${objectId}`}
              </h3>
              <p className="text-[11px] text-[#737373]">
                Audit ledger of sensitive edits and status updates
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#737373] hover:text-[#04314A] hover:bg-[#E8E8E5]/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00AAEB]"
            aria-label="Close change history modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="py-12 text-center text-[13px] text-[#737373] flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin text-[#00AAEB]" />
              Loading change history...
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-[14px] font-bold text-[#04314A]">No changes recorded</p>
              <p className="text-[12px] text-[#737373] mt-1">
                No audited modifications found for this record.
              </p>
            </div>
          ) : (
            <div className="border border-[#E8E8E5] rounded-xl overflow-hidden divide-y divide-[#E8E8E5]">
              {logs.map((log) => {
                const dateStr = new Date(log.timestamp).toLocaleString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <div key={log.id} className="p-4 bg-white hover:bg-[#FAFAF8] transition-colors">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold tracking-[0.06em] uppercase px-2 py-0.5 rounded bg-[#04314A] text-white">
                          {log.source}
                        </span>
                        <span className="text-[12px] font-bold text-[#04314A]">
                          {log.field_name}
                        </span>
                      </div>
                      <span className="text-[11px] text-[#737373]">{dateStr}</span>
                    </div>

                    {/* Diff old -> new */}
                    <div className="flex items-center gap-2 text-[12px] bg-[#F7F7F5] rounded-lg p-2.5 my-2 border border-[#E8E8E5]">
                      <span className="line-through text-[#DC2626] font-medium text-[11px] max-w-[45%] truncate">
                        {log.old_value || "(empty)"}
                      </span>
                      <ArrowRight size={13} className="text-[#737373] flex-shrink-0" />
                      <span className="text-[#16A34A] font-bold text-[11px] max-w-[45%] truncate">
                        {log.new_value || "(empty)"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-[#737373] mt-2">
                      <User size={12} className="text-[#737373]" />
                      <span>Changed by: </span>
                      <strong className="text-[#04314A]">{log.changed_by_name}</strong>
                      {log.changed_by_username && log.changed_by_username !== log.changed_by_name && (
                        <span>(@{log.changed_by_username})</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#FAFAF8] border-t border-[#E8E8E5] flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-full border border-[#E8E8E5] text-[12px] font-semibold text-[#04314A] hover:bg-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
