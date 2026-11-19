"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, Plus, Search, X } from "lucide-react";
import { Badge, Button, DataTable, FormField, Input, Modal, PageHeader, Select } from "@/components/ui";
import { useToast } from "../crm/ui";
import DateDisplay from "@/components/hrm/DateDisplay";
import DatePicker from "@/components/hrm/DatePicker";
import DocumentAttachmentWidget from "../documents/DocumentAttachmentWidget";
import { ApiError, api } from "@/lib/api";
import { DEFAULT_PAGE_SIZE, isPagedResponse, type PagedResponse } from "@/lib/pagination";
import { useAuth } from "../AuthContext";

type EmployeeRow = {
  id: number;
  employee_code: string;
  full_name: string;
  phone: string;
  email: string;
  designation: string;
  department: number | null;
  department_name: string;
  reports_to: number | null;
  reports_to_name: string;
  employment_type: number | null;
  employment_type_name: string;
  employment_status: string;
  joining_date: string | null;
  probation_end_date: string | null;
  date_of_birth: string | null;
  basic_salary: string | null;
  temporary_address: string;
  permanent_address: string;
  pan_vat_number: string;
  citizenship_number: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  notes: string;
  dealer: number | null;
  dealer_name: string;
  user: number | null;
  username: string;
  user_is_active: boolean | null;
  status_effective_date: string | null;
  status_reason: string;
  photo_url: string;
};

type Option = { id: number; name: string; code?: string };
type ChangeRow = { id: number; field_name: string; old_value: string; new_value: string; changed_by: string; changed_at: string };
type HistoryRow = { id: number; status: string; effective_date: string; reason: string; changed_by: string; changed_at: string };

const EMPTY = {
  full_name: "",
  phone: "",
  email: "",
  date_of_birth: "",
  temporary_address: "",
  permanent_address: "",
  pan_vat_number: "",
  citizenship_number: "",
  designation: "",
  department: "",
  reports_to: "",
  employment_type: "",
  joining_date: "",
  probation_end_date: "",
  basic_salary: "",
  employment_status: "active",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  notes: "",
  dealer: "",
};

export default function EmployeesPage({
  route,
  onNavigate,
}: {
  route: string;
  onNavigate: (path: string) => void;
}) {
  const rest = route.replace(/^hr-employees\/?/, "");
  if (!rest) return <EmployeeList onNavigate={onNavigate} />;
  if (rest === "new") return <EmployeeForm onNavigate={onNavigate} />;
  const [id, action] = rest.split("/");
  if (action === "edit") return <EmployeeForm employeeId={id} onNavigate={onNavigate} />;
  if (action === "documents") {
    return <EmployeeProfile employeeId={id} onNavigate={onNavigate} initialTab="documents" />;
  }
  return <EmployeeProfile employeeId={id} onNavigate={onNavigate} />;
}

function EmployeeList({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { hasPerm } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [types, setTypes] = useState<Option[]>([]);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>("employee_code");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const hasFilters = Boolean(search.trim() || department || status || employmentType);
  const ordering = sortKey ? `${sortDirection === "desc" ? "-" : ""}${sortKey}` : "employee_code";

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (search.trim()) parts.push(`“${search.trim()}”`);
    if (department) {
      parts.push(departments.find((row) => String(row.id) === department)?.name || "Department");
    }
    if (status) parts.push(status.replace(/_/g, " "));
    if (employmentType) {
      parts.push(types.find((row) => String(row.id) === employmentType)?.name || "Type");
    }
    return parts;
  }, [search, department, status, employmentType, departments, types]);

  function clearFilters() {
    setSearch("");
    setDepartment("");
    setStatus("");
    setEmploymentType("");
    setPage(1);
  }

  useEffect(() => {
    api.get<Option[]>("/api/hrm/departments/").then(setDepartments).catch(() => undefined);
    api.get<Option[]>("/api/hrm/employment-types/").then(setTypes).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const delay = search.trim() ? 300 : 0;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      const q = search.trim();
      if (q) params.set("search", q);
      if (department) params.set("department", department);
      if (status) params.set("employment_status", status);
      if (employmentType) params.set("employment_type", employmentType);
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      params.set("ordering", ordering);
      setLoading(true);
      api
        .get<PagedResponse<EmployeeRow> | EmployeeRow[]>(`/api/hrm/employees/?${params.toString()}`)
        .then((data) => {
          if (cancelled) return;
          if (isPagedResponse<EmployeeRow>(data)) {
            setRows(data.results);
            setTotalCount(data.count);
            if (data.page !== page) setPage(data.page);
          } else {
            setRows(data);
            setTotalCount(data.length);
          }
        })
        .catch((error) => {
          if (cancelled) return;
          toast.push(error instanceof ApiError ? error.message : "Could not load employees");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department, status, employmentType, search, page, pageSize, ordering]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Employees"
        subtitle="People on the payroll, including staff who do not have a login."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {hasPerm("hrm.export_employee") ? (
              <Button variant="secondary" leftIcon={<Download size={15} />} onClick={() => downloadCsv(toast.push)}>
                Export
              </Button>
            ) : null}
            {hasPerm("hrm.manage_employee") ? (
              <Button leftIcon={<Plus size={15} />} onClick={() => onNavigate("hr-employees/new")}>
                Add employee
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="rounded-xl border border-[#E8E8E5] bg-white p-3 dark:border-[#174261] dark:bg-[#061824]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <label htmlFor="emp-search" className="sr-only">
              Search employees
            </label>
            <Input
              id="emp-search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search name, ID, phone, email, department, or position…"
              leftIcon={<Search size={15} />}
              rightIcon={
                search ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    className="rounded p-0.5 text-[#737373] transition-colors hover:text-[#04314A] dark:hover:text-[#F7F7F5]"
                    onClick={() => {
                      setSearch("");
                      setPage(1);
                    }}
                  >
                    <X size={14} />
                  </button>
                ) : undefined
              }
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:w-[34rem] lg:shrink-0">
            <Select
              id="emp-dept"
              aria-label="Department"
              value={department}
              options={[
                { value: "", label: "All departments" },
                ...departments.map((row) => ({ value: row.id, label: row.name })),
              ]}
              onChange={(event) => {
                setDepartment(event.target.value);
                setPage(1);
              }}
            />
            <Select
              id="emp-status"
              aria-label="Status"
              value={status}
              options={[
                { value: "", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "resigned", label: "Resigned" },
                { value: "terminated", label: "Terminated" },
                { value: "inactive", label: "Inactive" },
              ]}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            />
            <Select
              id="emp-type"
              aria-label="Employment type"
              value={employmentType}
              options={[
                { value: "", label: "All types" },
                ...types.map((row) => ({ value: row.id, label: row.name })),
              ]}
              onChange={(event) => {
                setEmploymentType(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#E8E8E5] pt-3 dark:border-[#174261]">
          <p className="text-[12px] text-[#737373]">
            {loading ? (
              "Loading employees…"
            ) : (
              <>
                <span className="font-medium text-[#04314A] dark:text-[#F7F7F5]">{totalCount}</span>
                {totalCount === 1 ? " employee" : " employees"}
                {hasFilters ? <span> matching {filterSummary.join(" · ")}</span> : null}
              </>
            )}
          </p>
          {hasFilters ? (
            <Button variant="ghost" size="sm" leftIcon={<X size={14} />} onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      <DataTable
        loading={loading}
        data={rows}
        keyExtractor={(row) => row.id}
        onRowClick={(row) => onNavigate(`hr-employees/${row.id}`)}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={(key, direction) => {
          setSortKey(key);
          setSortDirection(direction);
          setPage(1);
        }}
        emptyTitle={hasFilters ? "No matching employees" : "No employees yet"}
        emptyDescription={
          hasFilters
            ? "Try a different search or clear the filters."
            : "Add the first employee to start building the payroll roster."
        }
        emptyAction={
          hasFilters ? (
            <Button variant="secondary" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : hasPerm("hrm.manage_employee") ? (
            <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => onNavigate("hr-employees/new")}>
              Add employee
            </Button>
          ) : undefined
        }
        rowActions={(row) => (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Eye size={14} />}
            onClick={(event) => {
              event.stopPropagation();
              onNavigate(`hr-employees/${row.id}/documents`);
            }}
          >
            View docs
          </Button>
        )}
        columns={[
          {
            key: "employee_code",
            header: "ID",
            sortable: true,
            width: "7rem",
            render: (row) => (
              <span className="font-medium tabular-nums text-[#04314A] dark:text-[#F7F7F5]">{row.employee_code}</span>
            ),
          },
          {
            key: "full_name",
            header: "Name",
            sortable: true,
            render: (row) => (
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E6F7FD] text-[11px] font-semibold text-[#04314A]"
                >
                  {initials(row.full_name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-[#04314A] dark:text-[#F7F7F5]">{row.full_name}</span>
                  {row.designation ? (
                    <span className="block truncate text-[11px] text-[#737373]">{row.designation}</span>
                  ) : null}
                </span>
              </div>
            ),
          },
          {
            key: "department_name",
            header: "Department",
            sortable: true,
            render: (row) => row.department_name || <span className="text-[#A3A39E]">—</span>,
          },
          {
            key: "employment_type_name",
            header: "Type",
            sortable: true,
            render: (row) => row.employment_type_name || <span className="text-[#A3A39E]">—</span>,
          },
          {
            key: "phone",
            header: "Phone",
            render: (row) =>
              row.phone ? (
                <span className="tabular-nums">{row.phone}</span>
              ) : (
                <span className="text-[#A3A39E]">—</span>
              ),
          },
          {
            key: "employment_status",
            header: "Status",
            render: (row) => <Badge status={row.employment_status} />,
          },
        ]}
      />
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function EmployeeForm({ employeeId, onNavigate }: { employeeId?: string; onNavigate: (path: string) => void }) {
  const toast = useToast();
  const { hasPerm } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [types, setTypes] = useState<Option[]>([]);
  const [managers, setManagers] = useState<EmployeeRow[]>([]);
  const [dealers, setDealers] = useState<Option[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedEmployee, setSavedEmployee] = useState<EmployeeRow | null>(null);
  const activeId = employeeId || (savedEmployee ? String(savedEmployee.id) : "");
  const canManageDocs = hasPerm("hrm.manage_employee");

  useEffect(() => {
    api.get<Option[]>("/api/hrm/departments/").then(setDepartments).catch(() => undefined);
    api.get<Option[]>("/api/hrm/employment-types/").then(setTypes).catch(() => undefined);
    api.get<EmployeeRow[]>("/api/hrm/employees/").then(setManagers).catch(() => undefined);
    api.get<Option[] | { results: Option[] }>("/api/dealers/").then((data) => {
      setDealers(Array.isArray(data) ? data : data.results ?? []);
    }).catch(() => undefined);
    if (!employeeId) return;
    api.get<EmployeeRow>(`/api/hrm/employees/${employeeId}/`).then((row) => {
      setSavedEmployee(row);
      setForm({
        full_name: row.full_name,
        phone: row.phone,
        email: row.email,
        date_of_birth: row.date_of_birth && !row.date_of_birth.includes("*") ? row.date_of_birth : "",
        temporary_address: row.temporary_address,
        permanent_address: row.permanent_address,
        pan_vat_number: row.pan_vat_number.includes("*") ? "" : row.pan_vat_number,
        citizenship_number: row.citizenship_number.includes("*") ? "" : row.citizenship_number,
        designation: row.designation,
        department: row.department ? String(row.department) : "",
        reports_to: row.reports_to ? String(row.reports_to) : "",
        employment_type: row.employment_type ? String(row.employment_type) : "",
        joining_date: row.joining_date ?? "",
        probation_end_date: row.probation_end_date ?? "",
        basic_salary: row.basic_salary ?? "",
        employment_status: row.employment_status,
        emergency_contact_name: row.emergency_contact_name,
        emergency_contact_phone: row.emergency_contact_phone,
        notes: row.notes,
        dealer: row.dealer ? String(row.dealer) : "",
      });
    });
  }, [employeeId]);

  async function save() {
    setSaving(true);
    setError("");
    const payload: Record<string, unknown> = {
      ...form,
      department: form.department || null,
      reports_to: form.reports_to || null,
      employment_type: form.employment_type || null,
      dealer: form.dealer || null,
      date_of_birth: form.date_of_birth || null,
      joining_date: form.joining_date || null,
      probation_end_date: form.probation_end_date || null,
      basic_salary: form.basic_salary || null,
    };
    try {
      const saved = activeId
        ? await api.patch<EmployeeRow>(`/api/hrm/employees/${activeId}/`, payload)
        : await api.post<EmployeeRow>("/api/hrm/employees/", payload);
      setSavedEmployee(saved);
      toast.push(activeId ? "Employee updated." : "Employee created. You can attach documents below.");
      if (!employeeId) {
        onNavigate(`hr-employees/${saved.id}/edit`);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save the employee.");
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof typeof EMPTY>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="w-full space-y-5 pb-24">
      <PageHeader
        title={activeId ? "Edit employee" : "Add employee"}
        subtitle="Employee ID is assigned automatically and never reused. Dates support BS and AD. Attach citizenship, contracts, and other files in the documents section."
        actions={
          <Button
            variant="secondary"
            onClick={() => onNavigate(activeId ? `hr-employees/${activeId}` : "hr-employees")}
          >
            Back
          </Button>
        }
      />

      <section className="rounded-xl border border-[#E8E8E5] bg-white p-5 dark:border-[#174261] dark:bg-[#061824]">
        <h2 className="mb-4 text-[13px] font-bold tracking-wide text-[#04314A] dark:text-[#F7F7F5]">
          Personal details
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Full name" htmlFor="full-name" required className="md:col-span-2">
            <Input
              id="full-name"
              value={form.full_name}
              onChange={(event) => set("full_name", event.target.value)}
              placeholder="e.g. Ram Bahadur Thapa"
            />
          </FormField>
          <FormField label="Date of birth" htmlFor="dob" helpText="Click to open BS/AD calendar.">
            <DatePicker
              id="dob"
              value={form.date_of_birth || null}
              onChange={(iso) => set("date_of_birth", iso ?? "")}
              placeholder="Select date of birth"
            />
          </FormField>
          <FormField label="Citizenship number" htmlFor="citizenship">
            <Input
              id="citizenship"
              value={form.citizenship_number}
              onChange={(event) => set("citizenship_number", event.target.value)}
            />
          </FormField>
          <FormField
            label="PAN / VAT"
            htmlFor="pan"
            helpText="8–10 digits. Hidden without sensitive access."
            className="md:col-span-2"
          >
            <Input
              id="pan"
              value={form.pan_vat_number}
              onChange={(event) => set("pan_vat_number", event.target.value)}
            />
          </FormField>
        </div>
      </section>

      <section className="rounded-xl border border-[#E8E8E5] bg-white p-5 dark:border-[#174261] dark:bg-[#061824]">
        <h2 className="mb-4 text-[13px] font-bold tracking-wide text-[#04314A] dark:text-[#F7F7F5]">
          Contact & addresses
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Phone" htmlFor="phone">
            <Input id="phone" value={form.phone} onChange={(event) => set("phone", event.target.value)} />
          </FormField>
          <FormField label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(event) => set("email", event.target.value)}
            />
          </FormField>
          <FormField label="Temporary address" htmlFor="temp" className="md:col-span-2">
            <Input
              id="temp"
              value={form.temporary_address}
              onChange={(event) => set("temporary_address", event.target.value)}
            />
          </FormField>
          <FormField label="Permanent address" htmlFor="perm" className="md:col-span-2">
            <Input
              id="perm"
              value={form.permanent_address}
              onChange={(event) => set("permanent_address", event.target.value)}
            />
          </FormField>
        </div>
      </section>

      <section className="rounded-xl border border-[#E8E8E5] bg-white p-5 dark:border-[#174261] dark:bg-[#061824]">
        <h2 className="mb-4 text-[13px] font-bold tracking-wide text-[#04314A] dark:text-[#F7F7F5]">
          Employment
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Position" htmlFor="designation">
            <Input
              id="designation"
              value={form.designation}
              onChange={(event) => set("designation", event.target.value)}
              placeholder="e.g. Service Advisor"
            />
          </FormField>
          <FormField label="Employment type" htmlFor="etype">
            <Select
              id="etype"
              value={form.employment_type}
              placeholder="Select type"
              options={types.map((row) => ({ value: row.id, label: row.name }))}
              onChange={(event) => set("employment_type", event.target.value)}
            />
          </FormField>
          <FormField label="Joining date" htmlFor="joined">
            <DatePicker
              id="joined"
              value={form.joining_date || null}
              onChange={(iso) => set("joining_date", iso ?? "")}
              placeholder="Select joining date"
            />
          </FormField>
          <FormField label="Probation end" htmlFor="probation" helpText="Optional.">
            <DatePicker
              id="probation"
              value={form.probation_end_date || null}
              onChange={(iso) => set("probation_end_date", iso ?? "")}
              placeholder="Select probation end"
            />
          </FormField>
          <FormField label="Department" htmlFor="department">
            <Select
              id="department"
              value={form.department}
              placeholder="No department"
              options={departments.map((row) => ({ value: row.id, label: row.name }))}
              onChange={(event) => set("department", event.target.value)}
            />
          </FormField>
          <FormField label="Dealer / branch" htmlFor="dealer" helpText="Optional.">
            <Select
              id="dealer"
              value={form.dealer}
              placeholder="No branch"
              options={dealers.map((row) => ({ value: row.id, label: row.name }))}
              onChange={(event) => set("dealer", event.target.value)}
            />
          </FormField>
          <FormField
            label="Reports to"
            htmlFor="manager"
            helpText="Cannot create a reporting loop."
            className="md:col-span-2"
          >
            <Select
              id="manager"
              value={form.reports_to}
              placeholder="No manager"
              options={managers
                .filter((row) => String(row.id) !== employeeId)
                .map((row) => ({ value: row.id, label: `${row.employee_code} · ${row.full_name}` }))}
              onChange={(event) => set("reports_to", event.target.value)}
            />
          </FormField>
          {hasPerm("hrm.view_employee_salary") || !employeeId ? (
            <FormField
              label="Basic monthly salary (NPR)"
              htmlFor="salary"
              helpText="Visible only to people allowed to see salary."
              className="md:col-span-2"
            >
              <Input
                id="salary"
                inputMode="decimal"
                value={form.basic_salary}
                onChange={(event) => set("basic_salary", event.target.value)}
                placeholder="0"
              />
            </FormField>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-[#E8E8E5] bg-white p-5 dark:border-[#174261] dark:bg-[#061824]">
        <h2 className="mb-4 text-[13px] font-bold tracking-wide text-[#04314A] dark:text-[#F7F7F5]">
          Emergency contact
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Contact name" htmlFor="ec-name">
            <Input
              id="ec-name"
              value={form.emergency_contact_name}
              onChange={(event) => set("emergency_contact_name", event.target.value)}
            />
          </FormField>
          <FormField label="Contact phone" htmlFor="ec-phone">
            <Input
              id="ec-phone"
              value={form.emergency_contact_phone}
              onChange={(event) => set("emergency_contact_phone", event.target.value)}
            />
          </FormField>
          <FormField label="Notes" htmlFor="notes" className="md:col-span-2">
            <Input id="notes" value={form.notes} onChange={(event) => set("notes", event.target.value)} />
          </FormField>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-[13px] font-bold tracking-wide text-[#04314A] dark:text-[#F7F7F5]">
            Attached documents
          </h2>
          <p className="mt-1 text-[12px] text-[#737373]">
            Each employee keeps their own files — citizenship, contracts, photos, and other HR paperwork.
          </p>
        </div>
        {activeId ? (
          <DocumentAttachmentWidget
            targetType="employee"
            targetId={activeId}
            targetTitle={form.full_name || savedEmployee?.full_name || `Employee #${activeId}`}
            canManage={canManageDocs}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-[#E8E8E5] bg-white px-5 py-8 text-center dark:border-[#174261] dark:bg-[#061824]">
            <FileText size={22} className="mx-auto text-[#00AAEB]" />
            <p className="mt-3 text-[13px] font-semibold text-[#04314A] dark:text-[#F7F7F5]">
              Save the employee to attach documents
            </p>
            <p className="mt-1 text-[12px] text-[#737373]">
              After creating the record, upload or link files here — the same Attached Documents panel used on
              shipments.
            </p>
          </div>
        )}
      </section>

      {error ? (
        <p className="text-[12px] text-[#DC2626]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#E8E8E5] bg-white/95 px-4 py-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none dark:border-[#174261] dark:bg-[#061824]/95">
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => onNavigate(activeId ? `hr-employees/${activeId}` : "hr-employees")}
          >
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {activeId ? "Save changes" : "Create employee"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmployeeProfile({
  employeeId,
  onNavigate,
  initialTab = "overview",
}: {
  employeeId: string;
  onNavigate: (path: string) => void;
  initialTab?: "overview" | "documents" | "activity" | "history";
}) {
  const { hasPerm } = useAuth();
  const toast = useToast();
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [tab, setTab] = useState<"overview" | "documents" | "activity" | "history">(initialTab);
  const [changes, setChanges] = useState<ChangeRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [statusOpen, setStatusOpen] = useState(false);
  const [status, setStatus] = useState("resigned");
  const [effective, setEffective] = useState("");
  const [reason, setReason] = useState("");
  const [deactivate, setDeactivate] = useState(true);

  function load() {
    api.get<EmployeeRow>(`/api/hrm/employees/${employeeId}/`).then(setEmployee).catch((error) => {
      toast.push(error instanceof ApiError ? error.message : "Employee not found");
    });
    api.get<{ changes: ChangeRow[]; status_history: HistoryRow[] }>(`/api/hrm/employees/${employeeId}/activity/`).then((data) => {
      setChanges(data.changes);
      setHistory(data.status_history);
    }).catch(() => undefined);
  }

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, employeeId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  async function postAccount(body: Record<string, unknown>) {
    try {
      await api.post(`/api/hrm/employees/${employeeId}/account/`, body);
      toast.push("Account updated.");
      load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : "Could not update the account.");
    }
  }

  if (!employee) return <p className="text-[13px] text-[#737373]">Loading employee…</p>;

  return (
    <div className="space-y-4">
      <PageHeader
        title={employee.full_name}
        subtitle={`${employee.employee_code} · ${employee.designation || "No position"} · ${employee.department_name || "No department"}`}
        badge={<Badge status={employee.employment_status} />}
        actions={
          <div className="flex gap-2">
            {hasPerm("hrm.manage_employee") ? <Button variant="secondary" onClick={() => onNavigate(`hr-employees/${employee.id}/edit`)}>Edit</Button> : null}
            {hasPerm("hrm.change_employee_status") ? <Button variant="secondary" onClick={() => setStatusOpen(true)}>Change status</Button> : null}
            <Button variant="ghost" onClick={() => onNavigate("hr-employees")}>Back</Button>
          </div>
        }
      />
      <div className="flex flex-wrap gap-2">
        {(["overview", "documents", "activity", "history"] as const).map((item) => (
          <Button key={item} size="sm" variant={tab === item ? "primary" : "secondary"} onClick={() => setTab(item)}>
            {item === "history" ? "Status history" : item[0].toUpperCase() + item.slice(1)}
          </Button>
        ))}
      </div>
      {tab === "overview" ? (
        <div className="space-y-3 rounded-xl border border-[#E8E8E5] bg-white p-4 text-[13px] dark:border-[#174261] dark:bg-[#061824]">
          <p>Joined <DateDisplay value={employee.joining_date} /></p>
          <p>Reports to {employee.reports_to_name || "nobody"}</p>
          <p>Type {employee.employment_type_name || "not set"}</p>
          <p>Branch {employee.dealer_name || "not set"}</p>
          <p>Phone {employee.phone || "—"} · {employee.email || "no email"}</p>
          {employee.basic_salary ? <p>Basic salary NPR {employee.basic_salary}</p> : null}
          <div className="border-t border-[#E8E8E5] pt-3 dark:border-[#174261]">
            <h3 className="font-semibold">Account</h3>
            {employee.username ? (
              <p className="mt-1">{employee.username} is {employee.user_is_active ? "active" : "inactive"}.</p>
            ) : (
              <p className="mt-1">No login yet. Create it from Users after this employee record is saved.</p>
            )}
            {hasPerm("hrm.assign_user") && employee.username ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => postAccount({ action: "unlink" })}>Unlink</Button>
                <Button variant="secondary" onClick={() => postAccount({ action: employee.user_is_active ? "deactivate" : "activate" })}>
                  {employee.user_is_active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {tab === "documents" ? (
        <DocumentAttachmentWidget targetType="employee" targetId={employee.id} targetTitle={employee.full_name} canManage={hasPerm("hrm.manage_employee")} />
      ) : null}
      {tab === "activity" ? (
        <ul className="divide-y divide-[#E8E8E5] rounded-xl border border-[#E8E8E5] dark:divide-[#174261] dark:border-[#174261]">
          {changes.map((row) => (
            <li key={row.id} className="px-4 py-3 text-[12px]">
              <span className="font-semibold">{row.field_name}</span> {row.old_value || "—"} → {row.new_value || "—"}
              <span className="block text-[#737373]">{row.changed_by} · {row.changed_at}</span>
            </li>
          ))}
          {changes.length === 0 ? <li className="px-4 py-3 text-[12px] text-[#737373]">No changes recorded yet.</li> : null}
        </ul>
      ) : null}
      {tab === "history" ? (
        <ul className="divide-y divide-[#E8E8E5] rounded-xl border border-[#E8E8E5] dark:divide-[#174261] dark:border-[#174261]">
          {history.map((row) => (
            <li key={row.id} className="px-4 py-3 text-[12px]">
              <Badge status={row.status} /> <DateDisplay value={row.effective_date} /> {row.reason}
              <span className="block text-[#737373]">{row.changed_by}</span>
            </li>
          ))}
          {history.length === 0 ? <li className="px-4 py-3 text-[12px] text-[#737373]">No status changes yet.</li> : null}
        </ul>
      ) : null}
      <Modal
        isOpen={statusOpen}
        title="Change employment status"
        onClose={() => setStatusOpen(false)}
        footer={<Button onClick={async () => {
          try {
            await api.post(`/api/hrm/employees/${employee.id}/status/`, {
              employment_status: status,
              effective_date: effective,
              reason,
              deactivate_user: deactivate,
            });
            setStatusOpen(false);
            load();
          } catch (error) {
            toast.push(error instanceof ApiError ? error.message : "Could not change status.");
          }
        }}>Save status</Button>}
      >
        <div className="space-y-3">
          <FormField label="Status" htmlFor="new-status">
            <Select id="new-status" value={status} options={[{ value: "active", label: "Active" }, { value: "resigned", label: "Resigned" }, { value: "terminated", label: "Terminated" }, { value: "inactive", label: "Inactive" }]} onChange={(event) => setStatus(event.target.value)} />
          </FormField>
          <FormField label="Effective date" htmlFor="eff">
            <DatePicker id="eff" value={effective || null} onChange={(iso) => setEffective(iso ?? "")} />
          </FormField>
          <FormField label="Reason" htmlFor="reason"><Input id="reason" value={reason} onChange={(event) => setReason(event.target.value)} /></FormField>
          {employee.user ? (
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={deactivate} onChange={(event) => setDeactivate(event.target.checked)} />
              Deactivate the linked user account
            </label>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

async function downloadCsv(push: (message: string) => void) {
  const { API_BASE, getTokens } = await import("@/lib/api");
  const tokenValue = getTokens()?.access;
  const response = await fetch(`${API_BASE}/api/hrm/employees/export-csv/`, {
    headers: tokenValue ? { Authorization: `Bearer ${tokenValue}` } : {},
  });
  if (!response.ok) {
    push("Export was not allowed.");
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "employees.csv";
  link.click();
  URL.revokeObjectURL(url);
}
