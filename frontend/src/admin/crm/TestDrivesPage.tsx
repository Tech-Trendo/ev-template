import { useEffect, useMemo, useState } from "react";
import { Search, ChevronDown, Plus, CalendarCheck } from "lucide-react";
import {
  crm,
  formatDate,
  type Customer,
  type TestDrive,
  type TestDriveStatus,
} from "./data";
import { useCrmMeta, useUserOptions, useVehicleOptions } from "./useOptions";
import { Badge, PageHeader, Pagination, SelectField, TableState, ghostBtnCls, inputCls, primaryBtnCls, selectCls, useToast } from "./ui";
import { ScheduleTestDriveModal } from "./modals";
import { Field, Modal } from "./ui";
import { EntityLink } from "../components/pickers";

import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

function EditTestDriveModal({
  drive,
  onClose,
  onSaved,
}: {
  drive: TestDrive;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    date: drive.date, time: drive.time, location: drive.location,
    salesperson: drive.salesperson, status: drive.status as string, notes: drive.notes,
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  // Salesperson options come from the API; always keep the current value selectable.
  const salespeople = useUserOptions();
  const meta = useCrmMeta();
  const salespersonOptions = form.salesperson && !salespeople.includes(form.salesperson)
    ? [...salespeople, form.salesperson]
    : salespeople;

  const submit = async (reschedule: boolean) => {
    setSaving(true);
    try {
      const patch = reschedule ? { date: form.date, time: form.time, location: form.location, status: "scheduled" as TestDriveStatus } : { ...form, status: form.status as TestDriveStatus };
      await crm.updateTestDrive(drive.id, patch);
      onSaved(reschedule ? `Test drive ${drive.id} rescheduled.` : `Test drive ${drive.id} updated.`);
      onClose();
    } catch {
      onSaved("Update failed.");
      setSaving(false);
    }
  };

  return (
    <Modal title={`Edit ${drive.displayId ?? drive.id}`} onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <p className="sm:col-span-2 text-[13px] text-[#737373]">
          <span className="font-bold text-[#04314A]">{drive.customerName}</span> · {drive.vehicle}
        </p>
        <Field label="Date" required><input type="date" value={form.date} onChange={(e) => set("date")(e.target.value)} className={inputCls} /></Field>
        <Field label="Time" required><input type="time" value={form.time} onChange={(e) => set("time")(e.target.value)} className={inputCls} /></Field>
        <div className="sm:col-span-2"><Field label="Location"><input value={form.location} onChange={(e) => set("location")(e.target.value)} className={inputCls} /></Field></div>
        <Field label="Salesperson">
          <SelectField value={form.salesperson} onChange={set("salesperson")} options={salespersonOptions.map((s) => ({ value: s, label: s }))} />
        </Field>
        <Field label="Status">
          <SelectField value={form.status} onChange={set("status")} options={meta.testDriveStatuses.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))} />
        </Field>
        <div className="sm:col-span-2"><Field label="Notes"><textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={2} className={inputCls} /></Field></div>
      </div>
      <div data-modal-actions className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#737373] hover:text-[#04314A]">Cancel</button>
        <button onClick={() => submit(true)} disabled={saving} className={ghostBtnCls}>Reschedule</button>
        <button onClick={() => submit(false)} disabled={saving} className={primaryBtnCls}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </Modal>
  );
}

export default function TestDrivesPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [drives, setDrives] = useState<TestDrive[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [vehicleF, setVehicleF] = useState("all");
  const [salespersonF, setSalespersonF] = useState("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [editing, setEditing] = useState<TestDrive | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [completedDrive, setCompletedDrive] = useState<{ leadId: string | null; vehicle: string } | null>(null);
  const toast = useToast();
  const vehicles = useVehicleOptions();
  const salespeople = useUserOptions();
  const meta = useCrmMeta();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const sParam = params.get("status");
      const qParam = params.get("search");
      const vParam = params.get("vehicle");
      if (sParam) setStatusF(sParam);
      if (qParam) setSearch(qParam);
      if (vParam) setVehicleF(vParam);
    }
  }, []);

  const load = () => {
    setLoading(true);
    Promise.all([crm.testDrives(), crm.customers()])
      .then(([tds, custs]) => { setDrives(tds); setCustomers(custs); })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(
    () =>
      drives.filter((t) => {
        if (statusF !== "all" && t.status !== statusF) return false;
        if (vehicleF !== "all" && t.vehicle !== vehicleF) return false;
        if (salespersonF !== "all" && t.salesperson !== salespersonF) return false;
        if (search && !`${t.customerName} ${t.vehicle} ${t.location}`.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }).sort((a, b) => b.date.localeCompare(a.date)),
    [drives, search, statusF, vehicleF, salespersonF],
  );

  const updateStatus = async (drive: TestDrive, status: TestDriveStatus) => {
    try {
      await crm.updateTestDrive(drive.id, { status });
      setDrives((prev) => prev.map((t) => (t.id === drive.id ? { ...t, status } : t)));
      toast.push(`${drive.id} marked ${status.replace(/_/g, " ")}.`);
      if (status === "completed") {
        setCompletedDrive({ leadId: drive.leadId ?? null, vehicle: drive.vehicle });
      }
    } catch {
      toast.push("Update failed.");
    }
  };

  const pageCount = Math.ceil(filtered.length / pageSize) || 1;
  const rows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const cols = ["ID", "Customer", "Vehicle", "Assigned Unit", "Date", "Time", "Salesperson", "Location", "Status", "Actions"];

  return (
    <div>
      <PageHeader
        eyebrow="CRM"
        title="Test Drives."
        subtitle="Upcoming test drives and complete history."
        action={
          <button onClick={() => setScheduling(true)} className={primaryBtnCls}>
            <Plus size={15} /> Schedule Test Drive
          </button>
        }
      />

      {completedDrive && (
        <div className="mb-5 flex items-center justify-between gap-4 px-4 py-3.5 bg-[#F0F8FF] border border-[#B3D9F0] rounded-xl text-[13px] text-[#04314A]">
          <span>
            Test drive completed. Ready to create a quotation for{" "}
            <strong>{completedDrive.vehicle}</strong>?
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setCompletedDrive(null)}
              className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#737373] hover:text-[#04314A] transition-colors"
            >
              Dismiss
            </button>
            <button
              onClick={() => {
                const params = new URLSearchParams({ vehicle: completedDrive.vehicle });
                if (completedDrive.leadId) params.set("lead", completedDrive.leadId);
                if (onNavigate) onNavigate(`/admin/crm/quotations/new?${params}`);
                setCompletedDrive(null);
              }}
              className="px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.04em] border border-[#00AAEB] text-[#00AAEB] rounded-xl hover:bg-[#00AAEB] hover:text-white transition-colors"
            >
              Create Quotation
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B0B0AA]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, vehicle, location…" className={`${inputCls} pl-10`} />
        </div>
        {[
          { value: statusF, set: setStatusF, options: ["all", ...meta.testDriveStatuses], labels: ["All Statuses", ...meta.testDriveStatuses.map((s) => s.replace(/_/g, " "))], minW: "min-w-[140px]" },
          { value: vehicleF, set: setVehicleF, options: ["all", ...vehicles], labels: ["All Vehicles", ...vehicles] },
          { value: salespersonF, set: setSalespersonF, options: ["all", ...salespeople], labels: ["All Salespersons", ...salespeople], minW: "min-w-[160px]" },
        ].map((f, i) => (
          <div key={i} className="relative">
            <select value={f.value} onChange={(e) => f.set(e.target.value)} className={`${selectCls} min-w-[130px] ${f.minW ?? ""}`}>
              {f.options.map((o, j) => (
                <option key={o} value={o}>{f.labels[j]}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B0B0AA] pointer-events-none" />
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-x-auto">
        <table className="w-full text-left min-w-[1100px]">
          <thead>
            <tr className="border-b border-[#E8E8E5]">
              {cols.map((h) => (
                <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TableState colSpan={cols.length} loading={loading} empty={!loading && rows.length === 0} error={error} onRetry={load} />
            {!loading &&
              rows.map((t) => (
                <tr key={t.id} className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8]">
                  <td className="px-5 py-3.5 text-[12px] font-bold text-[#737373]">{t.displayId ?? t.id}</td>
                  <td className="px-5 py-3.5 text-[13px] font-bold text-[#04314A] whitespace-nowrap">
                    {t.customerId ? (
                      <EntityLink type="customer" id={t.customerId} label={t.customerName} onNavigate={onNavigate} />
                    ) : t.leadId ? (
                      <EntityLink type="lead" id={t.leadId} label={t.customerName} onNavigate={onNavigate} />
                    ) : (
                      <span>{t.customerName}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">{t.vehicle}</td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                    {t.unitId ? (
                      <EntityLink type="unit" id={t.unitId} label={t.unitVin || `Unit #${t.unitId}`} onNavigate={onNavigate} />
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">{formatDate(t.date)}</td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373]">{t.time}</td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">{t.salesperson}</td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373]">{t.location}</td>
                  <td className="px-5 py-3.5"><Badge status={t.status} /></td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-2 whitespace-nowrap">
                      {["requested", "scheduled", "confirmed"].includes(t.status) && (
                        <>
                          <button onClick={() => setEditing(t)} className="text-[10px] font-bold uppercase tracking-[0.06em] px-2.5 py-1.5 border border-[#E8E8E5] rounded-xl text-[#04314A] hover:border-[#00AAEB] hover:text-[#00AAEB] transition-colors">Edit</button>
                          <button onClick={() => updateStatus(t, "completed")} className="text-[10px] font-bold uppercase tracking-[0.06em] px-2.5 py-1.5 border border-[#E8E8E5] rounded-xl text-[#04314A] hover:border-[#00AAEB] hover:text-[#00AAEB] transition-colors">Complete</button>
                        </>
                      )}
                      {!["cancelled", "completed"].includes(t.status) && (
                        <button onClick={() => updateStatus(t, "cancelled")} className="text-[10px] font-bold uppercase tracking-[0.06em] px-2.5 py-1.5 border border-[#E8E8E5] rounded-xl text-[#00AAEB] hover:border-[#00AAEB] transition-colors">Cancel</button>
                      )}
                      {!["requested", "scheduled", "confirmed"].includes(t.status) && (
                        <button onClick={() => setEditing(t)} className="text-[10px] font-bold uppercase tracking-[0.06em] px-2.5 py-1.5 border border-[#E8E8E5] rounded-xl text-[#04314A] hover:border-[#00AAEB] transition-colors">Edit</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
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

      {drives.length === 0 && !loading && !error && (
        <div className="mt-6 flex items-center gap-3 text-[13px] text-[#737373] bg-white border border-[#E8E8E5] rounded-xl p-6">
          <CalendarCheck size={18} className="text-[#00AAEB]" />
          No test drives yet. Schedule the first one.
        </div>
      )}

      {toast.node}
      {editing && <EditTestDriveModal drive={editing} onClose={() => setEditing(null)} onSaved={(m) => { load(); toast.push(m); }} />}
      {scheduling && <ScheduleTestDriveModal onClose={() => setScheduling(false)} onSaved={(m) => { load(); toast.push(m); }} customers={customers.map((c) => ({ id: c.id, name: c.name }))} />}
    </div>
  );
}
