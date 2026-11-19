"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Search, Plus } from "lucide-react";
import { crm, formatNpr, type Customer } from "./data";
import { useCrmMeta } from "./useOptions";
import { EntityLink, NewCustomerModal } from "../components/pickers";
import {
  Button,
  Input,
  Select,
  PageHeader,
  Badge,
} from "@/components/ui";
import { Pagination } from "./ui";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

export default function CustomersPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeF, setTypeF] = useState("all");
  const [statusF, setStatusF] = useState("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [creating, setCreating] = useState(false);
  const meta = useCrmMeta();

  useEffect(() => {
    crm.customers()
      .then(setCustomers)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      customers.filter((c) => {
        if (typeF !== "all" && c.type !== typeF) return false;
        if (statusF !== "all" && c.status !== statusF) return false;
        if (search) {
          const q = search.toLowerCase();
          if (!`${c.name} ${c.company} ${c.email} ${c.phone}`.toLowerCase().includes(q)) return false;
        }
        return true;
      }),
    [customers, search, typeF, statusF]
  );

  const pageCount = Math.ceil(filtered.length / pageSize) || 1;
  const rows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const cols = ["ID", "Customer Name", "Company", "Phone", "Vehicles", "Total Purchases", "Status", "Actions"];

  const typeOptions = useMemo(
    () => [
      { value: "all", label: "All Types" },
      ...meta.customerTypes.map((t) => ({ value: t, label: t })),
    ],
    [meta.customerTypes]
  );

  const statusOptions = [
    { value: "all", label: "All Statuses" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        subtitle="Customer database across commercial, fleet, and individual segments."
        actions={
          <Button
            variant="primary"
            leftIcon={<Plus size={15} />}
            onClick={() => setCreating(true)}
          >
            Add Customer
          </Button>
        }
      />

      {error && (
        <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-[12px] font-medium rounded-lg">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search name, company, email, phone..."
            leftIcon={<Search size={15} />}
          />
        </div>
        <div className="w-44">
          <Select
            value={typeF}
            onChange={(e) => {
              setTypeF(e.target.value);
              setPage(0);
            }}
            options={typeOptions}
          />
        </div>
        <div className="w-40">
          <Select
            value={statusF}
            onChange={(e) => {
              setStatusF(e.target.value);
              setPage(0);
            }}
            options={statusOptions}
          />
        </div>
      </div>

      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[920px]">
            <thead>
              <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8] text-[11px] font-semibold text-[#0B3D2B] tracking-[0.02em]">
                {cols.map((h) => (
                  <th
                    key={h}
                    className={`px-5 py-3 ${h === "Actions" ? "text-right" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E8E5]">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skel-${i}`}>
                    <td colSpan={cols.length} className="px-5 py-3.5">
                      <div className="h-4 bg-[#F0F0ED] rounded max-w-[60%]" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={cols.length} className="px-5 py-12 text-center text-[13px] text-[#737373]">
                    No customers match your criteria.
                  </td>
                </tr>
              ) : (
                rows.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-[#FAFAF8] transition-colors cursor-pointer"
                    onClick={() => onNavigate(`crm-customers/${c.id}`)}
                  >
                    <td className="px-5 py-3.5 text-[12px] font-semibold text-[#737373] whitespace-nowrap">
                      {c.displayId ?? `CS-${c.id}`}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] font-semibold text-[#0B3D2B]">
                      <EntityLink type="customer" id={c.id} label={c.name} />
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373]">{c.company || "-"}</td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                      {c.phone}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                      {c.vehicles.length > 0
                        ? `${c.vehicles.length} vehicle${c.vehicles.length === 1 ? "" : "s"}`
                        : "-"}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] font-semibold text-[#0B3D2B] whitespace-nowrap">
                      {formatNpr(c.totalPurchases)}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge
                        variant={c.status === "active" ? "success" : "neutral"}
                        size="sm"
                        dot
                      >
                        {c.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onNavigate(`crm-customers/${c.id}`)}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 && (
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
        )}
      </div>

      {creating && (
        <NewCustomerModal
          onClose={() => setCreating(false)}
          onCreated={(newCust) => {
            setCreating(false);
            crm.customers().then(setCustomers);
            onNavigate(`crm-customers/${newCust.id}`);
          }}
        />
      )}
    </div>
  );
}
