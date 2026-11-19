"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Download, Upload, Trash2, UserPlus, Plus } from "lucide-react";
import { crm, formatDate, type Lead, type LeadStatus } from "./data";
import { useVehicleOptions, useCrmMeta, resolveSelection } from "./useOptions";
import ImportFromEventsModal from "./ImportFromEventsModal";
import {
  Button,
  Input,
  Select,
  FormField,
  Modal,
  PageHeader,
  Badge,
  ConfirmDialog,
  Textarea,
} from "@/components/ui";
import { exportCsv, TableState, Pagination } from "./ui";
import { fetchInterestLevels, type InterestLevel } from "@/lib/events";
import { EntityLink, NewCustomerModal } from "../components/pickers";
import { useAuth } from "../AuthContext";

import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

function CreateLeadModal({
  onClose,
  onSaved,
  metaRefreshKey = 0,
}: {
  onClose: () => void;
  onSaved: (msg: string) => void;
  metaRefreshKey?: number;
}) {
  const vehicles = useVehicleOptions();
  const meta = useCrmMeta(metaRefreshKey);
  const [interestLevels, setInterestLevels] = useState<InterestLevel[]>([]);
  const empty = {
    name: "",
    company: "",
    phone: "",
    email: "",
    address: "",
    vehicle: "",
    interestLevel: "",
    source: "Website",
    budget: "",
    notes: "",
  };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    setForm((f) =>
      f.vehicle ? f : { ...f, vehicle: resolveSelection(f.vehicle, vehicles) }
    );
  }, [vehicles]);

  useEffect(() => {
    fetchInterestLevels()
      .then((levels) => setInterestLevels(levels.filter((l) => l.is_active)))
      .catch(() => {});
  }, []);

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Required";
    if (!form.phone.trim()) errs.phone = "Required";
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email))
      errs.email = "Invalid email";
    if (!form.vehicle) errs.vehicle = "Required";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    try {
      await crm.createLead({
        name: form.name.trim(),
        company: form.company.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        vehicle: form.vehicle,
        interestLevel: form.interestLevel ? Number(form.interestLevel) : null,
        interestLevelName: "",
        source: form.source,
        budget: Number(form.budget) || 0,
        notes: form.notes.trim(),
      });
      onSaved(`Lead ${form.name.trim()} created.`);
      onClose();
    } catch {
      setErrors({ form: "Failed to create lead. Please try again." });
      setSaving(false);
    }
  };

  const vehicleOptions = [
    ...vehicles.map((v) => ({ value: v, label: v })),
    { value: "Other / Multiple", label: "Other / Multiple" },
  ];

  const interestOptions = [
    { value: "", label: "Select…" },
    ...interestLevels.map((l) => ({ value: String(l.id), label: l.name })),
  ];

  const sourceOptions = meta.leadSources.map((s) => ({ value: s, label: s }));

  return (
    <Modal title="Create Lead" onClose={onClose} size="lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <FormField label="Name" required error={errors.name}>
            <Input
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              placeholder="Ram Sharma"
              error={!!errors.name}
            />
          </FormField>
        </div>
        <FormField label="Company">
          <Input
            value={form.company}
            onChange={(e) => set("company")(e.target.value)}
          />
        </FormField>
        <FormField label="Phone" required error={errors.phone}>
          <Input
            value={form.phone}
            onChange={(e) => set("phone")(e.target.value)}
            placeholder="+977-"
            error={!!errors.phone}
          />
        </FormField>
        <FormField label="Email" error={errors.email}>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set("email")(e.target.value)}
            error={!!errors.email}
          />
        </FormField>
        <FormField label="Address">
          <Input
            value={form.address}
            onChange={(e) => set("address")(e.target.value)}
          />
        </FormField>
        <FormField label="Interested Vehicle" required error={errors.vehicle}>
          <Select
            value={form.vehicle}
            onChange={(e) => set("vehicle")(e.target.value)}
            options={vehicleOptions}
            error={!!errors.vehicle}
          />
        </FormField>
        <FormField label="Interest Level">
          <Select
            value={form.interestLevel}
            onChange={(e) => set("interestLevel")(e.target.value)}
            options={interestOptions}
          />
        </FormField>
        <FormField label="Lead Source">
          <Select
            value={form.source}
            onChange={(e) => set("source")(e.target.value)}
            options={sourceOptions}
          />
        </FormField>
        <FormField label="Estimated Budget (NPR)">
          <Input
            type="number"
            min={0}
            value={form.budget}
            onChange={(e) => set("budget")(e.target.value)}
          />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Notes">
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes")(e.target.value)}
              rows={3}
            />
          </FormField>
        </div>
      </div>
      {errors.form && (
        <p className="mt-4 text-[12px] text-[#DC2626]">{errors.form}</p>
      )}
      <div data-modal-actions className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} loading={saving}>
          Create Lead
        </Button>
      </div>
    </Modal>
  );
}

export default function LeadsPage({
  onNavigate,
}: {
  onNavigate: (page: string) => void;
}) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [vehicleF, setVehicleF] = useState("all");
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);
  const [sourceF, setSourceF] = useState("all");
  const [interestF, setInterestF] = useState("all");
  const [interestLevels, setInterestLevels] = useState<InterestLevel[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [creating, setCreating] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [importing, setImporting] = useState(false);
  const [metaRefreshKey, setMetaRefreshKey] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const vehicles = useVehicleOptions();
  const meta = useCrmMeta(metaRefreshKey);
  const { me } = useAuth();
  const currentUserName =
    (me?.first_name || me?.last_name
      ? `${me.first_name || ""} ${me.last_name || ""}`.trim()
      : me?.username) ||
    (() => {
      try {
        return localStorage.getItem("vt_username") || "";
      } catch {
        return "";
      }
    })() ||
    "";

  const toast = (msg: string) => setStatusMsg(msg);

  const load = () => {
    setLoading(true);
    setError("");
    crm
      .leads()
      .then(setLeads)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Load failed")
      )
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  useEffect(() => {
    fetchInterestLevels()
      .then((levels) => setInterestLevels(levels.filter((l) => l.is_active)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const s = params.get("status");
    if (s) setStatusF(s);
    const q = params.get("search");
    if (q) setSearch(q);
    const v = params.get("vehicle");
    if (v) setVehicleF(v);
  }, []);

  const displayName = (l: Lead) => l.name.trim() || "-";

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (statusF !== "all" && l.status !== statusF) return false;
      if (vehicleF !== "all" && l.vehicle !== vehicleF) return false;
      if (sourceF !== "all" && l.source !== sourceF) return false;
      if (interestF !== "all" && String(l.interestLevel ?? "") !== interestF) return false;
      if (dateFrom && l.createdAt.slice(0, 10) < dateFrom) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay =
          `${displayName(l)} ${l.company} ${l.email} ${l.phone} ${l.vehicle} ${l.interestLevelName} ${l.createdBy ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, search, statusF, vehicleF, sourceF, interestF, dateFrom]);

  const pageCount = Math.ceil(filtered.length / pageSize) || 1;
  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const setStatus = async (lead: Lead, status: LeadStatus) => {
    const prevStatus = lead.status;
    if (prevStatus === status) return;
    try {
      await crm.updateLead(lead.id, { status });
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, status } : l))
      );
      toast(
        `${lead.id} marked ${meta.leadStatusLabels[status] ?? status}.`
      );
      await crm
        .addActivity({
          type: "status_change",
          subject: `${displayName(lead)} moved to ${meta.leadStatusLabels[status] ?? status}`,
          description: `Status changed from ${meta.leadStatusLabels[prevStatus] ?? prevStatus} to ${meta.leadStatusLabels[status] ?? status}.`,
          datetime: new Date().toISOString(),
          user: currentUserName,
          leadId: lead.id,
        })
        .catch(() => {});
    } catch {
      toast("Status update failed.");
    }
  };

  const convert = async (lead: Lead) => {
    if (!window.confirm(`Convert ${displayName(lead)} to a customer?`)) return;
    try {
      const { customer } = await crm.convertLead(lead.id);
      setLeads((prev) =>
        prev.map((l) =>
          l.id === lead.id ? { ...l, status: "converted" as const } : l
        )
      );
      toast(`Converted to customer ${customer.id}.`);
    } catch {
      toast("Conversion failed.");
    }
  };

  const confirmDelete = async () => {
    if (!leadToDelete) return;
    const label = displayName(leadToDelete);
    try {
      await crm.deleteLead(leadToDelete.id);
      setLeads((prev) => prev.filter((l) => l.id !== leadToDelete.id));
      toast(`Lead "${label}" deleted.`);
    } catch {
      toast("Delete failed.");
    } finally {
      setLeadToDelete(null);
    }
  };

  const handleExport = () => {
    const rows = filtered.map((l) => ({
      Name: l.name,
      Company: l.company,
      Phone: l.phone,
      Email: l.email,
      Address: l.address,
      "Interested Vehicle": l.vehicle,
      "Interest Level": l.interestLevelName,
      Source: l.source,
      Budget: l.budget ? `NPR ${l.budget.toLocaleString("en-IN")}` : "",
      Notes: l.notes,
      Status: meta.leadStatusLabels[l.status] ?? l.status,
      "Added By": l.createdBy,
      "Added At": formatDate(l.createdAt),
    }));
    exportCsv("vehicle-template-leads.csv", rows);
  };

  const cols = [
    "ID",
    "Name",
    "Company",
    "Phone",
    "Interested Vehicle",
    "Interest Level",
    "Source",
    "Status",
    "Added By",
    "Added At",
    "",
  ];

  const statusOptions = useMemo(
    () => [
      { value: "all", label: "All Statuses" },
      ...meta.leadStatuses.map((s) => ({
        value: s,
        label: meta.leadStatusLabels[s] ?? s,
      })),
    ],
    [meta.leadStatuses, meta.leadStatusLabels]
  );

  const vehicleOptions = useMemo(
    () => [
      { value: "all", label: "All Vehicles" },
      ...vehicles.map((v) => ({ value: v, label: v })),
    ],
    [vehicles]
  );

  const sourceOptions = useMemo(
    () => [
      { value: "all", label: "All Sources" },
      ...meta.leadSources.map((s) => ({ value: s, label: s })),
    ],
    [meta.leadSources]
  );

  const interestOptions = useMemo(
    () => [
      { value: "all", label: "All Interest Levels" },
      ...interestLevels.map((l) => ({ value: String(l.id), label: l.name })),
    ],
    [interestLevels]
  );

  const getBadgeVariant = (
    status: string
  ): "success" | "info" | "warning" | "danger" | "neutral" => {
    const map: Record<
      string,
      "success" | "info" | "warning" | "danger" | "neutral"
    > = {
      new: "info",
      contacted: "info",
      scheduled: "info",
      converted: "success",
      won: "success",
      active: "success",
      rejected: "danger",
      lost: "danger",
      on_hold: "warning",
    };
    return map[status] ?? "neutral";
  };

  const hasActiveFilters =
    search || statusF !== "all" || vehicleF !== "all" || sourceF !== "all" || interestF !== "all" || dateFrom;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        subtitle="Track and manage incoming leads across all channels."
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<UserPlus size={14} />}
              onClick={() => setCreatingCustomer(true)}
            >
              Add Customer
            </Button>
            <Button
              variant="secondary"
              leftIcon={<Download size={14} />}
              onClick={handleExport}
            >
              Export
            </Button>
            <Button
              variant="secondary"
              leftIcon={<Upload size={14} />}
              onClick={() => setImporting(true)}
            >
              Import from Events
            </Button>
            <Button
              variant="primary"
              leftIcon={<Plus size={15} />}
              onClick={() => setCreating(true)}
            >
              New Lead
            </Button>
          </>
        }
      />

      {statusMsg && (
        <div className="p-3 bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] text-[12px] font-medium rounded-lg flex items-center justify-between">
          <span>{statusMsg}</span>
          <button
            type="button"
            onClick={() => setStatusMsg("")}
            className="text-[#166534] hover:opacity-70 text-[11px] font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-[12px] font-medium rounded-lg">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search name, company, email, phone…"
            leftIcon={<Search size={15} />}
          />
        </div>
        <div className="w-44">
          <Select
            value={statusF}
            onChange={(e) => {
              setStatusF(e.target.value);
              setPage(0);
            }}
            options={statusOptions}
          />
        </div>
        <div className="w-44">
          <Select
            value={vehicleF}
            onChange={(e) => {
              setVehicleF(e.target.value);
              setPage(0);
            }}
            options={vehicleOptions}
          />
        </div>
        <div className="w-40">
          <Select
            value={sourceF}
            onChange={(e) => {
              setSourceF(e.target.value);
              setPage(0);
            }}
            options={sourceOptions}
          />
        </div>
        <div className="w-44">
          <Select
            value={interestF}
            onChange={(e) => {
              setInterestF(e.target.value);
              setPage(0);
            }}
            options={interestOptions}
          />
        </div>
        <div className="w-40">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="Created from"
          />
        </div>
        {hasActiveFilters && (
          <button
            onClick={() => {
              setSearch("");
              setStatusF("all");
              setVehicleF("all");
              setSourceF("all");
              setInterestF("all");
              setDateFrom("");
            }}
            className="text-[11px] font-semibold text-[#10B981] hover:text-[#0B3D2B] transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1080px]">
            <thead>
              <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8] text-[11px] font-semibold text-[#0B3D2B] tracking-[0.02em]">
                {cols.map((h) => (
                  <th key={h} className="px-5 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E8E5]">
              <TableState
                colSpan={cols.length}
                loading={loading}
                empty={!loading && pageRows.length === 0}
                error={error}
                onRetry={load}
              />
              {!loading &&
                pageRows.map((l) => (
                  <tr
                    key={l.id}
                    className="hover:bg-[#FAFAF8] transition-colors"
                  >
                    <td className="px-5 py-3.5 text-[12px] font-semibold text-[#737373] whitespace-nowrap">
                      <EntityLink
                        type="lead"
                        id={l.id}
                        label={`LD-${l.id}`}
                        onNavigate={onNavigate}
                      />
                    </td>
                    <td className="px-5 py-3.5">
                      <EntityLink
                        type="lead"
                        id={l.id}
                        label={displayName(l)}
                        onNavigate={onNavigate}
                      />
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                      {l.company || "-"}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                      {l.phone}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                      {l.vehicle || "-"}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                      {l.interestLevelName || "-"}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                      {l.source}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={getBadgeVariant(l.status)} size="sm">
                        {(meta.leadStatusLabels[l.status] ?? l.status).replace(
                          /_/g,
                          " "
                        )}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                      {l.createdBy || "-"}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                      {formatDate(l.createdAt)}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onNavigate(`crm-leads/${l.id}`)}
                        >
                          View
                        </Button>
                        {l.status !== "converted" && (
                          <select
                            value={l.status}
                            onChange={(e) =>
                              setStatus(l, e.target.value as LeadStatus)
                            }
                            className="h-7 border border-[#E8E8E5] rounded-lg bg-white px-2 text-[11px] font-semibold text-[#0B3D2B] focus:outline-none focus:border-[#10B981] cursor-pointer"
                            aria-label={`Change status for ${l.id}`}
                          >
                            {meta.leadStatuses
                              .filter((s) => s !== "converted")
                              .map((s) => (
                                <option key={s} value={s}>
                                  {meta.leadStatusLabels[s] ?? s}
                                </option>
                              ))}
                          </select>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => convert(l)}
                        >
                          Convert
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          leftIcon={<Trash2 size={11} />}
                          onClick={() => setLeadToDelete(l)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          pageCount={pageCount}
          onPage={setPage}
          total={filtered.length}
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(0);
          }}
        />
      </div>

      {creating && (
        <CreateLeadModal
          onClose={() => setCreating(false)}
          onSaved={(m) => {
            load();
            toast(m);
          }}
          metaRefreshKey={metaRefreshKey}
        />
      )}
      {creatingCustomer && (
        <NewCustomerModal
          onClose={() => setCreatingCustomer(false)}
          onCreated={(newCust) => {
            setCreatingCustomer(false);
            toast(`Customer ${newCust.name} added successfully.`);
            onNavigate(`crm-customers/${newCust.id}`);
          }}
        />
      )}
      {importing && (
        <ImportFromEventsModal
          onClose={() => setImporting(false)}
          onImported={(m) => {
            load();
            toast(m);
          }}
          onMetaRefresh={() => setMetaRefreshKey((k) => k + 1)}
        />
      )}
      <ConfirmDialog
        isOpen={Boolean(leadToDelete)}
        title={
          leadToDelete
            ? `Delete lead "${displayName(leadToDelete)}"?`
            : "Delete lead?"
        }
        description="This will permanently delete the lead, including all linked quotations and opportunities. This action cannot be undone."
        confirmLabel="Delete lead"
        cancelLabel="Keep lead"
        onConfirm={confirmDelete}
        onCancel={() => setLeadToDelete(null)}
        variant="danger"
      />
    </div>
  );
}
