"use client";

import { useEffect, useState } from "react";
import { Badge, Button, DataTable, FormField, Input, PageHeader } from "@/components/ui";
import { useToast } from "../crm/ui";
import { ApiError, api } from "@/lib/api";

type EmploymentTypeRow = { id: number; name: string; code: string; is_active: boolean; sort_order: number };

export default function EmploymentTypesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<EmploymentTypeRow[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  function load() {
    api.get<EmploymentTypeRow[]>("/api/hrm/employment-types/").then(setRows).catch((error) => {
      toast.push(error instanceof ApiError ? error.message : "Could not load employment types");
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Employment types"
        subtitle="Seeded with Full-time, Part-time, Contract, Probation, Intern, and Daily wage. Add more when the company needs them."
      />
      <div className="grid gap-3 rounded-xl border border-[#E8E8E5] bg-white p-4 md:grid-cols-3 dark:border-[#174261] dark:bg-[#061824]">
        <FormField label="Name" htmlFor="type-name" required><Input id="type-name" value={name} onChange={(event) => setName(event.target.value)} /></FormField>
        <FormField label="Code" htmlFor="type-code" required><Input id="type-code" value={code} onChange={(event) => setCode(event.target.value)} /></FormField>
        <div className="flex items-end">
          <Button
            onClick={async () => {
              try {
                await api.post("/api/hrm/employment-types/", { name, code, is_active: true, sort_order: rows.length + 1 });
                setName("");
                setCode("");
                load();
              } catch (error) {
                toast.push(error instanceof ApiError ? error.message : "Could not save the employment type.");
              }
            }}
          >
            Add type
          </Button>
        </div>
      </div>
      <DataTable
        data={rows}
        keyExtractor={(row) => row.id}
        columns={[
          { key: "name", header: "Name", sortable: true },
          { key: "code", header: "Code", sortable: true },
          { key: "is_active", header: "Active", render: (row) => <Badge status={row.is_active ? "active" : "inactive"} /> },
        ]}
      />
    </div>
  );
}
