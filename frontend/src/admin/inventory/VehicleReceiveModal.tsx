import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAuth } from "../AuthContext";
import { UnitPicker, type UnitOption } from "../components/pickers";
import {
  createReceiveChecklist,
  fetchUnit,
  RECEIVE_ENTITIES,
  RECEIVE_TOOLKIT_ITEMS,
  updateReceiveChecklist,
  type ReceiveEntityCondition,
  type ReceiveToolkitItem,
  type UnitDetail,
  type VehicleReceiveCheckList,
} from "@/lib/inventory";
import { logPrintEvent } from "@/components/PrintFooter";
import { Field, inputCls, Modal, useToast } from "../crm/ui";

function applyUnitDefaults(
  next: UnitDetail,
  prev: {
    vehicle_run_km: string;
    battery_power_kw: string;
    vehicle_color: string;
  },
) {
  return {
    vehicle_run_km: prev.vehicle_run_km || String(next.odometer_km ?? ""),
    battery_power_kw:
      prev.battery_power_kw ||
      (next.effective_battery_kw != null ? String(next.effective_battery_kw) : ""),
    vehicle_color: prev.vehicle_color || next.color || "",
  };
}

export default function VehicleReceiveModal({
  unit: initialUnit = null,
  initialChecklist,
  serviceRecordId,
  purpose = "inventory",
  allowUnitChange = true,
  onClose,
  onSaved,
  onPrepareServiceRecord,
  onUnitChange,
}: {
  unit?: UnitDetail | null;
  initialChecklist?: VehicleReceiveCheckList | null;
  /** When set, checklist is tied to a workshop VRO (service intake). */
  serviceRecordId?: number | null;
  purpose?: "inventory" | "servicing";
  /** Allow changing VIN via searchable UnitPicker (default true). */
  allowUnitChange?: boolean;
  onClose: () => void;
  onSaved: (info?: { serviceRecordId: number | null }) => void;
  /** Called before first save when no service_record yet — create draft VRO and return its id. */
  onPrepareServiceRecord?: (unit: UnitDetail) => Promise<number>;
  onUnitChange?: (unit: UnitDetail | null) => void;
}) {
  const isServicing = purpose === "servicing" || serviceRecordId != null || !!onPrepareServiceRecord;
  const { me } = useAuth();
  const toast = useToast();
  const [printMode, setPrintMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unit, setUnit] = useState<UnitDetail | null>(initialUnit);
  const [unitLoading, setUnitLoading] = useState(false);

  useEffect(() => {
    // Keep local selection in sync only when parent explicitly provides a unit
    // (e.g. editing an existing checklist). New intake starts with null.
    if (initialUnit?.id) setUnit(initialUnit);
    else if (!initialUnit) setUnit(null);
  }, [initialUnit?.id]);

  const defaultEntities: ReceiveEntityCondition[] = RECEIVE_ENTITIES.map((name, idx) => ({
    id: idx + 1,
    entity: name,
    condition: "Good",
    remarks: "",
  }));

  const defaultToolkit: ReceiveToolkitItem[] = RECEIVE_TOOLKIT_ITEMS.map((name, idx) => ({
    id: idx + 1,
    item: name,
    present: true,
    remarks: "",
  }));

  const [form, setForm] = useState({
    receive_date: initialChecklist?.receive_date ?? new Date().toISOString().slice(0, 10),
    driver_name: initialChecklist?.driver_name ?? "",
    driver_contact: initialChecklist?.driver_contact ?? "",
    driver_signature: initialChecklist?.driver_signature ?? "",
    rep_signature:
      initialChecklist?.rep_signature ??
      (me ? [me.first_name, me.last_name].filter(Boolean).join(" ") || me.username : ""),
    ev_company: initialChecklist?.ev_company ?? "Vehicle Template",
    vehicle_run_km: String(initialChecklist?.vehicle_run_km ?? initialUnit?.odometer_km ?? ""),
    ev_seater: initialChecklist?.ev_seater ?? "",
    battery_power_kw: String(
      initialChecklist?.battery_power_kw ?? initialUnit?.effective_battery_kw ?? "",
    ),
    ev_charge_percent: String(initialChecklist?.ev_charge_percent ?? ""),
    vehicle_color: initialChecklist?.vehicle_color ?? initialUnit?.color ?? "",
    vehicle_parked_yard: initialChecklist?.vehicle_parked_yard ?? "",
    any_other_information: initialChecklist?.any_other_information ?? "",
  });

  const selectUnit = async (unitId: number | null, option: UnitOption | null) => {
    if (!unitId || !option) {
      setUnit(null);
      onUnitChange?.(null);
      return;
    }
    setUnitLoading(true);
    setError("");
    try {
      let next: UnitDetail;
      try {
        next = await fetchUnit(unitId);
      } catch {
        next = {
          id: Number(option.id),
          vin_chassis_no: option.vin_chassis_no,
          vehicle_model: Number(option.vehicle_model_id) || 0,
          model_detail: {
            id: Number(option.model_detail?.id || option.vehicle_model_id) || 0,
            brand: option.model_detail?.brand || "",
            model_name: option.model_detail?.model_name || option.vehicle_model_name || "",
          },
          import_batch: 0,
          batch_no: "",
          color: option.color || "",
          motor_no: option.motor_no || "",
          status: (option.status as UnitDetail["status"]) || "IN_STOCK",
          manufacture_date: null,
          odometer_km: option.odometer_km ?? 0,
          pdi_status: null,
          pdi_no: "",
          selling_price: option.selling_price != null ? String(option.selling_price) : null,
          sold_date: option.sold_date ?? null,
          customer: option.current_customer_id != null ? Number(option.current_customer_id) : null,
          customer_name: option.current_customer?.name || option.current_customer_name || "",
          customer_detail: option.current_customer
            ? {
                id: Number(option.current_customer.id),
                name: option.current_customer.name,
                company: "",
                phone: option.current_customer.phone || "",
              }
            : undefined,
          lead: null,
          quotation: null,
          battery_power_kw:
            option.effective_battery_kw != null ? String(option.effective_battery_kw) : null,
          motor_power_kw: null,
          effective_battery_kw:
            option.effective_battery_kw != null ? String(option.effective_battery_kw) : null,
          effective_motor_kw: null,
          purchase_cost: null,
          landed_cost: null,
          sold_price: null,
          batch_detail: { id: 0, batch_no: "", origin: "" },
          movements: [],
          pdi_history: [],
          condition_history: [],
          created_at: "",
          updated_at: "",
        } as UnitDetail;
      }
      setUnit(next);
      onUnitChange?.(next);
      setForm((prev) => ({ ...prev, ...applyUnitDefaults(next, prev) }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load selected vehicle");
    } finally {
      setUnitLoading(false);
    }
  };

  const [entities, setEntities] = useState<ReceiveEntityCondition[]>(
    initialChecklist?.entity_conditions && initialChecklist.entity_conditions.length > 0
      ? initialChecklist.entity_conditions.map((e) => ({
          ...e,
          condition: e.condition === "Bad" || e.condition === "N/W" ? "Bad" : "Good",
        }))
      : defaultEntities,
  );

  const [toolkit] = useState<ReceiveToolkitItem[]>(
    initialChecklist?.toolkit_items && initialChecklist.toolkit_items.length > 0
      ? initialChecklist.toolkit_items
      : defaultToolkit,
  );

  const updateEntity = (idx: number, patch: Partial<ReceiveEntityCondition>) => {
    setEntities((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      if (!unit?.id) {
        setError("Select a VIN / Chassis number before saving.");
        setBusy(false);
        return;
      }

      let linkedRecordId: number | null =
        serviceRecordId ?? initialChecklist?.service_record ?? null;
      if (!linkedRecordId && onPrepareServiceRecord) {
        linkedRecordId = await onPrepareServiceRecord(unit);
      }

      const payload: Partial<VehicleReceiveCheckList> = {
        vehicle: unit.id,
        service_record: linkedRecordId,
        import_batch: isServicing ? null : unit.import_batch || null,
        receive_date: form.receive_date,
        driver_name: form.driver_name.trim(),
        driver_contact: form.driver_contact.trim(),
        driver_signature: form.driver_signature.trim(),
        rep_signature: form.rep_signature.trim(),
        ev_company: form.ev_company.trim(),
        vehicle_run_km: Number(form.vehicle_run_km) || 0,
        ev_seater: form.ev_seater.trim(),
        battery_power_kw: form.battery_power_kw ? form.battery_power_kw : null,
        ev_charge_percent: Number(form.ev_charge_percent) || 0,
        vehicle_color: form.vehicle_color.trim(),
        vehicle_parked_yard: form.vehicle_parked_yard.trim(),
        any_other_information: form.any_other_information.trim(),
        legend_notes: "",
        entity_conditions: entities,
        toolkit_items: toolkit,
        overall_status: "ACCEPTED",
      };

      if (initialChecklist) {
        await updateReceiveChecklist(initialChecklist.id, payload);
        toast.push(isServicing ? "Service receive checklist updated" : "Vehicle receive checklist updated");
      } else {
        await createReceiveChecklist(payload);
        toast.push(
          isServicing
            ? "Receive checklist saved — servicing order created"
            : "Vehicle receive checklist recorded",
        );
      }
      onSaved({ serviceRecordId: linkedRecordId });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save receive checklist");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Vehicle Receive Check List"
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[#E8E8E5] text-[12px] font-semibold text-[#737373] bg-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || printMode}
            onClick={save}
            className="px-5 py-2 rounded-lg bg-[#04314A] text-white text-[12px] font-semibold hover:bg-[#00AAEB] transition-colors disabled:opacity-50"
          >
            {busy ? "Saving..." : initialChecklist ? "Update Receive Checklist" : "Save Receive Checklist"}
          </button>
        </>
      }
    >
      <div className="flex justify-end mb-3 pb-2 border-b border-[#E8E8E5] no-print">
        <div className="flex items-center gap-2">
          {printMode && (
            <button
              type="button"
              onClick={async () => {
                await logPrintEvent({
                  documentType: "VEHICLE_RECEIVE_CHECKLIST",
                  objectId: initialChecklist?.receive_no || initialChecklist?.id || serviceRecordId || undefined,
                  title: `VRC ${initialChecklist?.receive_no || unit?.vin_chassis_no || ""}`,
                });
                window.print();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#04314A] text-white text-[11px] font-bold hover:bg-[#00AAEB] transition-colors"
            >
              <Printer size={13} /> Print Checklist
            </button>
          )}
          <button
            type="button"
            onClick={() => setPrintMode(!printMode)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E8E8E5] text-[11px] font-semibold text-[#04314A] hover:bg-[#FAFAF8]"
          >
            <Printer size={13} /> {printMode ? "Form Editor" : "Official Paper View"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-[12px] no-print">
          {error}
        </div>
      )}

      {printMode ? (
        /* Official paper layout — read-only preview */
        <div className="print-document bg-white border border-[#222] p-4 sm:p-6 text-[#111] font-sans text-[12px] print:border-none print:p-0">
          <div className="text-center mb-5 pb-3 border-b border-[#222]">
            <h2 className="text-[15px] sm:text-[17px] font-bold tracking-wide">
              Vehicle Template &amp; Investment Pvt.Ltd.
            </h2>
            <p className="text-[11px] sm:text-[12px] mt-0.5">Your Address, Your City Â· +1 555 0100</p>
            <h3 className="text-[14px] sm:text-[16px] font-black underline mt-2 tracking-wide">
              Vehicle Receive Check List
            </h3>
          </div>

          <div className="space-y-2 mb-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
              <div>
                <strong>VIN/CHASSIS NO.:</strong> {unit?.vin_chassis_no || "—"}
              </div>
              <div>
                <strong>DATE:</strong> {form.receive_date}
              </div>
            </div>
            <div>
              <strong>DRIVER&apos;S NAME:</strong>{" "}
              <span className="underline">{form.driver_name || "________________"}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
              <div>
                <strong>DRIVER&apos;S CONTACT NO.:</strong>{" "}
                <span className="underline">{form.driver_contact || "________________"}</span>
              </div>
              <div>
                <strong>DRIVER&apos;S SIGNATURE:</strong>{" "}
                <span className="underline">{form.driver_signature || "________________"}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
              <div>
                <strong>COMPANY REPRESENTATIVE SIGNATURE:</strong>{" "}
                <span className="underline">{form.rep_signature || "________________"}</span>
              </div>
              <div>
                <strong>EV SEATER:</strong>{" "}
                <span className="underline">{form.ev_seater || "________________"}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
              <div>
                <strong>EV COMPANY:</strong> {form.ev_company || "—"}
              </div>
              <div>
                <strong>Vehicle Run(KM):</strong> {form.vehicle_run_km || "—"}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
              <div>
                <strong>BATTERY POWER(KW):</strong> {form.battery_power_kw || "—"}
              </div>
              <div>
                <strong>EV CHARGE(%):</strong> {form.ev_charge_percent || "—"}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
              <div>
                <strong>VEHICLE COLOR:</strong> {form.vehicle_color || "—"}
              </div>
              <div>
                <strong>VEHICLE PARKED/YARD:</strong> {form.vehicle_parked_yard || "—"}
              </div>
            </div>
            <div>
              <strong>ANY OTHER INFORMATION:</strong> {form.any_other_information || "—"}
            </div>
          </div>

          <table className="w-full border-collapse border border-[#222] text-[11px] sm:text-[12px]">
            <thead>
              <tr className="bg-[#F3F3F3]">
                <th className="border border-[#222] p-1.5 w-10 text-center">S.N.</th>
                <th className="border border-[#222] p-1.5 text-left">Entities</th>
                <th className="border border-[#222] p-1.5 w-24 text-center">
                  Condition
                  <br />
                  (Good)
                </th>
                <th className="border border-[#222] p-1.5 w-24 text-center">
                  Condition
                  <br />
                  (Bad)
                </th>
                <th className="border border-[#222] p-1.5 text-left">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {entities.map((ent, idx) => {
                const isGood = ent.condition !== "Bad";
                return (
                  <tr key={ent.id ?? idx}>
                    <td className="border border-[#222] p-1.5 text-center">{idx + 1}</td>
                    <td className="border border-[#222] p-1.5 font-medium">{ent.entity}</td>
                    <td className="border border-[#222] p-1.5 text-center">{isGood ? "✓" : ""}</td>
                    <td className="border border-[#222] p-1.5 text-center">{!isGood ? "✓" : ""}</td>
                    <td className="border border-[#222] p-1.5">{ent.remarks || ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Easy edit form */
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 bg-[#FAFAF8] border border-[#E8E8E5] p-3 rounded-lg text-[12px]">
            <div className="sm:col-span-2 lg:col-span-1">
              {allowUnitChange ? (
                <UnitPicker
                  value={unit?.id ?? null}
                  onChange={(id, option) => void selectUnit(id, option)}
                  label="VIN / Chassis No."
                  placeholder="Search VIN / chassis..."
                  searchPlaceholder="Search VIN, chassis, motor, or owner..."
                  required
                  disabled={busy || unitLoading}
                  allowClear={!serviceRecordId && !initialChecklist}
                  compact
                />
              ) : (
                <Field label="VIN / Chassis No.">
                  <input
                    readOnly
                    value={unit?.vin_chassis_no || ""}
                    className={`${inputCls} bg-[#F0F0ED]`}
                  />
                </Field>
              )}
            </div>
            <Field label="Date">
              <input
                type="date"
                value={form.receive_date}
                onChange={(e) => setForm({ ...form, receive_date: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Driver's Name">
              <input
                value={form.driver_name}
                onChange={(e) => setForm({ ...form, driver_name: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Driver's Contact No.">
              <input
                value={form.driver_contact}
                onChange={(e) => setForm({ ...form, driver_contact: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Driver's Signature">
              <input
                value={form.driver_signature}
                onChange={(e) => setForm({ ...form, driver_signature: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Company Representative Signature">
              <input
                value={form.rep_signature}
                onChange={(e) => setForm({ ...form, rep_signature: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="EV Seater">
              <input
                value={form.ev_seater}
                onChange={(e) => setForm({ ...form, ev_seater: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="EV Company">
              <input
                value={form.ev_company}
                onChange={(e) => setForm({ ...form, ev_company: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Vehicle Run (KM)">
              <input
                type="number"
                value={form.vehicle_run_km}
                onChange={(e) => setForm({ ...form, vehicle_run_km: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Battery Power (KW)">
              <input
                value={form.battery_power_kw}
                onChange={(e) => setForm({ ...form, battery_power_kw: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="EV Charge (%)">
              <input
                type="number"
                min={0}
                max={100}
                value={form.ev_charge_percent}
                onChange={(e) => setForm({ ...form, ev_charge_percent: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Vehicle Color">
              <input
                value={form.vehicle_color}
                onChange={(e) => setForm({ ...form, vehicle_color: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Vehicle Parked / Yard">
              <input
                value={form.vehicle_parked_yard}
                onChange={(e) => setForm({ ...form, vehicle_parked_yard: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Any Other Information">
            <textarea
              rows={2}
              value={form.any_other_information}
              onChange={(e) => setForm({ ...form, any_other_information: e.target.value })}
              className={inputCls}
            />
          </Field>

          <div className="border border-[#E8E8E5] rounded-lg overflow-hidden">
            <div className="bg-[#FAFAF8] px-3 py-2 border-b border-[#E8E8E5]">
              <span className="text-[12px] font-bold text-[#04314A]">Entity Conditions</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px] min-w-[640px]">
                <thead>
                  <tr className="border-b border-[#E8E8E5] text-[10px] uppercase tracking-wider text-[#737373]">
                    <th className="px-3 py-2 w-10">S.N.</th>
                    <th className="px-3 py-2">Entities</th>
                    <th className="px-3 py-2 w-28 text-center">Good</th>
                    <th className="px-3 py-2 w-28 text-center">Bad</th>
                    <th className="px-3 py-2">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {entities.map((ent, idx) => {
                    const isGood = ent.condition !== "Bad";
                    return (
                      <tr key={ent.id ?? idx} className="border-b border-[#F0F0ED] last:border-0">
                        <td className="px-3 py-2 text-[#737373]">{idx + 1}</td>
                        <td className="px-3 py-2 font-semibold text-[#04314A]">{ent.entity}</td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={isGood}
                            onChange={() => updateEntity(idx, { condition: "Good" })}
                            className="w-4 h-4 accent-[#04314A]"
                            aria-label={`${ent.entity} Good`}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={!isGood}
                            onChange={() => updateEntity(idx, { condition: "Bad" })}
                            className="w-4 h-4 accent-[#04314A]"
                            aria-label={`${ent.entity} Bad`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={ent.remarks || ""}
                            onChange={(e) => updateEntity(idx, { remarks: e.target.value })}
                            className="w-full border border-[#E8E8E5] rounded px-2 py-1 text-[11px] text-[#04314A]"
                            placeholder="Remarks..."
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {toast.node}
    </Modal>
  );
}
