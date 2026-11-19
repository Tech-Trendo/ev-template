"use client";

import { useEffect, useState } from "react";
import { unitMarkSold, type SoldFinancePayload } from "@/lib/inventory";
import { UnitPicker, CustomerPicker, type UnitOption, type CustomerOption } from "@/admin/components/pickers";
import { Field, Modal, SelectField, inputCls, primaryBtnCls } from "./ui";

export function SaleFormModal({
  onClose,
  onSaved,
  initialUnitId,
  initialCustomerId,
  initialCustomerName,
  initialLeadId,
  initialLeadName,
  initialQuotationId,
  initialSellingPrice,
  initialDiscount,
  initialSalesperson,
}: {
  onClose: () => void;
  onSaved: (msg: string) => void;
  initialUnitId?: string | number | null;
  initialCustomerId?: string | number | null;
  initialCustomerName?: string;
  initialLeadId?: string | number | null;
  initialLeadName?: string;
  initialQuotationId?: string | number | null;
  initialSellingPrice?: number;
  initialDiscount?: number;
  initialSalesperson?: string;
}) {
  const [unitId, setUnitId] = useState<number | null>(
    initialUnitId ? Number(initialUnitId) : null,
  );
  const [selectedUnit, setSelectedUnit] = useState<UnitOption | null>(null);

  const [customerId, setCustomerId] = useState<number | null>(
    initialCustomerId ? Number(initialCustomerId) : null,
  );
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);

  const [saleDate, setSaleDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [sellingPrice, setSellingPrice] = useState<string>(
    initialSellingPrice ? String(initialSellingPrice) : "",
  );
  const [discount, setDiscount] = useState<string>(
    initialDiscount ? String(initialDiscount) : "0",
  );

  const [paymentMode, setPaymentMode] = useState<string>("CASH");
  const [bankName, setBankName] = useState<string>("");
  const [downPayment, setDownPayment] = useState<string>("");
  const [loanAmount, setLoanAmount] = useState<string>("");
  const [loanTenure, setLoanTenure] = useState<string>("60");
  const [interestRate, setInterestRate] = useState<string>("10.5");
  const [monthlyEmi, setMonthlyEmi] = useState<string>("");
  const [financeStatus, setFinanceStatus] = useState<string>("APPROVED");

  const [taxInvoiceNo, setTaxInvoiceNo] = useState<string>("");
  const [receiptVoucherNo, setReceiptVoucherNo] = useState<string>("");
  const [salesperson, setSalesperson] = useState<string>(initialSalesperson || "");
  const [warrantyEndDate, setWarrantyEndDate] = useState<string>("");
  const [deliveryNotes, setDeliveryNotes] = useState<string>("");

  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);

  // Auto-calculate loan amount and monthly EMI when price or down payment changes
  useEffect(() => {
    const priceNum = Number(sellingPrice) || 0;
    const dpNum = Number(downPayment) || 0;
    if (paymentMode !== "CASH" && priceNum > 0) {
      const calculatedLoan = Math.max(0, priceNum - dpNum);
      setLoanAmount(String(calculatedLoan));

      const tenureMonths = Number(loanTenure) || 60;
      const annualRate = Number(interestRate) || 10.5;
      const monthlyRate = annualRate / 12 / 100;
      if (monthlyRate > 0 && tenureMonths > 0 && calculatedLoan > 0) {
        const factor = Math.pow(1 + monthlyRate, tenureMonths);
        const emi = Math.round((calculatedLoan * monthlyRate * factor) / (factor - 1));
        setMonthlyEmi(String(emi));
      }
    }
  }, [sellingPrice, downPayment, loanTenure, interestRate, paymentMode]);

  const isFinanced =
    paymentMode === "BANK_FINANCE" ||
    paymentMode === "PARTIAL_FINANCE" ||
    paymentMode === "LEASE";

  const submit = async () => {
    if (!unitId) return setError("Vehicle unit is required.");
    if (!customerId) return setError("Customer is required to record a sale.");
    if (!sellingPrice || Number(sellingPrice) <= 0) {
      return setError("Valid selling price is required.");
    }
    if (!saleDate) return setError("Sale date is required.");

    setSaving(true);
    try {
      const payload: SoldFinancePayload = {
        sold_price: sellingPrice,
        sold_date: saleDate,
        customer: customerId,
        customer_name: selectedCustomer?.name || initialCustomerName || "",
        lead: initialLeadId ? Number(initialLeadId) : null,
        quotation: initialQuotationId ? Number(initialQuotationId) : null,
        payment_mode: paymentMode,
        finance_bank_name: isFinanced ? bankName : "",
        down_payment: isFinanced && downPayment ? Number(downPayment) : null,
        loan_amount: isFinanced && loanAmount ? Number(loanAmount) : null,
        loan_tenure_months: isFinanced && loanTenure ? Number(loanTenure) : null,
        interest_rate: isFinanced && interestRate ? Number(interestRate) : null,
        monthly_emi: isFinanced && monthlyEmi ? Number(monthlyEmi) : null,
        finance_status: isFinanced ? financeStatus : "APPROVED",
        tax_invoice_no: taxInvoiceNo.trim() || undefined,
        receipt_voucher_no: receiptVoucherNo.trim() || undefined,
        salesperson_name: salesperson.trim() || undefined,
        warranty_end_date: warrantyEndDate || null,
        delivery_notes: deliveryNotes.trim() || undefined,
      };

      await unitMarkSold(unitId, payload);
      onSaved(`Sale recorded for unit ${selectedUnit?.vin_chassis_no || unitId}.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record sale");
      setSaving(false);
    }
  };

  return (
    <Modal title="Record Vehicle Sale" onClose={onClose} wide>
      <div className="space-y-5">
        {/* Unit and Customer selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UnitPicker
            value={unitId}
            onChange={(id, u) => {
              setUnitId(id);
              setSelectedUnit(u);
              if (error) setError("");
            }}
            statusFilter={["READY_FOR_SALE", "RESERVED"]}
            label="Vehicle Unit"
            required
          />

          <CustomerPicker
            value={customerId}
            onChange={(id, c) => {
              setCustomerId(id);
              setSelectedCustomer(c);
              if (error) setError("");
            }}
            label="Customer / Buyer"
            required
          />
        </div>

        {/* Lead and Quotation context pills */}
        {(initialLeadId || initialQuotationId) && (
          <div className="flex flex-wrap gap-2 text-[11px] text-[#737373] bg-[#FAFAF8] border border-[#E8E8E5] rounded-xl px-4 py-2.5">
            {initialLeadId && (
              <span>
                Linked Lead: <strong className="text-[#0B3D2B]">{initialLeadName || `Lead #${initialLeadId}`}</strong>
              </span>
            )}
            {initialLeadId && initialQuotationId && <span>·</span>}
            {initialQuotationId && (
              <span>
                Linked Quotation: <strong className="text-[#0B3D2B]">QT-{initialQuotationId}</strong>
              </span>
            )}
          </div>
        )}

        {/* Pricing and dates */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Selling Price (NPR)" required>
            <input
              type="number"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              placeholder="e.g. 5200000"
              className={inputCls}
            />
          </Field>

          <Field label="Discount (NPR)">
            <input
              type="number"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              placeholder="0"
              className={inputCls}
            />
          </Field>

          <Field label="Sale / Handover Date" required>
            <input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        {/* Payment mode */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Payment Mode" required>
            <SelectField
              value={paymentMode}
              onChange={setPaymentMode}
              options={[
                { value: "CASH", label: "Cash / Bank Transfer" },
                { value: "BANK_FINANCE", label: "Bank Finance" },
                { value: "PARTIAL_FINANCE", label: "Partial Finance / EMI" },
                { value: "EXCHANGE", label: "Exchange / Trade-In" },
                { value: "LEASE", label: "Leasing" },
              ]}
            />
          </Field>

          <Field label="Salesperson">
            <input
              value={salesperson}
              onChange={(e) => setSalesperson(e.target.value)}
              placeholder="Sales executive name"
              className={inputCls}
            />
          </Field>
        </div>

        {/* Financing Fields if applicable */}
        {isFinanced && (
          <div className="border border-[#E8E8E5] rounded-xl p-4 bg-[#FAFAF8] space-y-4">
            <h4 className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#0B3D2B]">
              Financing and Banking Details
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Bank Name" required>
                <input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. Nabil Bank, Global IME"
                  className={inputCls}
                />
              </Field>
              <Field label="Down Payment (NPR)">
                <input
                  type="number"
                  value={downPayment}
                  onChange={(e) => setDownPayment(e.target.value)}
                  placeholder="e.g. 1500000"
                  className={inputCls}
                />
              </Field>
              <Field label="Loan Amount (NPR)">
                <input
                  type="number"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Loan Tenure (Months)">
                <input
                  type="number"
                  value={loanTenure}
                  onChange={(e) => setLoanTenure(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Interest Rate (% p.a.)">
                <input
                  type="number"
                  step="0.1"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Monthly EMI (NPR)">
                <input
                  type="number"
                  value={monthlyEmi}
                  onChange={(e) => setMonthlyEmi(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Finance Status">
                <SelectField
                  value={financeStatus}
                  onChange={setFinanceStatus}
                  options={[
                    { value: "PENDING", label: "Pending Approval" },
                    { value: "APPROVED", label: "Approved" },
                    { value: "DISBURSED", label: "Disbursed" },
                    { value: "REJECTED", label: "Rejected" },
                  ]}
                />
              </Field>
            </div>
          </div>
        )}

        {/* Invoicing, Warranty Override, Delivery Notes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Tax Invoice Number">
            <input
              value={taxInvoiceNo}
              onChange={(e) => setTaxInvoiceNo(e.target.value)}
              placeholder="e.g. INV-2081-001"
              className={inputCls}
            />
          </Field>
          <Field label="Receipt Voucher Number">
            <input
              value={receiptVoucherNo}
              onChange={(e) => setReceiptVoucherNo(e.target.value)}
              placeholder="e.g. REC-2081-001"
              className={inputCls}
            />
          </Field>
          <Field label="Warranty End Date (Manual Override)">
            <input
              type="date"
              value={warrantyEndDate}
              onChange={(e) => setWarrantyEndDate(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
        <p className="text-[11px] text-[#737373] -mt-2">
          Note: Leave Warranty End Date empty to apply the catalog model warranty terms automatically.
        </p>

        <Field label="Delivery / Handover Notes">
          <textarea
            value={deliveryNotes}
            onChange={(e) => setDeliveryNotes(e.target.value)}
            rows={2}
            placeholder="Vehicle condition, accessories delivered, insurance details..."
            className={inputCls}
          />
        </Field>

        {error && <p className="text-[12px] text-[#10B981]">{error}</p>}

        <div data-modal-actions className="flex justify-end gap-3 pt-3 border-t border-[#F0F0ED]">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#737373] hover:text-[#0B3D2B] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className={primaryBtnCls}
          >
            {saving ? "Recording Sale..." : "Record Sale"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
