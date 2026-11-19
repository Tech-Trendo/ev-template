import React from "react";
import { Printer, X } from "lucide-react";
import { Button, Modal } from "../../components/ui";
import { PrintFooter, logPrintEvent } from "../../components/PrintFooter";

export interface SaleReceiptData {
  id: number | string;
  receipt_no?: string;
  tax_invoice_no?: string;
  sale_date?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_company?: string;
  customer_address?: string;
  unit_vin?: string;
  unit_model_name?: string;
  unit_variant_name?: string;
  color?: string;
  motor_no?: string;
  selling_price?: number | string;
  discount?: number | string;
  payment_mode?: string;
  bank?: string;
  down_payment?: number | string;
  loan_amount?: number | string;
  tenure?: number | string;
  interest?: number | string;
  emi?: number | string;
  finance_status?: string;
  created_by_name?: string;
  created_at?: string;
  dealer_name?: string;
  salesperson_name?: string;
  notes?: string;
}

interface SaleReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: SaleReceiptData | null;
}

export function SaleReceiptModal({
  isOpen,
  onClose,
  sale,
}: SaleReceiptModalProps) {
  if (!isOpen || !sale) return null;

  const formatNpr = (val: number | string | undefined | null) => {
    if (val === undefined || val === null || val === "") return "-";
    const num = typeof val === "number" ? val : parseFloat(val);
    if (isNaN(num)) return String(val);
    return `NPR ${num.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const handlePrint = async () => {
    await logPrintEvent({
      documentType: "SALES_RECEIPT",
      objectId: sale.receipt_no || sale.id,
      title: `Sale Receipt #${sale.receipt_no || sale.id} - ${sale.customer_name || ""}`,
    });
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto print:fixed print:inset-0 print:m-0 print:p-8 print:max-h-none print:w-full print:shadow-none print:border-none">
        {/* Modal Controls (Hidden in print) */}
        <div className="flex items-center justify-between pb-4 border-b border-[#E8E8E5] no-print">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold tracking-wider uppercase text-[#04314A]">
              Official Sale Receipt Preview
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handlePrint}
              className="flex items-center gap-1.5"
            >
              <Printer size={14} /> Print Receipt
            </Button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#737373] hover:text-[#04314A] hover:bg-[#F0F0ED] transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Receipt Content */}
        <div className="printable-receipt pt-6 text-[#04314A]">
          {/* Header */}
          <div className="border-b-2 border-[#04314A] pb-4 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-[20px] font-black tracking-tight text-[#04314A]">
                  VEHICLE TEMPLATE
                </h1>
                <p className="text-[11px] text-[#737373] font-medium">
                  Vehicle Template
                </p>
                <p className="text-[10px] text-[#737373]">
                  Authorized Distributor of VT Commercial Electric Vehicles
                </p>
                {sale.dealer_name && (
                  <p className="text-[11px] font-semibold text-[#04314A] mt-1">
                    Dealership: {sale.dealer_name}
                  </p>
                )}
              </div>
              <div className="text-right">
                <span className="inline-block bg-[#04314A] text-white text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded">
                  Official Sale Receipt
                </span>
                <div className="mt-2 text-[12px]">
                  <strong>Receipt No:</strong>{" "}
                  <span className="font-mono font-bold">
                    {sale.receipt_no || `REC-${sale.id}`}
                  </span>
                </div>
                {sale.tax_invoice_no && (
                  <div className="text-[11px] text-[#737373]">
                    Tax Invoice:{" "}
                    <span className="font-mono">{sale.tax_invoice_no}</span>
                  </div>
                )}
                <div className="text-[11px] text-[#737373]">
                  Date: {sale.sale_date || new Date().toISOString().split("T")[0]}
                </div>
              </div>
            </div>
          </div>

          {/* Customer & Vehicle Details Grid */}
          <div className="grid grid-cols-2 gap-6 mb-6 text-[12px]">
            <div className="p-4 bg-[#FAFAF8] rounded-xl border border-[#E8E8E5]">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#737373] mb-2">
                Customer Information
              </h3>
              <p className="text-[14px] font-bold text-[#04314A]">
                {sale.customer_name || "Valued Customer"}
              </p>
              {sale.customer_company && (
                <p className="text-[#737373]">{sale.customer_company}</p>
              )}
              {sale.customer_phone && (
                <p className="text-[#04314A]">Phone: {sale.customer_phone}</p>
              )}
              {sale.customer_address && (
                <p className="text-[#737373] text-[11px]">
                  {sale.customer_address}
                </p>
              )}
            </div>

            <div className="p-4 bg-[#FAFAF8] rounded-xl border border-[#E8E8E5]">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#737373] mb-2">
                Vehicle Specifications
              </h3>
              <p className="text-[14px] font-bold text-[#04314A]">
                {sale.unit_model_name || "VT Electric Commercial Vehicle"}
                {sale.unit_variant_name ? ` (${sale.unit_variant_name})` : ""}
              </p>
              <p className="font-mono text-[12px] text-[#04314A] font-semibold mt-1">
                VIN / Chassis: {sale.unit_vin || "-"}
              </p>
              {sale.color && (
                <p className="text-[11px] text-[#737373]">Color: {sale.color}</p>
              )}
              {sale.motor_no && (
                <p className="text-[11px] text-[#737373]">
                  Motor No: {sale.motor_no}
                </p>
              )}
            </div>
          </div>

          {/* Financial Breakdown Table */}
          <div className="border border-[#E8E8E5] rounded-xl overflow-hidden mb-6">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="bg-[#F0F0ED] text-[11px] font-bold uppercase tracking-wider text-[#04314A]">
                  <th className="p-3">Payment Component</th>
                  <th className="p-3 text-right">Details / Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E8E5]">
                <tr>
                  <td className="p-3 font-medium">Selling Agreed Price</td>
                  <td className="p-3 text-right font-bold text-[#04314A]">
                    {formatNpr(sale.selling_price)}
                  </td>
                </tr>
                {Number(sale.discount || 0) > 0 && (
                  <tr>
                    <td className="p-3 text-[#737373]">Discount Applied</td>
                    <td className="p-3 text-right font-semibold text-emerald-600">
                      - {formatNpr(sale.discount)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="p-3 font-medium">Payment Mode</td>
                  <td className="p-3 text-right uppercase font-semibold text-[#04314A]">
                    {sale.payment_mode
                      ? String(sale.payment_mode).replace(/_/g, " ")
                      : "CASH"}
                  </td>
                </tr>
                {Number(sale.down_payment || 0) > 0 && (
                  <tr>
                    <td className="p-3 text-[#737373]">Down Payment Received</td>
                    <td className="p-3 text-right font-bold text-[#04314A]">
                      {formatNpr(sale.down_payment)}
                    </td>
                  </tr>
                )}
                {Number(sale.loan_amount || 0) > 0 && (
                  <tr>
                    <td className="p-3 text-[#737373]">
                      Financed Amount ({sale.bank || "Partner Bank"})
                    </td>
                    <td className="p-3 text-right font-medium text-[#04314A]">
                      {formatNpr(sale.loan_amount)}
                    </td>
                  </tr>
                )}
                {sale.tenure && (
                  <tr>
                    <td className="p-3 text-[#737373]">Financing Tenure & EMI</td>
                    <td className="p-3 text-right text-[11px] text-[#737373]">
                      {sale.tenure} Months @ {sale.interest || "0"}% · EMI:{" "}
                      {formatNpr(sale.emi)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Audit / Entry Information */}
          <div className="bg-[#F9F9F7] p-3 rounded-lg border border-[#E8E8E5] text-[11px] text-[#737373] mb-8 flex justify-between items-center">
            <span>
              Entered by:{" "}
              <strong className="text-[#04314A]">
                {sale.created_by_name || "Authorized Staff"}
              </strong>
              {sale.created_at &&
                ` on ${new Date(sale.created_at).toLocaleDateString()}`}
            </span>
            {sale.salesperson_name && (
              <span>
                Sales Executive:{" "}
                <strong className="text-[#04314A]">
                  {sale.salesperson_name}
                </strong>
              </span>
            )}
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-12 pt-8 border-t border-[#E8E8E5] text-[11px]">
            <div className="text-center">
              <div className="border-t border-[#04314A] w-48 mx-auto pt-1 font-semibold">
                Customer Signature
              </div>
            </div>
            <div className="text-center">
              <div className="border-t border-[#04314A] w-48 mx-auto pt-1 font-semibold">
                Authorized Signatory / Cashier
              </div>
            </div>
          </div>

          {/* Standard Stamped Print Footer */}
          <PrintFooter
            documentType="SALES_RECEIPT"
            objectId={sale.receipt_no || sale.id}
            className="mt-8"
          />
        </div>
      </div>
    </div>
  );
}

export default SaleReceiptModal;
