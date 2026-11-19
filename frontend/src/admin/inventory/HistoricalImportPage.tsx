"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Upload, RotateCcw, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAuth } from "../AuthContext";
import {
  Badge,
  Button,
  EmptyState,
  FormField,
  PageHeader,
  Select,
} from "@/components/ui";
import { useToast } from "../crm/ui";
import {
  IMPORT_TYPE_HELP,
  commitImport,
  downloadImportErrors,
  downloadImportTemplate,
  dryRunImport,
  fetchImportJobs,
  rollbackImportJob,
  type DryRunResult,
  type ImportJob,
  type ImportType,
} from "@/lib/historicalImport";

const IMPORT_TYPES = Object.keys(IMPORT_TYPE_HELP) as ImportType[];

function statusVariant(status: string): "success" | "warning" | "danger" | "neutral" | "info" {
  switch (status) {
    case "committed":
      return "success";
    case "failed":
      return "danger";
    case "rolled_back":
      return "warning";
    default:
      return "neutral";
  }
}

function rowStatusVariant(status: string): "success" | "warning" | "danger" | "neutral" | "info" {
  switch (status) {
    case "CREATE":
      return "success";
    case "UPDATE":
      return "info";
    case "SKIP":
      return "neutral";
    case "ERROR":
      return "danger";
    default:
      return "neutral";
  }
}

function rowSummary(importType: ImportType, data: Record<string, unknown>): string {
  const v = (key: string) => (data[key] == null ? "" : String(data[key]));
  switch (importType) {
    case "customers":
      return [v("name"), v("phone")].filter(Boolean).join(" · ");
    case "shipments":
      return v("shipment_no");
    case "units":
      return [v("vin_chassis_no"), v("status")].filter(Boolean).join(" · ");
    case "sales":
      return [v("tax_invoice_no"), v("vin"), v("customer_name")].filter(Boolean).join(" · ");
    case "servicing":
      return [v("vro_no"), v("vin")].filter(Boolean).join(" · ");
    case "shipment_costs":
      return [v("shipment_no"), v("cost_type"), `${v("currency")} ${v("amount")}`.trim()]
        .filter(Boolean)
        .join(" · ");
  }
}

export default function HistoricalImportPage() {
  const { hasPerm, isSuperAdmin } = useAuth();
  const toast = useToast();
  const canRun = isSuperAdmin || hasPerm("inventory.run_historical_import");

  const [importType, setImportType] = useState<ImportType>("customers");
  const [file, setFile] = useState<File | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [calendar, setCalendar] = useState<"ad" | "bs">("ad");
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [preview, setPreview] = useState<DryRunResult | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(true);

  const help = IMPORT_TYPE_HELP[importType];

  const loadJobs = useCallback(() => {
    if (!canRun) return;
    setLoadingJobs(true);
    fetchImportJobs()
      .then(setJobs)
      .catch((e) => toast.push(e instanceof ApiError ? e.message : "Failed to load import history"))
      .finally(() => setLoadingJobs(false));
  }, [canRun, toast]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const typeOptions = useMemo(
    () =>
      IMPORT_TYPES.map((t) => ({
        value: t,
        label: `${IMPORT_TYPE_HELP[t].order}. ${IMPORT_TYPE_HELP[t].label}`,
      })),
    [],
  );

  if (!canRun) {
    return (
      <EmptyState
        title="Historical Import unavailable"
        description="Head office permission inventory.run_historical_import is required. Dealer accounts cannot use this tool."
      />
    );
  }

  const runDryRun = async () => {
    if (!file) {
      toast.push("Choose a CSV or Excel file first.");
      return;
    }
    setBusy(true);
    setPreview(null);
    try {
      const result = await dryRunImport(importType, file, updateExisting, calendar);
      setPreview(result);
      toast.push(
        `Dry run complete: ${result.rows_create} create, ${result.rows_skip} skip, ${result.rows_error} error.`,
      );
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : "Dry run failed");
    } finally {
      setBusy(false);
    }
  };

  const runCommit = async () => {
    if (!file) {
      toast.push("Choose a CSV or Excel file first.");
      return;
    }
    if (!preview) {
      toast.push("Run a dry run before committing.");
      return;
    }
    if (!skipInvalid && preview.rows_error > 0) {
      toast.push("Fix validation errors or enable skip-invalid before commit.");
      return;
    }
    setBusy(true);
    try {
      const job = await commitImport(importType, file, { updateExisting, skipInvalid, calendar });
      toast.push(
        `Committed job #${job.id}: ${job.rows_created} created, ${job.rows_skipped} skipped, ${job.rows_error} errors.`,
      );
      setPreview(null);
      setFile(null);
      loadJobs();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : "Commit failed");
    } finally {
      setBusy(false);
    }
  };

  const runRollback = async (job: ImportJob) => {
    if (!isSuperAdmin) {
      toast.push("Only Super Admin can roll back import jobs.");
      return;
    }
    if (!window.confirm(`Roll back import job #${job.id}? This soft-deletes records created by that job.`)) {
      return;
    }
    setBusy(true);
    try {
      await rollbackImportJob(job.id);
      toast.push(`Job #${job.id} rolled back.`);
      loadJobs();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : "Rollback refused");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historical Import"
        subtitle="Load prior-year customers, shipments, units, sales and servicing so reports and aging work from day one. Dates stay as given (AD only). No performance credit, notifications, or CRM automation."
      />

      <div className="bg-white border border-[#E8E8E5] rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block mb-1.5">
              Import type
            </label>
            <Select
              value={importType}
              onChange={(e) => {
                setImportType(e.target.value as ImportType);
                setPreview(null);
              }}
              options={typeOptions}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block mb-1.5">
              Upload file (.csv or .xlsx, max 5,000 rows and 10 MB)
            </label>
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
              }}
              className="block w-full text-[13px] text-[#04314A] file:mr-3 file:rounded-lg file:border-0 file:bg-[#F0F0ED] file:px-3 file:py-2 file:text-[12px] file:font-semibold"
            />
          </div>
        </div>

        <div className="rounded-xl bg-[#F7F7F5] border border-[#E8E8E5] p-4 space-y-2">
          <p className="text-[13px] font-semibold text-[#04314A]">
            Step {help.order}: {help.label}
          </p>
          <p className="text-[13px] text-[#525252]">{help.help}</p>
          <p className="text-[12px] text-[#737373]">
            Required columns: <span className="font-medium text-[#04314A]">{help.columns}</span>
          </p>
          <p className="text-[12px] text-[#737373]">
            {calendar === "bs"
              ? "Dates: Bikram Sambat, typed as text (YYYY-MM-DD or DD/MM/YYYY), for example 2080-01-01. Excel date cells are Gregorian and are rejected. Each BS date is stored as its AD equivalent."
              : "Dates: Gregorian AD (YYYY-MM-DD or DD/MM/YYYY). A year from 2070 to 2100 is treated as Bikram Sambat and rejected until you switch this file to BS."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => downloadImportTemplate(importType, "csv").catch((e) => toast.push(e.message))}
          >
            <Download size={14} /> CSV template
          </Button>
          <Button
            variant="secondary"
            onClick={() => downloadImportTemplate(importType, "xlsx").catch((e) => toast.push(e.message))}
          >
            <FileSpreadsheet size={14} /> Excel template
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
          <FormField label="Date calendar for this file" htmlFor="import-calendar" className="sm:w-64">
            <Select
              id="import-calendar"
              value={calendar}
              options={[
                { value: "ad", label: "Gregorian (AD)" },
                { value: "bs", label: "Bikram Sambat (BS)" },
              ]}
              onChange={(event) => {
                setCalendar(event.target.value as "ad" | "bs");
                setPreview(null);
              }}
            />
          </FormField>
          <label className="flex items-center gap-2 pb-2 text-[13px] text-[#04314A]">
            <input
              type="checkbox"
              checked={updateExisting}
              onChange={(e) => setUpdateExisting(e.target.checked)}
              className="rounded border-[#E8E8E5]"
            />
            Update existing (fill blank fields only)
          </label>
          <label className="flex items-center gap-2 text-[13px] text-[#04314A]">
            <input
              type="checkbox"
              checked={skipInvalid}
              onChange={(e) => setSkipInvalid(e.target.checked)}
              className="rounded border-[#E8E8E5]"
            />
            Skip invalid rows and import the rest (off by default)
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={busy} onClick={runDryRun} disabled={!file}>
            <Upload size={14} /> 1. Dry run
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={runCommit}
            disabled={!file || !preview || (!skipInvalid && (preview?.rows_error ?? 0) > 0)}
          >
            2. Commit
          </Button>
        </div>
      </div>

      {preview && (
        <div className="bg-white border border-[#E8E8E5] rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-bold text-[#04314A]">Dry run preview</h2>
              <p className="text-[13px] text-[#737373] mt-1">
                {preview.filename} · {preview.rows_read} rows · create {preview.rows_create} ·
                update {preview.rows_update} · skip {preview.rows_skip} · error {preview.rows_error}
              </p>
            </div>
            {preview.errors.length > 0 && (
              <Button
                variant="secondary"
                onClick={() =>
                  downloadImportErrors(preview.errors).catch((e) => toast.push(e.message))
                }
              >
                <AlertTriangle size={14} /> Error report CSV
              </Button>
            )}
          </div>

          <div className="overflow-x-auto border border-[#E8E8E5] rounded-xl">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#F7F7F5] text-[10px] uppercase tracking-[0.1em] text-[#737373]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Row</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Summary</th>
                  <th className="px-3 py-2 font-semibold">Errors</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview_rows.map((r) => (
                  <tr key={r.row} className="border-t border-[#E8E8E5]">
                    <td className="px-3 py-2 text-[#04314A] font-medium">{r.row}</td>
                    <td className="px-3 py-2">
                      <Badge variant={rowStatusVariant(r.status)} size="sm">
                        {r.status === "SKIP" ? "Skip existing" : r.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-[#525252] max-w-md truncate">
                      {rowSummary(preview.import_type, r.data)}
                    </td>
                    <td className="px-3 py-2 text-[#DC2626] text-[12px]">
                      {(r.errors || []).join("; ")}
                    </td>
                  </tr>
                ))}
                {preview.preview_rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-[#737373]">
                      No preview rows.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {preview.rows_read > preview.preview_rows.length && (
            <p className="text-[12px] text-[#737373]">
              Showing first {preview.preview_rows.length} of {preview.rows_read} rows.
            </p>
          )}
        </div>
      )}

      <div className="bg-white border border-[#E8E8E5] rounded-2xl p-5 sm:p-6 space-y-4">
        <h2 className="text-[16px] font-bold text-[#04314A]">Import history</h2>
        {loadingJobs ? (
          <p className="text-[13px] text-[#737373]">Loading…</p>
        ) : jobs.length === 0 ? (
          <EmptyState title="No import jobs yet" description="Completed imports will appear here with counts and who ran them." />
        ) : (
          <div className="overflow-x-auto border border-[#E8E8E5] rounded-xl">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#F7F7F5] text-[10px] uppercase tracking-[0.1em] text-[#737373]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Job</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">File</th>
                  <th className="px-3 py-2 font-semibold">Counts</th>
                  <th className="px-3 py-2 font-semibold">By</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-t border-[#E8E8E5]">
                    <td className="px-3 py-2 font-medium text-[#04314A]">#{job.id}</td>
                    <td className="px-3 py-2">{job.import_type_display}</td>
                    <td className="px-3 py-2 max-w-[180px] truncate">{job.original_filename}</td>
                    <td className="px-3 py-2 text-[#525252]">
                      read {job.rows_read} · created {job.rows_created} · skipped {job.rows_skipped} ·
                      errors {job.rows_error}
                    </td>
                    <td className="px-3 py-2">{job.uploaded_by_name || "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant={statusVariant(job.status)} size="sm">
                        {job.status_display}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2 justify-end">
                        {Array.isArray(job.error_summary) && job.error_summary.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              downloadImportErrors(job.error_summary).catch((e) =>
                                toast.push(e.message),
                              )
                            }
                          >
                            Errors
                          </Button>
                        )}
                        {isSuperAdmin && job.status === "committed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => runRollback(job)}
                          >
                            <RotateCcw size={13} /> Rollback
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
