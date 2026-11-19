"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, KeyRound, Shield, Search } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  Button,
  Input,
  Textarea,
  FormField,
  Modal,
  PageHeader,
  Badge,
  ConfirmDialog,
  EmptyState,
} from "@/components/ui";

export type Role = {
  id: number;
  name: string;
  description: string;
  is_dealer_role?: boolean;
  permissions: string[];
  permission_names: Record<string, string>;
  user_count: number;
};

export type PermissionRow = {
  id: number;
  label: string;
  name: string;
  app_label: string;
  codename: string;
  human_title?: string;
  action?: string;
  module_name?: string;
  description?: string;
  is_system?: boolean;
};

export async function fetchRoles(): Promise<Role[]> {
  const data = await api<Role[] | { results: Role[] }>("/api/roles/");
  return Array.isArray(data) ? data : (data.results ?? []);
}

const PROTECTED_ROLES = ["Super Admin"];

function RoleForm({
  initial,
  allPermissions,
  onClose,
  onSaved,
}: {
  initial: Role | null;
  allPermissions: PermissionRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [isDealerRole, setIsDealerRole] = useState(initial?.is_dealer_role ?? false);
  const [selected, setSelected] = useState<string[]>(initial?.permissions ?? []);
  const [search, setSearch] = useState("");
  const [activeModule, setActiveModule] = useState<string>("all");
  const [showSystem, setShowSystem] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isEdit = !!initial;
  const isProtected = initial != null && PROTECTED_ROLES.includes(initial.name);

  // Group permissions by their human module name
  const availablePermissions = useMemo(() => {
    return allPermissions.filter((p) => {
      if (!showSystem && p.is_system) return false;
      return true;
    });
  }, [allPermissions, showSystem]);

  const modules = useMemo(() => {
    const set = new Set<string>();
    availablePermissions.forEach((p) => set.add(p.module_name || "General"));
    return ["all", ...Array.from(set).sort()];
  }, [availablePermissions]);

  const filteredPermissions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return availablePermissions.filter((p) => {
      if (activeModule !== "all" && (p.module_name || "General") !== activeModule) {
        return false;
      }
      if (!q) return true;
      return (
        p.label.toLowerCase().includes(q) ||
        p.codename.toLowerCase().includes(q) ||
        (p.human_title && p.human_title.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.module_name && p.module_name.toLowerCase().includes(q))
      );
    });
  }, [availablePermissions, search, activeModule]);

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionRow[]>();
    for (const p of filteredPermissions) {
      const mod = p.module_name || "General";
      if (!map.has(mod)) map.set(mod, []);
      map.get(mod)!.push(p);
    }
    return map;
  }, [filteredPermissions]);

  const toggle = (label: string) => {
    if (selected.includes(label)) {
      setSelected(selected.filter((x) => x !== label));
    } else {
      setSelected([...selected, label]);
    }
  };

  const selectAllInModule = (perms: PermissionRow[]) => {
    const toAdd = perms.map((p) => p.label).filter((l) => !selected.includes(l));
    setSelected([...selected, ...toAdd]);
  };

  const clearModule = (perms: PermissionRow[]) => {
    const toRemove = new Set(perms.map((p) => p.label));
    setSelected(selected.filter((l) => !toRemove.has(l)));
  };

  const selectViewOnlyInModule = (perms: PermissionRow[]) => {
    const viewLabels = perms
      .filter((p) => p.action === "View" || p.codename.startsWith("view_"))
      .map((p) => p.label);
    const toRemove = new Set(perms.map((p) => p.label));
    const kept = selected.filter((l) => !toRemove.has(l));
    setSelected([...kept, ...viewLabels]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Role name is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        is_dealer_role: isDealerRole,
        permissions: selected,
      };
      if (isEdit && initial) {
        await api(`/api/roles/${initial.id}/`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/roles/", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen
      title={isEdit ? `Edit Role: ${initial?.name}` : "Create New Role"}
      subtitle="Define role name and select granular permissions."
      onClose={onClose}
      size="xl"
    >
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Role Name" required error={!name.trim() && error ? error : ""}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sales Executive, Technician"
            disabled={isProtected}
            autoFocus={!isEdit}
          />
        </FormField>

        <FormField label="Description" helpText="One sentence describing what this role is for.">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief explanation of this role's scope and purpose."
            rows={2}
          />
        </FormField>

        <label className="flex items-center gap-3 cursor-pointer select-none py-1">
          <input
            type="checkbox"
            checked={isDealerRole}
            onChange={(e) => setIsDealerRole(e.target.checked)}
            className="w-4 h-4 accent-[#00AAEB]"
          />
          <span className="text-[12px] font-semibold text-[#04314A]">
            Dealer-scoped role (requires assigned home dealership)
          </span>
        </label>

        {/* Permissions Picker */}
        <div className="pt-2 border-t border-[#E8E8E5]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <div>
              <span className="text-[12px] font-semibold text-[#04314A] block">
                Assign Permissions
              </span>
              <span className="text-[11px] text-[#737373]">
                {selected.length} of {availablePermissions.length} permissions assigned
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search permissions..."
                leftIcon={<Search size={14} />}
                className="max-w-xs"
              />
            </div>
          </div>

          {/* Module Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3">
            {modules.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setActiveModule(m)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide whitespace-nowrap transition-colors ${
                  activeModule === m
                    ? "bg-[#04314A] text-white"
                    : "bg-[#F7F7F5] text-[#737373] hover:text-[#04314A] hover:bg-[#E8E8E5]"
                }`}
              >
                {m === "all" ? "All Modules" : m}
              </button>
            ))}
          </div>

          {/* Grouped Permission Checkboxes */}
          <div className="max-h-72 overflow-y-auto space-y-4 pr-1">
            {grouped.size === 0 ? (
              <p className="text-[12px] text-[#737373] text-center py-6">
                No permissions match your filter.
              </p>
            ) : (
              Array.from(grouped.entries()).map(([mod, perms]) => {
                const selectedInGroup = perms.filter((p) => selected.includes(p.label)).length;
                const isAllSelected = selectedInGroup === perms.length;

                return (
                  <div key={mod} className="bg-[#FAFAF8] rounded-lg p-3 border border-[#E8E8E5]">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#E8E8E5]">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold text-[#04314A]">{mod}</span>
                        <span className="text-[11px] text-[#737373]">
                          ({selectedInGroup} of {perms.length} selected)
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => (isAllSelected ? clearModule(perms) : selectAllInModule(perms))}
                        >
                          {isAllSelected ? "Deselect All" : "Select All"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => selectViewOnlyInModule(perms)}
                        >
                          View Only
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {perms.map((p) => {
                        const checked = selected.includes(p.label);
                        return (
                          <label
                            key={p.label}
                            className={`flex items-start gap-2.5 p-2 rounded-md border cursor-pointer transition-colors ${
                              checked
                                ? "border-[#00AAEB] bg-white shadow-xs"
                                : "border-[#E8E8E5] bg-white hover:border-[#D4D4CE]"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(p.label)}
                              className="w-4 h-4 mt-0.5 accent-[#00AAEB] shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-semibold text-[#04314A]">
                                  {p.human_title || p.name}
                                </span>
                                {p.action && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.2 rounded bg-[#F7F7F5] text-[#737373] border border-[#E8E8E5]">
                                    {p.action}
                                  </span>
                                )}
                              </div>
                              {p.description && (
                                <p className="text-[10px] text-[#737373] mt-0.5 leading-snug">
                                  {p.description}
                                </p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-[#E8E8E5] flex items-center justify-between text-[11px] text-[#737373]">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showSystem}
                onChange={(e) => setShowSystem(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#00AAEB]"
              />
              <span>Show internal system permissions</span>
            </label>
            <span>Total permissions: {allPermissions.length}</span>
          </div>
        </div>

        {error && (
          <p className="text-[12px] font-medium text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] p-3 rounded-lg">
            {error}
          </p>
        )}

        <div data-modal-actions className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E8E8E5]">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {isEdit ? "Save Changes" : "Create Role"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function RolesManager() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([
      fetchRoles(),
      api<PermissionRow[] | { results: PermissionRow[] }>("/api/permissions/"),
    ])
      .then(([r, p]) => {
        setRoles(r);
        setPermissions(Array.isArray(p) ? p : (p.results ?? []));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load roles"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (PROTECTED_ROLES.includes(deleteTarget.name)) {
      setError("The Super Admin role cannot be deleted.");
      setDeleteTarget(null);
      return;
    }
    setDeleteLoading(true);
    try {
      await api(`/api/roles/${deleteTarget.id}/`, { method: "DELETE" });
      setStatusMessage(`Role "${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & Permissions"
        subtitle="Bundle granular permissions into roles and assign them to staff members."
        actions={
          <Button
            variant="primary"
            leftIcon={<Plus size={15} />}
            onClick={() => setCreating(true)}
          >
            Add Role
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

      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8] text-[11px] font-semibold text-[#04314A] tracking-[0.02em]">
                <th className="px-5 py-3">Role Name</th>
                <th className="px-5 py-3">Scope</th>
                <th className="px-5 py-3">Granted Permissions</th>
                <th className="px-5 py-3">Members</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E8E5]">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={`skel-${i}`}>
                    <td className="px-5 py-3.5" colSpan={5}>
                      <div className="h-4 bg-[#F0F0ED] rounded max-w-[60%]" />
                    </td>
                  </tr>
                ))
              ) : roles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center">
                    <EmptyState
                      title="No roles defined"
                      description="Click 'Add Role' to configure roles."
                      className="border-0 shadow-none p-0"
                    />
                  </td>
                </tr>
              ) : (
                roles.map((r) => {
                  const isProtected = PROTECTED_ROLES.includes(r.name);
                  return (
                    <tr key={r.id} className="hover:bg-[#FAFAF8] transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-[#04314A]">{r.name}</span>
                          {isProtected && (
                            <Badge variant="info" size="sm">
                              Protected
                            </Badge>
                          )}
                        </div>
                        {r.description && (
                          <p className="text-[11px] text-[#737373] mt-0.5 max-w-sm">
                            {r.description}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={r.is_dealer_role ? "warning" : "neutral"} size="sm">
                          {r.is_dealer_role ? "Dealer Scoped" : "Head Office / Global"}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-[#04314A]">
                        {isProtected ? (
                          <span className="font-medium text-[#737373]">All system permissions</span>
                        ) : (
                          <span>{r.permissions.length} permissions</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant="neutral" size="sm">
                          {r.user_count} user{r.user_count === 1 ? "" : "s"}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditing(r)}
                            aria-label={`Edit ${r.name}`}
                          >
                            <Pencil size={13} />
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={isProtected}
                            onClick={() => setDeleteTarget(r)}
                            aria-label={`Delete ${r.name}`}
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
      </div>

      {(creating || editing) && (
        <RoleForm
          initial={editing}
          allPermissions={permissions}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={load}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          isOpen={Boolean(deleteTarget)}
          title={`Delete role "${deleteTarget.name}"?`}
          description={`Assigned users (${deleteTarget.user_count}) will lose all permissions provided by this role.`}
          confirmLabel="Delete Role"
          cancelLabel="Keep Role"
          variant="danger"
          loading={deleteLoading}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
