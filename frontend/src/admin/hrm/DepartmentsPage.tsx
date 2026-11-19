"use client";

import { useEffect, useState } from "react";
import { Badge, Button, DataTable, FormField, Input, PageHeader, Select } from "@/components/ui";
import { useToast } from "../crm/ui";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "../AuthContext";

type DepartmentRow = {
  id: number;
  name: string;
  code: string;
  parent: number | null;
  parent_name: string;
  head: number | null;
  head_name: string;
  is_active: boolean;
  employee_count: number;
};

type EmployeeOption = { id: number; employee_code: string; full_name: string };

export default function DepartmentsPage() {
  const { hasPerm } = useAuth();
  const toast = useToast();
  const canManage = hasPerm("hrm.manage_department");
  const [rows, setRows] = useState<DepartmentRow[]>([]);
  const [people, setPeople] = useState<EmployeeOption[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [parent, setParent] = useState("");
  const [head, setHead] = useState("");

  function load() {
    api.get<DepartmentRow[]>("/api/hrm/departments/").then(setRows).catch((error) => {
      toast.push(error instanceof ApiError ? error.message : "Could not load departments");
    });
  }

  useEffect(() => {
    load();
    api.get<EmployeeOption[]>("/api/hrm/employees/").then(setPeople).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader title="Departments" subtitle="A department can have a parent and one head. The head sees everyone in it and in child departments." />
      {canManage ? (
        <div className="grid gap-3 rounded-xl border border-[#E8E8E5] bg-white p-4 md:grid-cols-2 dark:border-[#1B5039] dark:bg-[#071713]">
          <FormField label="Name" htmlFor="dept-name" required><Input id="dept-name" value={name} onChange={(event) => setName(event.target.value)} /></FormField>
          <FormField label="Code" htmlFor="dept-code" required><Input id="dept-code" value={code} onChange={(event) => setCode(event.target.value)} /></FormField>
          <FormField label="Parent" htmlFor="dept-parent">
            <Select id="dept-parent" value={parent} placeholder="No parent" options={rows.map((row) => ({ value: row.id, label: row.name }))} onChange={(event) => setParent(event.target.value)} />
          </FormField>
          <FormField label="Head" htmlFor="dept-head">
            <Select id="dept-head" value={head} placeholder="No head" options={people.map((row) => ({ value: row.id, label: `${row.employee_code} ${row.full_name}` }))} onChange={(event) => setHead(event.target.value)} />
          </FormField>
          <Button
            onClick={async () => {
              try {
                await api.post("/api/hrm/departments/", { name, code, parent: parent || null, head: head || null, is_active: true });
                setName("");
                setCode("");
                load();
              } catch (error) {
                toast.push(error instanceof ApiError ? error.message : "Could not save the department.");
              }
            }}
          >
            Add department
          </Button>
        </div>
      ) : null}
      <DataTable
        data={rows}
        keyExtractor={(row) => row.id}
        columns={[
          { key: "name", header: "Name", sortable: true },
          { key: "code", header: "Code", sortable: true },
          { key: "parent_name", header: "Parent" },
          { key: "head_name", header: "Head" },
          { key: "employee_count", header: "Employees", sortable: true },
          { key: "is_active", header: "Active", render: (row) => <Badge status={row.is_active ? "active" : "inactive"} /> },
        ]}
      />
    </div>
  );
}
