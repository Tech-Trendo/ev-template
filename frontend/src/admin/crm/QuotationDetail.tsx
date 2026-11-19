"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookmarkCheck,
  Car,
  CheckCircle2,
  Download,
  GitBranch,
  Mail,
  Pencil,
  Printer,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { crm, formatNpr, amountInNepaliWords, quotationLabel, type Customer, type Quotation } from "./data";
import { Badge, Modal, ghostBtnCls, primaryBtnCls, useToast } from "./ui";
import { QuotationModal } from "./modals";
import { ReserveUnitModal } from "./ReserveUnitModal";
import { SaleFormModal } from "./SaleFormModal";
import { EntityLink } from "../components/pickers";
import { useAuth } from "../AuthContext";
import { logPrintEvent } from "../../components/PrintFooter";

interface SalespersonUser {
  id: number;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

export default function QuotationDetail({
  quotationId,
  onNavigate,
}: {
  quotationId: string;
  onNavigate: (page: string) => void;
}) {
  const { hasAnyPerm } = useAuth();
  const canEdit = hasAnyPerm(["crm.edit_quotation", "crm.change_quotation", "quotation.edit"]);
  const canRevise = hasAnyPerm(["crm.revise_quotation", "crm.change_quotation", "quotation.revise"]);

  const [quote, setQuote] = useState<Quotation | null>(null);
  const [revisions, setRevisions] = useState<Quotation[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [users, setUsers] = useState<SalespersonUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [reserving, setReserving] = useState(false);
  const [selling, setSelling] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [revising, setRevising] = useState(false);
  const [editChoiceOpen, setEditChoiceOpen] = useState(false);
  const [reviseConfirmOpen, setReviseConfirmOpen] = useState(false);
  const [branding, setBranding] = useState<{ letterhead_url: string | null } | null>(null);
  const toast = useToast();

  const load = () => {
    Promise.all([
      crm.quotation(quotationId).catch(() => null),
      crm.customers(),
      crm.getQuotationRevisions(quotationId).catch(() => []),
      api<SalespersonUser[]>("/api/users/").catch(() => []),
      api<{ letterhead_url: string | null }>("/api/crm/branding/").catch(() => null),
    ])
      .then(([q, custs, revs, userList, brandingData]) => {
        setQuote(q);
        setRevisions(revs);
        setUsers(Array.isArray(userList) ? userList : (userList as { results?: SalespersonUser[] }).results ?? []);
        setBranding(brandingData);
        if (q && q.customerId) {
          setCustomer(custs.find((c) => c.id === q.customerId) ?? null);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [quotationId]);

  if (loading) return <p className="text-[13px] text-[#737373]">Loading quotation...</p>;
  if (!quote)
    return (
      <div>
        <button onClick={() => onNavigate("crm-quotations")} className={`${ghostBtnCls} mb-6`}>
          <ArrowLeft size={14} /> Back to Quotations
        </button>
        <p className="text-[14px] text-[#737373]">Quotation {quotationId} not found.</p>
      </div>
    );

  const totals = crm.quotationTotals({ ...quote.item, accessories: 0 });

  const salespersonName = quote.salesperson || "VehicleTemplate";
  const matchedUser = users.find((u) => {
    const sp = salespersonName.toLowerCase().trim();
    if (!sp) return false;
    if (u.username.toLowerCase() === sp) return true;
    const fullName = `${u.first_name || ""} ${u.last_name || ""}`.toLowerCase().trim();
    if (fullName && fullName === sp) return true;
    if (u.first_name && u.first_name.toLowerCase() === sp) return true;
    return false;
  });
  const salespersonDisplay = quote.salespersonName || (() => {
    if (!matchedUser) return salespersonName;
    const full = `${matchedUser.first_name || ""} ${matchedUser.last_name || ""}`.trim();
    return full || salespersonName;
  })();

  const salespersonPhone =
    quote.salespersonPhone ||
    matchedUser?.phone ||
    "+977 9765022801";

  const salespersonEmail =
    quote.salespersonEmail ||
    matchedUser?.email ||
    "info@vehicletemplate.example.com";

  const line = (label: string, value: number, bold?: boolean, negative?: boolean) => (
    <div className={`flex items-center justify-between py-1 ${bold ? "border-t border-[#04314A] mt-1.5 pt-2" : ""}`}>
      <span className={`text-[11px] ${bold ? "font-black uppercase tracking-[0.08em] text-[#04314A]" : "text-[#737373]"}`}>{label}</span>
      <span className={`text-[12px] ${bold ? "text-[16px] font-black" : "font-semibold"} ${negative ? "text-[#00AAEB]" : "text-[#04314A]"}`}>
        {negative ? "-" : ""}
        {formatNpr(Math.abs(value))}
      </span>
    </div>
  );

  const setStatus = async (status: Quotation["status"], msg: string) => {
    try {
      await crm.saveQuotation({ ...quote, status });
      setQuote({ ...quote, status });
      toast.push(msg);
    } catch {
      toast.push("Update failed.");
    }
  };

  const handleAccept = async () => {
    try {
      const updated = await crm.acceptQuotation(quote.id);
      setQuote(updated);
      toast.push(`Quotation ${quote.id} accepted.`);
    } catch {
      toast.push("Failed to accept quotation.");
    }
  };

  const startRevision = async () => {
    if (revising) return;
    setEditChoiceOpen(false);
    setReviseConfirmOpen(false);
    setRevising(true);
    try {
      const revised = await crm.reviseQuotation(quote.id);
      toast.push(`Created revision ${quotationLabel(revised)}.`);
      onNavigate(`crm-quotations/${revised.id}`);
    } catch {
      toast.push("Failed to create revision.");
    } finally {
      setRevising(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    try {
      await crm.saveQuotation({ ...quote, status: "rejected" });
      setQuote({ ...quote, status: "rejected" });
      toast.push(`Quotation ${quote.id} rejected.`);
      setRejectModal(false);
      load();
    } catch {
      toast.push("Failed to reject quotation.");
    } finally {
      setRejecting(false);
    }
  };

  const vehicleBase = quote.vehicleModelDetail
    ? `${quote.vehicleModelDetail.brand} ${quote.vehicleModelDetail.model_name}`.trim()
    : quote.vehicle || "VT Cargo 6T";
  const vehicleFullName = vehicleBase.toUpperCase().startsWith("VT") ? vehicleBase : `VT ${vehicleBase}`;
  const lengthSuffix = quote.vehicleLength ? ` - ${quote.vehicleLength}` : "";
  const itemDisplayName = `${vehicleFullName}${lengthSuffix} Commercial Electric Vehicle`;

  const specModel = vehicleFullName;
  const specDesc = quote.vehicleDescription || (vehicleFullName.includes("10T") ? "10 Ton Payload with 2 Doors" : "6 Ton Payload with 2 Doors");
  const specBattery = quote.batteryCapacity || (vehicleFullName.includes("10T") ? "CATL, 164.86 kWh" : "CATL, 100.07 kWh");
  const specTransmission = quote.transmission || "Automatic";
  const specVariant = quote.variantDetail?.name || "Container";
  const specLength = quote.vehicleLength || (vehicleFullName.includes("10T") ? "20 FT" : "16 FT");
  const specRange = quote.vehicleModelDetail?.range_km || quote.rangeKm || "";
  const specVersion = quote.version || "Commercial Electric Truck";
  const specCharger = quote.chargerInfo || "Support GB/T DC Fast Charger";

  const clientName = quote.company || quote.customerName;
  const clientPan = quote.panNumber || customer?.panNumber || customer?.pan_vat_number || "";
  const clientPhone = quote.customerPhone || customer?.phone || "";
  const clientAddress = quote.customerAddress || customer?.location || (customer as any)?.address || "";

  return (
    <div className="w-full print:m-0 print:p-0 print:w-full">
      <button onClick={() => onNavigate("crm-quotations")} className={`${ghostBtnCls} mb-6 no-print`}>
        <ArrowLeft size={14} /> Back to Quotations
      </button>

      {quote.isLatest === false && (
        <div className="mb-4 p-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl w-full flex items-center justify-between no-print">
          <div>
            <p className="text-[13px] font-bold text-[#92400E]">Viewing Historical Revision ({quotationLabel(quote)})</p>
            <p className="text-[12px] text-[#B45309]">This revision is read-only. A newer revision is active.</p>
          </div>
          {revisions.find((r) => r.isLatest) && (
            <button
              onClick={() => onNavigate(`crm-quotations/${revisions.find((r) => r.isLatest)!.id}`)}
              className="px-3 py-1.5 bg-[#04314A] text-white text-[12px] font-semibold rounded hover:bg-[#064264] transition-colors"
            >
              View Latest
            </button>
          )}
        </div>
      )}

      {/* Document sheet + sidebar */}
      <div className="flex flex-col xl:flex-row gap-6 items-start justify-center w-full print:block">
        {/* Document sheet */}
        <div className="quotation-sheet relative bg-white border border-[#E8E8E5] rounded-xl w-full max-w-[760px] shadow-sm overflow-hidden flex flex-col justify-between print:fixed print:inset-0 print:border-none print:shadow-none print:rounded-none print:max-w-none print:mx-0 print:w-full print:h-full print:min-h-full print:max-h-full print:m-0 print:p-0 print:overflow-hidden print:z-[999999]">
          {/* Generic letterhead header — replace with your own branding */}
          <div className="w-full relative z-10 bg-white flex-shrink-0 border-b-[3px] border-[#04314A] px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded bg-[#00AAEB] text-[12px] font-black text-white">VT</span>
              <span className="text-[13px] font-black tracking-tight text-[#04314A]">VEHICLE TEMPLATE</span>
            </div>
            <div className="text-right text-[8.5px] leading-tight text-[#4B5563]">
              <div>Commercial Vehicle Sales &amp; Fleet Solutions</div>
              <div>Your Address, Your City · info@yourcompany.com</div>
            </div>
          </div>

          {/* Watermark in background */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 overflow-hidden">
            <span className="text-[72px] font-black tracking-[0.2em] text-[#04314A] opacity-[0.05]">
              VEHICLE TEMPLATE
            </span>
          </div>

          {/* Quotation Body Content */}
          <div className="relative z-10 px-6 sm:px-9 py-2.5 sm:py-3.5 flex-1 flex flex-col justify-between text-[#111827] print:px-9 print:py-2 print:justify-between overflow-hidden">
            <div>
              {/* Cyan Document Title */}
              <h1 className="text-center text-[15px] sm:text-[17px] font-extrabold uppercase tracking-[0.05em] text-[#00A7E1] mb-2 sm:mb-3">
                QUOTATION FOR VT ELECTRIC TRUCK
              </h1>

              {/* Quotation Meta Bar */}
              <div className="flex items-start justify-between pb-2 mb-3 border-b border-[#D1D5DB]">
                <div>
                  <span className="block text-[15px] sm:text-[17px] font-black text-[#04314A] tracking-tight">
                    {quotationLabel(quote)}
                  </span>
                  <div className="flex items-center gap-2 mt-1 no-print">
                    <Badge status={quote.status} />
                    {quote.isLatest === false && (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] bg-[#FFF3CD] text-[#856404] border border-[#FFEEBA] rounded">
                        Historical
                      </span>
                    )}
                    {quote.convertedToOrder && (
                      <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] bg-[#04314A] text-white rounded">
                        Sold
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right text-[11px] sm:text-[11.5px] leading-tight space-y-0.5 text-[#1F2937]">
                  <div>
                    <span className="font-bold text-[#111827]">Issue Date:</span>{" "}
                    <span>{quote.createdAt ? quote.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10)}</span>
                  </div>
                  <div>
                    <span className="font-bold text-[#111827]">Valid Until:</span>{" "}
                    <span>{quote.validUntil ? quote.validUntil.slice(0, 10) : "15 days from issue"}</span>
                  </div>
                </div>
              </div>

              {/* Customer & Details Grid */}
              <div className="grid grid-cols-2 gap-6 mb-3 sm:mb-4 text-[11px] sm:text-[11.5px] leading-snug">
                <div>
                  <span className="block text-[10px] font-bold tracking-[0.12em] uppercase text-[#6B7280] mb-1">
                    QUOTATION FOR
                  </span>
                  <div className="text-[13px] sm:text-[14px] font-bold text-[#111827]">
                    {quote.customerId ? (
                      <EntityLink type="customer" id={quote.customerId} label={clientName} onNavigate={onNavigate} />
                    ) : (
                      clientName
                    )}
                  </div>
                  {clientPan && (
                    <div className="text-[#374151] mt-0.5">
                      PAN No. {clientPan}
                    </div>
                  )}
                  {clientPhone && (
                    <div className="text-[#374151] mt-0.5">
                      Mobile: {clientPhone}
                    </div>
                  )}
                  {clientAddress && (
                    <div className="text-[#374151] mt-0.5">
                      Address: {clientAddress}
                    </div>
                  )}
                  {quote.bankName ? (
                    <div className="text-[#374151] mt-0.5">Bank: {quote.bankName}</div>
                  ) : null}
                  {quote.bankAddress ? (
                    <div className="text-[#374151] mt-0.5">Branch: {quote.bankAddress}</div>
                  ) : null}
                </div>

                <div className="text-right">
                  <span className="block text-[10px] font-bold tracking-[0.12em] uppercase text-[#6B7280] mb-1">
                    SALES DETAILS
                  </span>
                  <div className="text-[#374151]">
                    <span className="text-[#6B7280]">Salesperson:</span>{" "}
                    <span className="font-semibold text-[#111827]">{salespersonDisplay}</span>
                  </div>
                  {salespersonPhone && (
                    <div className="text-[#374151] mt-0.5">
                      <span className="text-[#6B7280]">Mobile:</span>{" "}
                      <a
                        href={`tel:${salespersonPhone.replace(/\s+/g, "")}`}
                        className="hover:text-[#00AAEB] text-[#111827] transition-colors"
                      >
                        {salespersonPhone}
                      </a>
                    </div>
                  )}
                  {salespersonEmail && (
                    <div className="text-[#374151] mt-0.5 break-all">
                      <span className="text-[#6B7280]">Email:</span>{" "}
                      <a
                        href={`mailto:${salespersonEmail}`}
                        className="hover:text-[#00AAEB] text-[#111827] transition-colors"
                      >
                        {salespersonEmail}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Line items table & Totals */}
              <div className="mb-3 sm:mb-4">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#D1D5DB]">
                      <th className="py-1 text-[10px] font-bold tracking-[0.1em] uppercase text-[#6B7280]">ITEM</th>
                      <th className="py-1 text-[10px] font-bold tracking-[0.1em] uppercase text-[#6B7280] text-center w-16">QTY</th>
                      <th className="py-1 text-[10px] font-bold tracking-[0.1em] uppercase text-[#6B7280] text-right w-32">PRICE</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[#E5E7EB]">
                      <td className="py-2 text-[11px] font-bold leading-tight text-[#111827] whitespace-nowrap">
                        {itemDisplayName}
                      </td>
                      <td className="py-2 text-[11px] font-bold leading-tight text-[#111827] text-center">
                        {quote.quantity || 1}
                      </td>
                      <td className="py-2 text-[11px] font-bold leading-tight text-[#111827] text-right">
                        {(quote.item.vehiclePrice || totals.total + quote.item.discount).toLocaleString("en-IN")}
                      </td>
                    </tr>
                    {quote.item.otherCharges > 0 && (
                      <tr className="border-b border-[#E5E7EB]">
                        <td className="py-1.5 text-[11px] text-[#374151]">Other Charges / Fees</td>
                        <td className="py-1.5 text-[11px] text-[#374151] text-center">1</td>
                        <td className="py-1.5 text-[11px] text-[#374151] text-right font-semibold">
                          {quote.item.otherCharges.toLocaleString("en-IN")}
                        </td>
                      </tr>
                    )}
                    {quote.item.discount > 0 && (
                      <tr>
                        <td className="py-1"></td>
                        <td className="py-1 text-[11px] text-[#6B7280] text-right pr-2">Discount</td>
                        <td className="py-1 text-[11px] text-[#111827] text-right font-semibold">
                          {quote.item.discount.toLocaleString("en-IN")}
                        </td>
                      </tr>
                    )}
                    <tr className="border-t border-[#D1D5DB] border-b border-[#D1D5DB]">
                      <td colSpan={3} className="py-2">
                        <div className="flex items-baseline justify-between gap-4">
                          <span className="text-[11px] font-bold leading-tight text-[#111827] whitespace-nowrap">
                            AMOUNT IN WORDS: {quote.amountInWords || amountInNepaliWords(totals.total)}
                          </span>
                          <span className="flex items-baseline gap-4 shrink-0">
                            <span className="text-[12px] font-black uppercase text-[#111827]">TOTAL</span>
                            <span className="text-[13px] sm:text-[14px] font-black text-[#111827]">
                              {totals.total.toLocaleString("en-IN")}
                            </span>
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Specifications & Terms Grid */}
              <div className="grid grid-cols-2 gap-6 my-2 sm:my-3 text-[10.5px] sm:text-[11px] leading-tight">
                <div>
                  <h3 className="text-[11px] sm:text-[11.5px] font-extrabold uppercase text-[#04314A] tracking-wider mb-2">
                    VEHICLE&apos;S SPECIFICATIONS:
                  </h3>
                  <ul className="space-y-1 text-[#1F2937]">
                    <li>• <span className="font-bold">Model :</span> {specModel}</li>
                    <li>• <span className="font-bold">Description :</span> {specDesc}</li>
                    <li>• <span className="font-bold">Battery :</span> {specBattery}</li>
                    <li>• <span className="font-bold">Transmission :</span> {specTransmission}</li>
                    <li>• <span className="font-bold">Variant Type :</span> {specVariant}</li>
                    <li>• <span className="font-bold">Cargo Length :</span> {specLength}</li>
                    {specRange ? <li>• <span className="font-bold">Range :</span> {specRange}</li> : null}
                    <li>• <span className="font-bold">Version :</span> {specVersion}</li>
                    <li>• <span className="font-bold">Charger :</span> {specCharger}</li>
                    {(quote.extraSpecs || []).filter((row) => row.label || row.value).map((row) => (
                      <li key={`${row.label}-${row.value}`}>• <span className="font-bold">{row.label} :</span> {row.value}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-[11px] sm:text-[11.5px] font-extrabold uppercase text-[#04314A] tracking-wider mb-2">
                    TERMS &amp; CONDITION:
                  </h3>
                  <ul className="space-y-1 text-[#1F2937]">
                    <li>• <span className="font-bold">VAT :</span> Price is Inclusive of 13% VAT.</li>
                    <li>• <span className="font-bold">Payment Terms :</span> {quote.paymentTerms || "40% Down Payment & 60% Bank DO before Dispatch."}</li>
                    <li>• <span className="font-bold">Delivery :</span> {quote.deliveryTerms || "As per Client Requirement."}</li>
                    <li>• <span className="font-bold">Warranty :</span> {quote.warrantyTerms || "Company Authorized Warranty Terms."}</li>
                    <li>• <span className="font-bold">Validity :</span> {quote.validUntil ? "15 days from the date of quotation sent." : "15 days from the date of quotation sent."}</li>
                    <li>• <span className="font-bold">Insurance :</span> {quote.insuranceTerms || "1 Year Insurance Included in Offered Price."}</li>
                    <li>• <span className="font-bold">Registration :</span> {quote.registrationTerms || "1 Year Registration Included in Offered Price."}</li>
                  </ul>
                </div>
              </div>

              {quote.notes ? (
                <p className="text-[12px] sm:text-[13px] text-[#111827] whitespace-pre-line mt-2 mb-1">
                  <span className="font-bold">Notes:</span> {quote.notes}
                </p>
              ) : null}
            </div>

            {/* Bottom: Account Details (left) & Signature (right) */}
            <div className="grid grid-cols-2 gap-6 items-end mt-2 pt-2">
              <div>
                <div className="text-[11px] font-bold text-[#111827] uppercase underline mb-1">
                  ACCOUNT DETAILS:
                </div>
                <div className="text-[10px] sm:text-[10.5px] font-bold text-[#111827] leading-tight space-y-0.5">
                  <div>VEHICLE TEMPLATE</div>
                  <div>{quote.bankName || "YOUR BANK NAME"}</div>
                  <div>{quote.bankAddress || "YOUR BRANCH"}</div>
                  <div>A/C NO: 000000000000</div>
                </div>
                <div className="mt-3 text-[10px] text-[#4B5563] leading-tight">
                  <div>We hope this quotation meets your requirements.</div>
                  <div>Please feel free to contact us for any further clarifications.</div>
                </div>
              </div>

              <div className="flex flex-col items-end pt-6">
                <div className="w-[170px] border-t border-[#111827] pt-1 text-center">
                  <div className="text-[11px] font-bold text-[#111827]">Authorized Signature</div>
                  <div className="text-[9px] text-[#4B5563]">Vehicle Template</div>
                </div>
              </div>
            </div>
          </div>

          {/* Generic letterhead footer */}
          <div className="w-full relative z-10 bg-white mt-auto flex-shrink-0 border-t border-[#D1D5DB] px-6 py-2 flex items-center justify-between text-[8px] text-[#6B7280]">
            <span>Vehicle Template · Commercial Vehicle Sales &amp; Fleet Solutions</span>
            <span>info@yourcompany.com · +1 555 0100</span>
          </div>
        </div>

        {/* Right sidebar */}
        <aside className="no-print space-y-4 w-full xl:w-[280px] lg:w-[260px] flex-shrink-0 lg:sticky lg:top-4">
          <div className="bg-white border border-[#E8E8E5] rounded-xl p-5 shadow-sm">
            <h3 className="text-[12px] font-black tracking-[0.12em] uppercase text-[#04314A] mb-3">
              Connected Records
            </h3>
            <div className="space-y-3">
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#737373] mb-0.5">Customer</span>
                {quote.customerId ? (
                  <EntityLink type="customer" id={quote.customerId} label={quote.customerName} onNavigate={onNavigate} />
                ) : (
                  <span className="text-[13px] font-bold text-[#04314A]">{quote.customerName}</span>
                )}
              </div>
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#737373] mb-0.5">Vehicle Unit</span>
                {quote.unitDetail ? (
                  <EntityLink type="unit" id={quote.unitDetail.id || quote.unitId || quote.unitDetail.vin_chassis_no} label={quote.unitDetail.vin_chassis_no} onNavigate={onNavigate} />
                ) : (
                  <span className="text-[13px] text-[#737373]">Unallocated</span>
                )}
              </div>
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#737373] mb-0.5">Conversion Status</span>
                <span className="text-[13px] font-bold text-[#04314A]">
                  {quote.convertedToOrder ? "Converted to Sale" : "Pending Order"}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#E8E8E5] rounded-xl p-5 shadow-sm space-y-3">
            {canEdit && (
              <div>
                <button
                  onClick={() => setEditChoiceOpen(true)}
                  disabled={quote.isLatest === false || !!quote.convertedToOrder}
                  className={`${ghostBtnCls} w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed`}
                  title={
                    quote.isLatest === false
                      ? "Historical revisions are read-only"
                      : quote.convertedToOrder
                      ? "Converted quotations cannot be edited"
                      : undefined
                  }
                >
                  <Pencil size={14} /> Edit Quotation
                </button>
              </div>
            )}

            <div>
              <button
                onClick={() => setStatus("sent", `${quotationLabel(quote)} sent.`)}
                disabled={quote.status !== "draft" || quote.isLatest === false}
                className={`${primaryBtnCls} w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <Mail size={14} /> Send
              </button>
            </div>

            {canRevise && quote.isLatest && !quote.convertedToOrder && (
              <div>
                <button
                  onClick={() => setReviseConfirmOpen(true)}
                  disabled={revising}
                  className={`${ghostBtnCls} w-full justify-center`}
                >
                  <GitBranch size={14} /> {revising ? "Revising..." : "Revise Quotation"}
                </button>
              </div>
            )}

            {["sent", "viewed"].includes(quote.status) && !quote.convertedToOrder && (
              <div>
                <button onClick={handleAccept} className={`${primaryBtnCls} w-full justify-center`}>
                  <CheckCircle2 size={14} /> Accept Quotation
                </button>
              </div>
            )}

            {quote.status === "accepted" && !quote.convertedToOrder && (
              <>
                <div>
                  <button onClick={() => setReserving(true)} className={`${ghostBtnCls} w-full justify-center`}>
                    <BookmarkCheck size={14} /> Reserve Unit
                  </button>
                </div>
                <div>
                  <button onClick={() => setSelling(true)} className={`${primaryBtnCls} w-full justify-center`}>
                    <Car size={14} /> Record Sale
                  </button>
                </div>
              </>
            )}

            {quote.convertedToOrder && (
              <div>
                <button onClick={() => onNavigate("inventory-units")} className={`${ghostBtnCls} w-full justify-center`}>
                  <Car size={14} /> View Units
                </button>
              </div>
            )}

            {!["rejected", "expired"].includes(quote.status) && !quote.convertedToOrder && (
              <div>
                <button
                  onClick={() => setRejectModal(true)}
                  className="flex items-center justify-center gap-1.5 w-full px-4 py-2.5 border border-[#DC2626] text-[#DC2626] text-[12px] font-semibold tracking-[0.04em] uppercase rounded-full hover:bg-[#DC2626] hover:text-white transition-colors"
                >
                  <XCircle size={14} /> Reject Quotation
                </button>
              </div>
            )}

            <div>
              <button
                onClick={async () => {
                  await logPrintEvent({
                    documentType: "QUOTATION",
                    objectId: quotationLabel(quote),
                    title: `Quotation ${quotationLabel(quote)}`,
                  });
                  window.print();
                }}
                className={`${ghostBtnCls} w-full justify-center`}
              >
                <Printer size={14} /> Print
              </button>
            </div>

            <div>
              <button
                onClick={async () => {
                  try {
                    await crm.downloadQuotationPdf(quote.id, quotationLabel(quote));
                    toast.push("PDF downloaded.");
                  } catch {
                    toast.push("Download failed. Check your connection.");
                  }
                }}
                className={`${ghostBtnCls} w-full justify-center`}
              >
                <Download size={14} /> Download PDF
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Revision History & Comparison panel */}
      {revisions.length > 1 && (
        <div className="mt-8 bg-white border border-[#E8E8E5] rounded-xl w-full p-6 no-print">
          <div className="flex items-center justify-between mb-4 border-b border-[#E8E8E5] pb-3">
            <div>
              <h3 className="text-[14px] font-bold text-[#04314A]">Revision History</h3>
              <p className="text-[12px] text-[#737373]">All revisions in this quotation sequence.</p>
            </div>
            <span className="text-[11px] font-semibold text-[#737373] bg-[#F4F4F2] px-2.5 py-1 rounded">
              {revisions.length} revisions
            </span>
          </div>
          <div className="divide-y divide-[#E8E8E5]">
            {revisions.map((rev) => {
              const isCurrent = rev.id === quote.id;
              return (
                <div
                  key={rev.id}
                  className={`py-3 flex items-center justify-between ${
                    isCurrent ? "bg-[#F9F9F8] -mx-3 px-3 rounded" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] font-bold text-[#04314A]">
                      {quotationLabel(rev)}
                    </span>
                    <Badge status={rev.status} />
                    {rev.isLatest && (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] bg-[#04314A] text-white rounded">
                        Latest
                      </span>
                    )}
                    {isCurrent && (
                      <span className="text-[11px] font-medium text-[#737373]">(Current view)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-[12px] text-[#737373]">
                    <span>{rev.createdAt ? rev.createdAt.slice(0, 10) : ""}</span>
                    <span>{formatNpr(crm.quotationTotals(rev.item).total)}</span>
                    {!isCurrent && (
                      <button
                        onClick={() => onNavigate(`crm-quotations/${rev.id}`)}
                        className="text-[12px] font-semibold text-[#00AAEB] hover:underline"
                      >
                        View
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Comparison View */}
          <RevisionComparison currentQuote={quote} allRevisions={revisions} />
        </div>
      )}

      {toast.node}

      {editing && (
        <QuotationModal
          onClose={() => setEditing(false)}
          onSaved={(m, newQuote) => {
            if (newQuote && newQuote.id !== quote.id) {
              onNavigate(`crm-quotations/${newQuote.id}`);
            } else {
              load();
            }
            toast.push(m);
          }}
          customers={customer ? [{ id: customer.id, name: customer.name, company: customer.company }] : []}
          presetCustomerId={quote.customerId || undefined}
          quotationId={quote.id}
          leadId={quote.leadId || undefined}
        />
      )}

      {reserving && (
        <ReserveUnitModal
          onClose={() => setReserving(false)}
          onSaved={(m) => {
            load();
            toast.push(m);
          }}
          presetUnitId={quote.unitId || undefined}
          presetUnitVin={quote.unitDetail?.vin_chassis_no}
          customerId={quote.customerId || undefined}
          customerName={quote.customerName}
          leadId={quote.leadId || undefined}
        />
      )}

      {selling && (
        <SaleFormModal
          onClose={() => setSelling(false)}
          onSaved={(m) => {
            load();
            toast.push(m);
          }}
          initialUnitId={quote.unitId || undefined}
          initialCustomerId={quote.customerId || undefined}
          initialCustomerName={quote.customerName}
          initialLeadId={quote.leadId || undefined}
          initialQuotationId={quote.id}
          initialSellingPrice={totals.total}
          initialDiscount={quote.item.discount}
          initialSalesperson={quote.salesperson}
        />
      )}

      {editChoiceOpen && (
        <Modal title="Edit quotation" onClose={() => setEditChoiceOpen(false)}>
          <div className="space-y-4">
            <p className="text-[13px] text-[#04314A]">Do you want to edit quotation or revise quotation?</p>
            <div data-modal-actions className="flex flex-wrap gap-3 justify-end pt-3 border-t border-[#E8E8E5]">
              <button
                onClick={() => setEditChoiceOpen(false)}
                className="px-5 py-2.5 border border-[#E8E8E5] rounded-full text-[12px] font-semibold text-[#737373] hover:text-[#04314A]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setEditChoiceOpen(false);
                  setEditing(true);
                }}
                className="px-5 py-2.5 rounded-full border border-[#04314A] text-[#04314A] text-[12px] font-bold hover:bg-[#04314A] hover:text-white"
              >
                Edit quotation
              </button>
              {canRevise && quote.isLatest && !quote.convertedToOrder && (
                <button
                  onClick={startRevision}
                  disabled={revising}
                  className="px-5 py-2.5 rounded-full bg-[#04314A] text-white text-[12px] font-bold hover:bg-[#00AAEB] disabled:opacity-50"
                >
                  {revising ? "Revising..." : "Revise quotation"}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {reviseConfirmOpen && (
        <Modal title="Revise quotation" onClose={() => setReviseConfirmOpen(false)}>
          <div className="space-y-4">
            <p className="text-[13px] text-[#04314A]">Do you really want to revise quotation?</p>
            <div data-modal-actions className="flex gap-3 justify-end pt-3 border-t border-[#E8E8E5]">
              <button
                onClick={() => setReviseConfirmOpen(false)}
                className="px-5 py-2.5 border border-[#E8E8E5] rounded-full text-[12px] font-semibold text-[#737373] hover:text-[#04314A]"
              >
                Cancel
              </button>
              <button
                onClick={startRevision}
                disabled={revising}
                className="px-5 py-2.5 rounded-full bg-[#04314A] text-white text-[12px] font-bold hover:bg-[#00AAEB] disabled:opacity-50"
              >
                {revising ? "Revising..." : "Revise quotation"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {rejectModal && (
        <Modal title="Reject Quotation" onClose={() => setRejectModal(false)}>
          <div className="space-y-4">
            <p className="text-[13px] text-[#737373]">
              Rejecting this quotation immediately releases any reserved unit back to ready inventory and reverts the lead stage.
            </p>
            <div data-modal-actions className="flex gap-3 justify-end pt-3 border-t border-[#E8E8E5]">
              <button
                onClick={() => setRejectModal(false)}
                className="px-5 py-2.5 border border-[#E8E8E5] rounded-full text-[12px] font-semibold text-[#737373] hover:text-[#04314A]"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={rejecting}
                className="px-5 py-2.5 rounded-full bg-[#DC2626] text-white text-[12px] font-bold hover:bg-[#B91C1C] disabled:opacity-50"
              >
                {rejecting ? "Rejecting..." : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RevisionComparison({
  currentQuote,
  allRevisions,
}: {
  currentQuote: Quotation;
  allRevisions: Quotation[];
}) {
  const sorted = useMemo(() => {
    return [...allRevisions].sort((a, b) => (a.revisionNumber || 0) - (b.revisionNumber || 0));
  }, [allRevisions]);

  const currentIndex = sorted.findIndex((r) => r.id === currentQuote.id);
  const defaultPrior = currentIndex > 0 ? sorted[currentIndex - 1] : (sorted.length > 1 ? sorted[0] : null);
  const [compareId, setCompareId] = useState<string>(defaultPrior?.id || "");

  useEffect(() => {
    if (defaultPrior && (!compareId || compareId === currentQuote.id)) {
      setCompareId(defaultPrior.id);
    }
  }, [defaultPrior, currentQuote.id]);

  const prior = sorted.find((r) => r.id === compareId);
  if (!prior || prior.id === currentQuote.id) {
    return null;
  }

  const priorTotals = crm.quotationTotals(prior.item);
  const currentTotals = crm.quotationTotals(currentQuote.item);

  const diffRows = [
    {
      label: "Vehicle Model",
      prior: prior.vehicle || "-",
      current: currentQuote.vehicle || "-",
      changed: (prior.vehicle || "").trim() !== (currentQuote.vehicle || "").trim(),
    },
    {
      label: "Proposed Unit",
      prior: prior.unitDetail?.vin_chassis_no || "Unassigned",
      current: currentQuote.unitDetail?.vin_chassis_no || "Unassigned",
      changed: (prior.unitDetail?.vin_chassis_no || "") !== (currentQuote.unitDetail?.vin_chassis_no || ""),
    },
    {
      label: "Vehicle Base Price",
      prior: formatNpr(prior.item.vehiclePrice || 0),
      current: formatNpr(currentQuote.item.vehiclePrice || 0),
      diff: formatNpr((currentQuote.item.vehiclePrice || 0) - (prior.item.vehiclePrice || 0)),
      changed: Number(prior.item.vehiclePrice || 0) !== Number(currentQuote.item.vehiclePrice || 0),
    },
    {
      label: "Accessories",
      prior: formatNpr(prior.item.accessories || 0),
      current: formatNpr(currentQuote.item.accessories || 0),
      diff: formatNpr((currentQuote.item.accessories || 0) - (prior.item.accessories || 0)),
      changed: Number(prior.item.accessories || 0) !== Number(currentQuote.item.accessories || 0),
    },
    {
      label: "Discount",
      prior: formatNpr(prior.item.discount || 0),
      current: formatNpr(currentQuote.item.discount || 0),
      diff: formatNpr((currentQuote.item.discount || 0) - (prior.item.discount || 0)),
      changed: Number(prior.item.discount || 0) !== Number(currentQuote.item.discount || 0),
    },
    {
      label: "Other Charges",
      prior: formatNpr(prior.item.otherCharges || 0),
      current: formatNpr(currentQuote.item.otherCharges || 0),
      diff: formatNpr((currentQuote.item.otherCharges || 0) - (prior.item.otherCharges || 0)),
      changed: Number(prior.item.otherCharges || 0) !== Number(currentQuote.item.otherCharges || 0),
    },
    {
      label: "Total Amount (incl. VAT)",
      prior: formatNpr(priorTotals.total),
      current: formatNpr(currentTotals.total),
      diff: formatNpr(currentTotals.total - priorTotals.total),
      changed: Math.round(priorTotals.total) !== Math.round(currentTotals.total),
    },
    {
      label: "Valid Until",
      prior: prior.validUntil ? prior.validUntil.slice(0, 10) : "Not set",
      current: currentQuote.validUntil ? currentQuote.validUntil.slice(0, 10) : "Not set",
      changed: (prior.validUntil || "").slice(0, 10) !== (currentQuote.validUntil || "").slice(0, 10),
    },
    {
      label: "Customer PO / Ref",
      prior: prior.referenceNo || "None",
      current: currentQuote.referenceNo || "None",
      changed: (prior.referenceNo || "").trim() !== (currentQuote.referenceNo || "").trim(),
    },
    {
      label: "Notes & Terms",
      prior: prior.notes || "None",
      current: currentQuote.notes || "None",
      changed: (prior.notes || "").trim() !== (currentQuote.notes || "").trim(),
    },
  ];

  const changedCount = diffRows.filter((r) => r.changed).length;

  return (
    <div className="mt-6 border-t border-[#E8E8E5] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h4 className="text-[13px] font-bold text-[#04314A]">Revision Comparison</h4>
          <p className="text-[11px] text-[#737373]">
            Comparing {quotationLabel(currentQuote)} with prior sequence.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-[#737373]">Compare against:</span>
          <select
            value={compareId}
            onChange={(e) => setCompareId(e.target.value)}
            className="px-2.5 py-1 text-[12px] bg-[#FAFAF8] border border-[#E8E8E5] rounded font-medium text-[#04314A]"
          >
            {sorted
              .filter((r) => r.id !== currentQuote.id)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {quotationLabel(r)} ({r.createdAt ? r.createdAt.slice(0, 10) : ""})
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto border border-[#E8E8E5] rounded-lg">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="bg-[#FAFAF8] border-b border-[#E8E8E5] text-[10px] font-bold uppercase tracking-[0.08em] text-[#737373]">
              <th className="py-2.5 px-3">Item / Specification</th>
              <th className="py-2.5 px-3">{quotationLabel(prior)} (Prior)</th>
              <th className="py-2.5 px-3">{quotationLabel(currentQuote)} (Current)</th>
              <th className="py-2.5 px-3">Net Difference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8E8E5]">
            {diffRows.map((row) => (
              <tr
                key={row.label}
                className={row.changed ? "bg-[#FAFAF8]" : "hover:bg-[#FAFAF8]/50"}
              >
                <td className="py-2.5 px-3 font-medium text-[#04314A] flex items-center gap-2">
                  {row.label}
                  {row.changed && (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[#04314A] text-white rounded">
                      Changed
                    </span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-[#737373]">{row.prior}</td>
                <td className={`py-2.5 px-3 ${row.changed ? "font-semibold text-[#04314A]" : "text-[#737373]"}`}>
                  {row.current}
                </td>
                <td className="py-2.5 px-3 text-[11px]">
                  {row.diff ? (
                    <span className={row.changed ? "text-[#04314A] font-semibold" : "text-[#737373]"}>
                      {row.diff.startsWith("-") ? row.diff : `+${row.diff}`}
                    </span>
                  ) : (
                    row.changed ? <span className="text-[#04314A]">Updated</span> : <span className="text-[#A3A3A3]">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {changedCount === 0 && (
        <p className="mt-2 text-[11px] text-[#737373]">No specification or pricing differences detected between these two revisions.</p>
      )}
    </div>
  );
}
