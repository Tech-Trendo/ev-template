"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Shield, Search, ShieldAlert } from "lucide-react";
import { api, ApiError, getTokens } from "@/lib/api";
import { fetchDealers, type Dealer } from "./DealersManager";
import { fetchRoles, type Role } from "./RolesManager";
import {
  Button,
  Input,
  Select,
  FormField,
  Modal,
  PageHeader,
  Badge,
  ConfirmDialog,
  EmptyState,
} from "@/components/ui";
import { Pagination } from "./crm/ui";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

type AdminUser = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  date_joined: string;
  last_login: string | null;
  roles: number[];
  role_names: string[];
  dealer: number | null;
  dealer_name: string;
  // Extended employee profile
  phone?: string;
  date_of_birth?: string | null;
  pan_vat_number?: string;
  citizenship_number?: string;
  temporary_address?: string;
  permanent_address?: string;
  personal_email?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  join_date?: string | null;
  department?: string;
  employee_id?: number | null;
  employee_code?: string;
  employee_name?: string;
  designation?: string;
  employment_status?: string;
  photo_url?: string;
  photo_external_url?: string;
  can_view_sensitive?: boolean;
};

type PaginatedUsers = {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: AdminUser[];
};

function getCurrentUserId(): number | null {
  try {
    const tokens = getTokens();
    if (!tokens?.access) return null;
    const payload = tokens.access.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.user_id === "number"
      ? json.user_id
      : typeof json.user_id === "string"
      ? Number(json.user_id)
      : null;
  } catch {
    return null;
  }
}

type UnlinkedEmployee = {
  id: number;
  employee_code: string;
  full_name: string;
  phone: string;
  email: string;
  designation: string;
  department_name: string;
  joining_date: string | null;
  temporary_address: string;
  permanent_address: string;
  user: number | null;
};

function EmployeeSummary({
  name,
  code,
  phone,
  department,
  designation,
  joined,
}: {
  name: string;
  code: string;
  phone?: string;
  department?: string;
  designation?: string;
  joined?: string | null;
}) {
  return (
    <div className="rounded-lg border border-[#E8E8E5] bg-[#FAFAF8] px-4 py-3 text-[12px] text-[#0B3D2B]">
      <div className="font-semibold mb-1.5">From employee record</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[#737373]">
        <div>
          <span className="font-medium text-[#0B3D2B]">Name:</span> {name || "—"}
        </div>
        <div>
          <span className="font-medium text-[#0B3D2B]">Sign-in:</span> {code || "—"}
        </div>
        <div>
          <span className="font-medium text-[#0B3D2B]">Phone:</span> {phone || "—"}
        </div>
        <div>
          <span className="font-medium text-[#0B3D2B]">Department:</span> {department || "—"}
        </div>
        <div>
          <span className="font-medium text-[#0B3D2B]">Designation:</span> {designation || "—"}
        </div>
        <div>
          <span className="font-medium text-[#0B3D2B]">Joined:</span> {joined || "—"}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-[#A3A39E]">
        Edit name, phone, addresses, and other HR details on the Employees page.
      </p>
    </div>
  );
}

function UserForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: AdminUser | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(initial);
  const [form, setForm] = useState({
    username: initial?.username ?? "",
    email: initial?.email ?? "",
    password: "",
    confirm: "",
    is_active: initial?.is_active ?? true,
    roles: initial?.roles ?? [],
    dealer: initial?.dealer != null ? String(initial.dealer) : "",
    employee_link: initial?.employee_id != null ? String(initial.employee_id) : "",
  });

  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [allDealers, setAllDealers] = useState<Dealer[]>([]);
  const [employees, setEmployees] = useState<UnlinkedEmployee[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchRoles().then(setAllRoles).catch(() => {});
    fetchDealers().then(setAllDealers).catch(() => {});
    if (isEdit) return;
    api<UnlinkedEmployee[] | { results: UnlinkedEmployee[] }>("/api/hrm/employees/")
      .then((data) => {
        const rows = Array.isArray(data) ? data : data.results ?? [];
        setEmployees(rows.filter((row) => !row.user));
      })
      .catch(() => {});
  }, [isEdit]);

  const isDealerRoleSelected = useMemo(() => {
    return form.roles.some((rid) => {
      const r = allRoles.find((role) => role.id === rid);
      return r ? Boolean(r.is_dealer_role || r.name.toLowerCase().includes("dealer")) : false;
    });
  }, [form.roles, allRoles]);

  const selectedEmployee = useMemo(
    () => employees.find((row) => String(row.id) === form.employee_link) ?? null,
    [employees, form.employee_link]
  );

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!isEdit && !form.employee_link) {
      errors.employee_id = "Choose the employee this login is for.";
    }
    if (!form.username.trim()) {
      errors.username = "Username is required.";
    }
    if (!isEdit && !form.password) {
      errors.password = "Password is required for new accounts.";
    }
    if (form.password && form.password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }
    if (form.password && form.password !== form.confirm) {
      errors.confirm = "Passwords do not match.";
    }
    if (form.roles.length === 0) {
      errors.roles = "At least one role assignment is required.";
    }
    if (isDealerRoleSelected && !form.dealer) {
      errors.dealer = "A home dealership is required when assigning a dealer role.";
    }
    return errors;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    const clientErrors = validate();
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      return;
    }

    setBusy(true);
    try {
      // Login/access only — person fields live on Employee.
      const payload: Record<string, unknown> = {
        username: form.username.trim(),
        email: form.email.trim(),
        is_active: form.is_active,
        roles: form.roles,
        dealer: form.dealer ? Number(form.dealer) : null,
      };
      if (!isEdit) {
        payload.employee_id = Number(form.employee_link);
      }
      if (form.password) {
        payload.password = form.password;
      }

      if (isEdit && initial) {
        await api(`/api/users/${initial.id}/`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/users/", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.detail && typeof err.detail === "object") {
        const raw = err.detail as Record<string, unknown>;
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw)) {
          if (Array.isArray(v)) mapped[k] = v.join(" ");
          else if (typeof v === "string") mapped[k] = v;
        }
        setFieldErrors(mapped);
        if (mapped.non_field_errors || mapped.detail) {
          setError(mapped.non_field_errors || mapped.detail);
        } else if (Object.keys(mapped).length === 0) {
          setError(err.message);
        }
      } else {
        setError(err instanceof Error ? err.message : "Save failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  const applyEmployee = (employeeId: string) => {
    const employee = employees.find((row) => String(row.id) === employeeId);
    if (!employee) {
      setForm((current) => ({ ...current, employee_link: "", username: "", email: "" }));
      return;
    }
    setForm((current) => ({
      ...current,
      employee_link: String(employee.id),
      username: employee.employee_code,
      email: employee.email || "",
    }));
    setFieldErrors((current) => ({ ...current, employee_id: "", username: "" }));
  };

  const dealerOptions = useMemo(() => {
    return [
      {
        value: "",
        label: isDealerRoleSelected ? "Select home dealership" : "All dealerships (unscoped)",
      },
      ...allDealers.map((d) => ({ value: String(d.id), label: d.name })),
    ];
  }, [allDealers, isDealerRoleSelected]);

  return (
    <Modal
      isOpen
      title={isEdit ? `Edit User: ${initial?.username}` : "Create New User"}
      subtitle={
        isEdit
          ? "Update login credentials and dealership permissions. HR details are on the Employees page."
          : "Create a login for someone HR has already added as an employee."
      }
      onClose={onClose}
      size="xl"
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {isEdit ? (
              <FormField
                label="Username"
                error={fieldErrors.username}
                helpText={
                  initial?.employee_code
                    ? `Linked to ${initial.employee_code} ${initial.employee_name || ""}`.trim()
                    : "Sign-in name. It cannot be changed here."
                }
              >
                <Input value={form.username} disabled autoComplete="username" />
              </FormField>
            ) : (
              <FormField
                label="Employee"
                required
                error={fieldErrors.employee_id}
                helpText="HR adds the person first. Their employee ID becomes the sign-in name."
              >
                <Select
                  value={form.employee_link}
                  onChange={(e) => applyEmployee(e.target.value)}
                  placeholder="Select an employee"
                  options={employees.map((row) => ({
                    value: String(row.id),
                    label: `${row.employee_code} · ${row.full_name}`,
                  }))}
                  error={Boolean(fieldErrors.employee_id)}
                  autoFocus
                />
              </FormField>
            )}

            <FormField
              label="Work Email"
              error={fieldErrors.email}
              helpText={
                isEdit
                  ? "Corporate email address for system notifications."
                  : "Prefills from the employee record. Change only if the login email differs."
              }
            >
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="john@evos.example.com"
                autoComplete="email"
                error={Boolean(fieldErrors.email)}
              />
            </FormField>
          </div>

          {!isEdit && selectedEmployee && (
            <EmployeeSummary
              name={selectedEmployee.full_name}
              code={selectedEmployee.employee_code}
              phone={selectedEmployee.phone}
              department={selectedEmployee.department_name}
              designation={selectedEmployee.designation}
              joined={selectedEmployee.joining_date}
            />
          )}

          {isEdit && (
            <EmployeeSummary
              name={
                initial?.employee_name ||
                [initial?.first_name, initial?.last_name].filter(Boolean).join(" ") ||
                ""
              }
              code={initial?.employee_code || initial?.username || ""}
              phone={initial?.phone}
              department={initial?.department}
              designation={initial?.designation}
              joined={initial?.join_date}
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField
              label={isEdit ? "New Password" : "Password"}
              required={!isEdit}
              error={fieldErrors.password}
              helpText={isEdit ? "Leave blank to keep current password." : "Minimum 8 characters."}
            >
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={isEdit ? "Leave blank to keep current" : "Minimum 8 characters"}
                autoComplete="new-password"
                error={Boolean(fieldErrors.password)}
              />
            </FormField>

            <FormField
              label="Confirm Password"
              required={Boolean(form.password)}
              error={fieldErrors.confirm}
            >
              <Input
                type="password"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                placeholder={isEdit && !form.password ? "(Unchanged)" : "Repeat password"}
                autoComplete="new-password"
                error={Boolean(fieldErrors.confirm)}
              />
            </FormField>
          </div>

          <div>
            <span className="text-[11px] font-semibold text-[#0B3D2B] tracking-[0.02em] block mb-1.5">
              Role Assignment <span className="text-[#DC2626]">*</span>
            </span>
            {fieldErrors.roles && (
              <p className="text-[11px] text-[#DC2626] mb-1.5">{fieldErrors.roles}</p>
            )}
            {allRoles.length === 0 ? (
              <p className="text-[12px] text-[#A3A39E]">Loading roles...</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {allRoles.map((r) => {
                  const on = form.roles.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        const newRoles = on
                          ? form.roles.filter((id) => id !== r.id)
                          : [...form.roles, r.id];
                        setForm({ ...form, roles: newRoles });
                        if (fieldErrors.roles) {
                          setFieldErrors((prev) => ({ ...prev, roles: "" }));
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                        on
                          ? "bg-[#0B3D2B] text-white border-[#0B3D2B]"
                          : "bg-white text-[#737373] border-[#E8E8E5] hover:border-[#0B3D2B]"
                      }`}
                    >
                      {on ? "[x] " : "[ ] "}
                      {r.name}
                    </button>
                  );
                })}
              </div>
            )}
            {form.roles.length === 0 && (
              <div
                role="alert"
                className="mt-2.5 flex items-start gap-2 rounded-lg border border-[#E8E8E5] bg-[#F7F7F5] px-3 py-2 text-[12px] font-medium leading-relaxed text-[#0B3D2B]"
              >
                <ShieldAlert size={14} className="mt-0.5 shrink-0 text-[#10B981]" />
                <span>At least one role must be assigned to grant system permissions.</span>
              </div>
            )}
          </div>

          <FormField
            label="Home Dealership"
            required={isDealerRoleSelected}
            error={fieldErrors.dealer}
            helpText={
              isDealerRoleSelected
                ? "Dealer staff require an assigned dealership to view and manage dealer records."
                : "Optional for head office and management staff."
            }
          >
            <Select
              value={form.dealer}
              onChange={(e) => {
                setForm({ ...form, dealer: e.target.value });
                if (fieldErrors.dealer) {
                  setFieldErrors((prev) => ({ ...prev, dealer: "" }));
                }
              }}
              options={dealerOptions}
              error={Boolean(fieldErrors.dealer)}
            />
          </FormField>

          <label className="flex items-center gap-3 cursor-pointer select-none py-1">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="w-4 h-4 accent-[#10B981]"
            />
            <span className="text-[12px] font-semibold text-[#0B3D2B]">Active (can sign in)</span>
            {!form.is_active && (
              <span className="text-[11px] text-[#737373]">(inactive users cannot log in)</span>
            )}
          </label>
        </div>

        {error && (
          <p className="text-[12px] font-medium text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] p-3 rounded-lg">
            {error}
          </p>
        )}

        <div data-modal-actions className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#E8E8E5]">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {isEdit ? "Save Changes" : "Create User"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function UsersManager() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const currentUserId = useMemo(() => getCurrentUserId(), [users]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(0);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page + 1),
      page_size: String(pageSize),
    });
    if (search) params.set("search", search);
    api<PaginatedUsers>(`/api/users/?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setUsers(data.results ?? []);
        setTotal(data.count ?? 0);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load users"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, search, reloadKey]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await api(`/api/users/${deleteTarget.id}/`, { method: "DELETE" });
      setStatusMessage(`User "${deleteTarget.username}" deleted successfully.`);
      setDeleteTarget(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Delete failed";
      setError(msg);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Manage user accounts, authentication credentials, and dealership role assignments."
        actions={
          <Button
            variant="primary"
            leftIcon={<Plus size={15} />}
            onClick={() => setCreating(true)}
          >
            Add User
          </Button>
        }
      />

      {statusMessage && (
        <div className="p-3 bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] text-[12px] font-medium rounded-lg flex items-center justify-between">
          <span>{statusMessage}</span>
          <button
            type="button"
            onClick={() => setStatusMessage("")}
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

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="flex-1 w-full">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search username, email, or name..."
            leftIcon={<Search size={15} />}
          />
        </div>
        <span className="text-[12px] font-semibold text-[#737373] whitespace-nowrap self-end sm:self-center">
          {total} user{total === 1 ? "" : "s"}
        </span>
      </div>

      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8] text-[11px] font-semibold text-[#0B3D2B] tracking-[0.02em]">
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Roles & Dealer</th>
                <th className="px-5 py-3">Joined</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E8E5]">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skel-${i}`}>
                    <td className="px-5 py-3.5" colSpan={6}>
                      <div className="h-4 bg-[#F0F0ED] rounded max-w-[60%]" />
                    </td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center">
                    <EmptyState
                      title="No users found"
                      description="No user accounts match your search filter."
                      className="border-0 shadow-none p-0"
                    />
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isSelf = currentUserId !== null && u.id === currentUserId;
                  return (
                    <tr key={u.id} className="hover:bg-[#FAFAF8] transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#0B3D2B] text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                            {u.username.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-[13px] font-semibold text-[#0B3D2B] flex items-center gap-2">
                              {u.username}
                              {isSelf && (
                                <Badge variant="info" size="sm">
                                  You
                                </Badge>
                              )}
                            </div>
                            {(u.first_name || u.last_name) && (
                              <div className="text-[11px] text-[#737373]">
                                {[u.first_name, u.last_name].filter(Boolean).join(" ")}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-[#737373]">{u.email || "-"}</td>
                      <td className="px-5 py-3.5">
                        <Badge variant={u.is_active ? "success" : "neutral"} size="sm" dot>
                          {u.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        {u.is_superuser ? (
                          <Badge variant="info" size="sm">
                            <Shield size={11} className="mr-1 inline" /> Super Admin
                          </Badge>
                        ) : (u.role_names ?? []).length > 0 ? (
                          <div className="text-[12px] font-medium text-[#0B3D2B]">
                            {(u.role_names ?? []).join(", ")}
                            {u.dealer_name && (
                              <span className="block text-[11px] font-normal text-[#737373]">
                                @ {u.dealer_name}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#737373]">No roles assigned</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                        {new Date(u.date_joined).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditing(u)}
                            aria-label={`Edit ${u.username}`}
                          >
                            <Pencil size={13} />
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={Boolean(isSelf)}
                            onClick={() => setDeleteTarget(u)}
                            aria-label={`Delete ${u.username}`}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && !loading && (
          <Pagination
            page={page}
            pageCount={Math.ceil(total / pageSize) || 1}
            onPage={setPage}
            total={total}
            pageSize={pageSize}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(0);
            }}
          />
        )}
      </div>

      {(creating || editing) && (
        <UserForm
          initial={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          isOpen={Boolean(deleteTarget)}
          title={`Delete user account "${deleteTarget.username}"?`}
          description="This action cannot be undone. The user will immediately lose all access to the system."
          confirmLabel="Delete User"
          cancelLabel="Keep User"
          variant="danger"
          loading={deleteLoading}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
