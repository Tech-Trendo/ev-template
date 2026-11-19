"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Search, Plus } from "lucide-react";
import { crm, formatNpr, quotationLabel, type Customer, type Quotation, type QuotationStatus } from "./data";
import { useCrmMeta } from "./useOptions";
import { QuotationModal } from "./modals";
import { EntityLink } from "../components/pickers";
import { fetchVariants, type VehicleVariant } from "@/lib/inventory";
import {
  Button,
  Input,
  Select,
  PageHeader,
  Badge,
} from "@/components/ui";
import { Pagination } from "./ui";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

export default function QuotationsPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [quotes, setQuotes] = useState<Quotation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [variants, setVariants] = useState<VehicleVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [variantF, setVariantF] = useState("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [creating, setCreating] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const meta = useCrmMeta();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const sParam = params.get("status");
      const qParam = params.get("search");
      if (sParam) setStatusF(sParam);
      if (qParam) setSearch(qParam);
    }
  }, []);

  const load = () => {
    setLoading(true);
    Promise.all([crm.quotations(), crm.customers(), fetchVariants({ is_active: "true" })])
      .then(([qs, custs, vars]) => {
        setQuotes(qs);
        setCustomers(custs);
        setVariants(vars);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(
    () =>
      quotes.filter((q) => {
        if (statusF !== "all" && q.status !== statusF) return false;
        if (variantF !== "all" && q.variantId !== variantF) return false;
        if (
          search &&
          !`${q.id} ${q.displayId || ""} ${q.referenceNo || ""} ${q.customerName} ${q.company} ${q.vehicle}`
            .toLowerCase()
            .includes(search.toLowerCase())
        )
          return false;
        return true;
      }),
    [quotes, search, statusF, variantF]
  );

  const setStatus = async (q: Quotation, status: QuotationStatus) => {
    try {
      await crm.saveQuotation({ ...q, status });
      setQuotes((prev) => prev.map((x) => (x.id === q.id ? { ...x, status } : x)));
      setStatusMsg(`${q.id} marked ${status}.`);
    } catch {
      setStatusMsg("Update failed.");
    }
  };

  const duplicate = async (q: Quotation) => {
    try {
      await crm.saveQuotation({
        ...q,
        id: undefined,
        status: "draft",
        createdAt: new Date().toISOString(),
      });
      load();
      setStatusMsg(`Duplicated ${q.id} as draft.`);
    } catch {
      setStatusMsg("Duplicate failed.");
    }
  };

  const acceptQuote = async (q: Quotation) => {
    try {
      await crm.acceptQuotation(q.id);
      setQuotes((prev) => prev.map((x) => (x.id === q.id ? { ...x, status: "accepted" } : x)));
      setStatusMsg(`${q.id} accepted.`);
    } catch {
      setStatusMsg("Failed to accept quotation.");
    }
  };

  const pageCount = Math.ceil(filtered.length / pageSize) || 1;
  const rows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const cols = ["ID", "Customer", "Vehicle", "Amount", "Status", "Created", "Actions"];

  const statusOptions = useMemo(
    () => [
      { value: "all", label: "All Statuses" },
      ...meta.quotationStatuses.map((s) => ({ value: s, label: s })),
    ],
    [meta.quotationStatuses]
  );

  const getBadgeVariant = (st: string) => {
    switch (st) {
      case "accepted":
      case "converted":
        return "success";
      case "sent":
      case "viewed":
        return "info";
      case "rejected":
      case "expired":
        return "danger";
      case "draft":
      default:
        return "neutral";
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotations"
        subtitle="Pricing proposals and formal quotations across the sales pipeline."
        actions={
          <Button
            variant="primary"
            leftIcon={<Plus size={15} />}
            onClick={() => setCreating(true)}
          >
            New Quotation
          </Button>
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

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search quotation #, customer, vehicle..."
            leftIcon={<Search size={15} />}
          />
        </div>
        <div className="w-48">
          <Select
            value={statusF}
            onChange={(e) => {
              setStatusF(e.target.value);
              setPage(0);
            }}
            options={statusOptions}
          />
        </div>
        {variants.length > 0 && (
          <div className="w-48">
            <Select
              value={variantF}
              onChange={(e) => {
                setVariantF(e.target.value);
                setPage(0);
              }}
              options={[
                { value: "all", label: "All Variants" },
                ...variants.map((v) => ({
                  value: String(v.id),
                  label: v.name,
                })),
              ]}
            />
          </div>
        )}
      </div>

      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[960px]">
            <thead>
              <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8] text-[11px] font-semibold text-[#04314A] tracking-[0.02em]">
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
                    No quotations match your criteria.
                  </td>
                </tr>
              ) : (
                rows.map((q) => (
                  <tr
                    key={q.id}
                    className="hover:bg-[#FAFAF8] transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <EntityLink
                          type="quotation"
                          id={q.id}
                          label={quotationLabel(q)}
                          onNavigate={onNavigate}
                        />
                        {q.convertedToOrder && (
                          <Badge variant="neutral" size="sm">
                            Sold
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {q.customerId ? (
                        <EntityLink
                          type="customer"
                          id={q.customerId}
                          label={q.customerName}
                          onNavigate={onNavigate}
                        />
                      ) : (
                        <span className="text-[13px] font-semibold text-[#04314A]">
                          {q.customerName}
                        </span>
                      )}
                      {q.company && <div className="text-[11px] text-[#737373]">{q.company}</div>}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                      {q.vehicle}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] font-semibold text-[#04314A] whitespace-nowrap">
                      {formatNpr(crm.quotationTotals(q.item).total)}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={getBadgeVariant(q.status)} size="sm">
                        {q.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                      {q.createdAt.slice(0, 10)}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                        {["draft"].includes(q.status) && (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setStatus(q, "sent")}
                            >
                              Send
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => onNavigate(`crm-quotations/${q.id}`)}
                            >
                              Edit
                            </Button>
                          </>
                        )}
                        {["sent", "viewed", "expired", "rejected"].includes(q.status) && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => duplicate(q)}
                          >
                            Duplicate
                          </Button>
                        )}
                        {["sent", "viewed"].includes(q.status) && !q.convertedToOrder && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => acceptQuote(q)}
                          >
                            Accept
                          </Button>
                        )}
                        {!["draft"].includes(q.status) && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onNavigate(`crm-quotations/${q.id}`)}
                          >
                            View
                          </Button>
                        )}
                      </div>
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
        <QuotationModal
          onClose={() => setCreating(false)}
          onSaved={(m) => {
            load();
            setStatusMsg(m);
          }}
          customers={customers.map((c) => ({ id: c.id, name: c.name, company: c.company }))}
        />
      )}
    </div>
  );
}
