import React from "react";
import { useAuth } from "../admin/AuthContext";
import { api } from "@/lib/api";

export interface LogPrintEventParams {
  documentType: string;
  objectId?: string | number;
  title?: string;
}

/**
 * Audit-log a print / PDF export action back to the backend.
 */
export async function logPrintEvent({
  documentType,
  objectId,
  title,
}: LogPrintEventParams): Promise<void> {
  try {
    await api.post("/api/audit-logs/record-print/", {
      document_type: documentType,
      object_id: objectId !== undefined && objectId !== null ? String(objectId) : "",
      title: title || "",
    });
  } catch (err) {
    console.warn("Failed to record print event:", err);
  }
}

interface PrintFooterProps {
  documentType?: string;
  objectId?: string | number;
  printedBy?: string;
  dateTime?: string;
  className?: string;
  pageInfo?: string;
}

/**
 * Reusable Print Footer component
 * Formats: "Printed by: <full name>, <date-time>, <page x of y where possible>"
 */
export function PrintFooter({
  documentType,
  objectId,
  printedBy,
  dateTime,
  className = "",
  pageInfo,
}: PrintFooterProps) {
  const { me } = useAuth();
  const userName =
    printedBy ||
    (me
      ? `${me.first_name || ""} ${me.last_name || ""}`.trim() ||
        me.username ||
        "Authorized Staff"
      : "Authorized Staff");

  const formattedDateTime =
    dateTime ||
    new Date().toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  return (
    <footer
      className={`print-footer w-full pt-3 mt-4 border-t border-[#E8E8E5] text-[10px] text-[#737373] flex items-center justify-between font-mono ${className}`}
    >
      <span>
        Printed by:{" "}
        <strong className="font-semibold text-[#04314A]">{userName}</strong>,{" "}
        {formattedDateTime}
      </span>
      {pageInfo ? <span>{pageInfo}</span> : <span />}
    </footer>
  );
}

export default PrintFooter;
