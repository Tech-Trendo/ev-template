import { useEffect, useState, useMemo } from "react";
import {
  Plus,
  Trash2,
  Search,
  Minus,
  Printer,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Camera,
  X,
} from "lucide-react";
import VehicleReceiveModal from "./inventory/VehicleReceiveModal";
import {
  fetchReceiveChecklist,
  fetchReceiveChecklists,
  fetchUnit,
  type UnitDetail,
  type VehicleReceiveCheckList,
} from "@/lib/inventory";
import { api, ApiError, getTokens } from "@/lib/api";
import { inputCls, Field, Modal, SelectField, useToast } from "./crm/ui";
import { Button, Badge } from "@/components/ui";
import { logPrintEvent } from "@/components/PrintFooter";
import { fetchDealers, type Dealer } from "./DealersManager";
import { EntityLink } from "./components/pickers";

export const SERVICE_STATUSES = [
  { value: "received", label: "Received" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting_for_parts", label: "Waiting for Parts" },
  { value: "completed", label: "Completed" },
  { value: "delivered", label: "Delivered" },
] as const;

export type PrefillResult = {
  unit: {
    id: number | null;
    vin: string;
    model: string;
    model_id?: number | null;
    color: string;
    motor_no: string;
    battery: number | null;
    registration: string;
    odometer_last: number | null;
  };
  customer: {
    id: number | null;
    code: string;
    name: string;
    phone: string;
    email: string;
    address: string;
    type: string;
  } | null;
  sale: {
    date: string | null;
    dealer: string;
    dealer_id: number | null;
  } | null;
  warranty: {
    status: "active" | "expired" | "none" | "not_configured";
    end_date: string | null;
    start_date: string | null;
    vehicle?: {
      status: "active" | "expired" | "none" | "not_configured";
      end_date: string | null;
      months?: number | null;
      km?: number | null;
    };
    battery?: {
      status: "active" | "expired" | "none" | "not_configured";
      end_date: string | null;
      months?: number | null;
      km?: number | null;
    };
  };
  last_service: {
    vro_no: string;
    date: string;
    status: string;
  } | null;
  service_count: number;
};

function getCurrentUserId(): number | null {
  try {
    const tokens = getTokens();
    if (!tokens?.access) return null;
    const payload = tokens.access.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.user_id === "number" ? json.user_id : typeof json.user_id === "string" ? Number(json.user_id) : null;
  } catch {
    return null;
  }
}

export type ServicePart = {
  id?: number;
  part_name: string;
  part_number: string;
  quantity: number;
  labour_cost: string;
  cost: string;
  total_cost?: number;
};

export const VRO_INVENTORY_ITEMS = [
  { key: "service_book", label: "SERVICE BOOK" },
  { key: "toolkit", label: "TOOLKIT" },
  { key: "spare_wheel", label: "SPARE WHEEL" },
  { key: "jack_and_handel", label: "JACK & HANDEL" },
  { key: "mats", label: "MATS" },
  { key: "mud_flaps", label: "MUD FLAPS" },
  { key: "stereo", label: "STEREO" },
  { key: "clocks", label: "CLOCKS" },
  { key: "wheel_caps", label: "WHEEL CAPS" },
  { key: "idol", label: "IDOL" },
  { key: "others", label: "OTHERS" },
] as const;

/** Normalize stored times ("2:39 PM", "14:39:00") to `HH:MM` for `<input type="time">`. */
function toTimeInputValue(raw: string | null | undefined): string {
  const s = (raw || "").trim();
  if (!s) return "";
  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m24) return `${m24[1].padStart(2, "0")}:${m24[2]}`;
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m12) return "";
  let h = Number(m12[1]) % 12;
  if (m12[3].toUpperCase() === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${m12[2]}`;
}

function nowTimeInputValue(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export type ServiceRecord = {
  id: number;
  vro_no: string;
  chassis_number: string;
  vehicle_unit: number | null;
  vehicle: number | null;
  vehicle_name: string;
  vehicle_model_name?: string;
  lead: number | null;
  lead_name?: string;
  customer: number | null;
  customer_name: string;
  customer_address: string;
  customer_mobile: string;
  dealer: number | null;
  dealer_name: string;
  status: string;
  technician: number | null;
  technician_name: string;
  date_received: string;
  time_received: string;
  date_completed: string | null;
  actual_delivered_at: string | null;
  duration_display: string;
  v_reg_no: string;
  battery_kw: string | number | null;
  motor_no: string;
  date_of_sale: string | null;
  ev_company: string;
  estimated_cost: string | number | null;
  labour_cost: string | number | null;
  parts_cost: string | number | null;
  total_cost: number;
  job_description: string;
  action_taken: string;
  service_notes: string;
  odometer_reading: number | null;
  entry_inventory: Record<string, { present: boolean; remarks: string }>;
  entry_images?: { item_key: string; image_url: string }[];
  service_advisor: string;
  work_forwarded_to: string;
  customer_undertaking_agreed: boolean;
  customer_signature: string;
  parts: ServicePart[];
  is_external?: boolean;
  has_receive_checklist?: boolean;
  receive_checklist_id?: number | null;
  vro_filled?: boolean;
  created_at?: string;
};

type StaffUser = { id: number; username: string; first_name: string; last_name: string; role_names?: string[] };

const EMPTY_PART: ServicePart = { part_name: "", part_number: "", quantity: 1, labour_cost: "", cost: "" };

function RecordForm({
  initial,
  initialUnitId,
  dealers: _dealers,
  technicians,
  onClose,
  onSaved,
}: {
  initial: ServiceRecord | null;
  initialUnitId?: string | number | null;
  dealers: Dealer[];
  technicians: StaffUser[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [printPreview, setPrintPreview] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PrefillResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<PrefillResult | null>(null);
  const [recentServices, setRecentServices] = useState<ServiceRecord[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [isExternal, setIsExternal] = useState(initial?.is_external ?? false);
  const [overrideCustomer, setOverrideCustomer] = useState(false);

  const currentUserId = useMemo(() => getCurrentUserId(), []);
  const defaultTechnician = useMemo(() => {
    if (currentUserId == null) return null;
    return technicians.find((t) => t.id === currentUserId) ?? null;
  }, [currentUserId, technicians]);

  type InventoryValue = {
    present: boolean;
    remarks: string;
    imageUrl?: string;
    imageFile?: File | null;
    imagePreview?: string;
  };
  const initialInventory: Record<string, InventoryValue> = {};
  VRO_INVENTORY_ITEMS.forEach((item) => {
    const saved = initial?.entry_inventory?.[item.key];
    const photo = initial?.entry_images?.find((image) => image.item_key === item.key);
    initialInventory[item.key] = {
      present: saved?.present ?? true,
      remarks: saved?.remarks ?? "",
      imageUrl: photo?.image_url || "",
    };
  });

  const [form, setForm] = useState({
    vro_no: initial?.vro_no ?? "",
    chassis_number: initial?.chassis_number ?? "",
    vehicle_unit: initial?.vehicle_unit != null ? String(initial.vehicle_unit) : "",
    lead: initial?.lead != null ? String(initial.lead) : "",
    customer: initial?.customer != null ? String(initial.customer) : "",
    dealer: initial?.dealer != null ? String(initial.dealer) : "",
    dealer_name: initial?.dealer_name ?? "",
    technician: initial?.technician != null ? String(initial.technician) : (defaultTechnician ? String(defaultTechnician.id) : ""),
    status: initial?.status ?? "received",
    date_received: initial?.date_received ?? new Date().toISOString().slice(0, 10),
    time_received: toTimeInputValue(initial?.time_received) || nowTimeInputValue(),
    date_completed: initial?.date_completed ?? "",
    actual_delivered_at: initial?.actual_delivered_at ? initial.actual_delivered_at.slice(0, 16) : "",
    v_reg_no: initial?.v_reg_no ?? "",
    vehicle_model_name: initial?.vehicle_model_name ?? initial?.vehicle_name ?? "",
    vehicle_color: "",
    battery_kw: initial?.battery_kw != null ? String(initial.battery_kw) : "",
    motor_no: initial?.motor_no ?? "",
    date_of_sale: initial?.date_of_sale ?? "",
    ev_company: initial?.ev_company ?? "Vehicle Template",
    customer_name: initial?.customer_name ?? "",
    customer_address: initial?.customer_address ?? "",
    customer_mobile: initial?.customer_mobile ?? "",
    customer_email: "",
    estimated_cost: initial?.estimated_cost != null ? String(initial.estimated_cost) : "",
    labour_cost: initial?.labour_cost != null ? String(initial.labour_cost) : "0",
    parts_cost: initial?.parts_cost != null ? String(initial.parts_cost) : "0",
    job_description: initial?.job_description ?? "",
    action_taken: initial?.action_taken ?? "",
    service_notes: initial?.service_notes ?? "",
    odometer_reading: initial?.odometer_reading != null ? String(initial.odometer_reading) : "",
    service_advisor: initial?.service_advisor ?? "",
    work_forwarded_to: initial?.work_forwarded_to ?? (defaultTechnician ? [defaultTechnician.first_name, defaultTechnician.last_name].filter(Boolean).join(" ") || defaultTechnician.username : ""),
    customer_undertaking_agreed: initial?.customer_undertaking_agreed ?? true,
    customer_signature: initial?.customer_signature ?? "",
  });

  const [inventory, setInventory] = useState(initialInventory);
  const [parts, setParts] = useState<ServicePart[]>(
    initial?.parts.length
      ? initial.parts.map((p) => ({
          ...p,
          labour_cost: p.labour_cost != null ? String(p.labour_cost) : "",
          cost: p.cost != null ? String(p.cost) : "",
        }))
      : [{ ...EMPTY_PART }],
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmRegChange, setConfirmRegChange] = useState(false);
  const [savedRecordId, setSavedRecordId] = useState<number | null>(initial?.id ?? null);
  const serviceRecordId = initial?.id ?? savedRecordId;
  const { push: toast } = useToast();
  const isEdit = !!initial;
  // Linked VT unit — customer/unit fields come from inventory, not re-typed here.
  const linkedFromInventory = !isExternal && Boolean(selectedVehicle || form.vehicle_unit);
  const inheritedInputCls = `${inputCls} bg-[#F0F0ED] cursor-not-allowed opacity-90`;

  // If initialUnitId is provided, prefetch from prefill endpoint
  useEffect(() => {
    if (!initialUnitId || isEdit) return;
    api<PrefillResult[]>(`/api/servicing/prefill/?q=${encodeURIComponent(String(initialUnitId))}`)
      .then((res) => {
        if (Array.isArray(res) && res.length > 0) {
          handleSelectVehicle(res[0]);
        }
      })
      .catch(() => {});
  }, [initialUnitId, isEdit]);

  // Debounced search on smart search box
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || isEdit || selectedVehicle || isExternal) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      api<PrefillResult[]>(`/api/servicing/prefill/?q=${encodeURIComponent(q)}`)
        .then((res) => setSearchResults(Array.isArray(res) ? res : []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery, isEdit, selectedVehicle, isExternal]);

  const handleSelectVehicle = (item: PrefillResult) => {
    setSelectedVehicle(item);
    setIsExternal(false);
    setForm((prev) => ({
      ...prev,
      vehicle_unit: item.unit.id != null ? String(item.unit.id) : "",
      chassis_number: item.unit.vin,
      v_reg_no: item.unit.registration || "",
      vehicle_model_name: item.unit.model || "",
      vehicle_color: item.unit.color || "",
      motor_no: item.unit.motor_no || "",
      battery_kw: item.unit.battery != null ? String(item.unit.battery) : "",
      date_of_sale: item.sale?.date || "",
      dealer: item.sale?.dealer_id != null ? String(item.sale.dealer_id) : prev.dealer,
      dealer_name: item.sale?.dealer || prev.dealer_name,
      customer: item.customer?.id != null ? String(item.customer.id) : "",
      customer_name: item.customer?.name || "",
      customer_mobile: item.customer?.phone || "",
      customer_address: item.customer?.address || "",
      customer_email: item.customer?.email || "",
      odometer_reading: item.unit.odometer_last != null ? String(item.unit.odometer_last) : prev.odometer_reading,
    }));

    // Fetch last 3 services for this vehicle
    setLoadingRecent(true);
    api<{ results: ServiceRecord[] } | ServiceRecord[]>(
      `/api/servicing/records/?chassis_number=${encodeURIComponent(item.unit.vin)}`
    )
      .then((res) => {
        const list = Array.isArray(res) ? res : (res.results ?? []);
        setRecentServices(list.slice(0, 3));
      })
      .catch(() => setRecentServices([]))
      .finally(() => setLoadingRecent(false));
  };

  const handleChangeVehicle = () => {
    setSelectedVehicle(null);
    setRecentServices([]);
    setForm((prev) => ({
      ...prev,
      vehicle_unit: "",
      chassis_number: "",
      v_reg_no: "",
      vehicle_model_name: "",
      vehicle_color: "",
      motor_no: "",
      battery_kw: "",
      date_of_sale: "",
      customer: "",
      customer_name: "",
      customer_mobile: "",
      customer_address: "",
      customer_email: "",
    }));
  };

  const handleAddExternal = () => {
    setIsExternal(true);
    setSelectedVehicle(null);
    setRecentServices([]);
    setForm((prev) => ({
      ...prev,
      vehicle_unit: "",
      chassis_number: searchQuery.trim(),
      customer: "",
      customer_name: "",
      customer_mobile: "",
      customer_address: "",
    }));
  };

  const setPart = (i: number, patch: Partial<ServicePart>) =>
    setParts((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const updateInv = (key: string, patch: Partial<InventoryValue>) => {
    setInventory((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const persistVro = async (forceOverrides?: {
    overrideCustomer?: boolean;
    confirmRegChange?: boolean;
  }): Promise<{ id: number; vro_no?: string } | null> => {
    setError("");
    if (!form.chassis_number.trim()) {
      setError("VIN / Chassis number is required. Search for a vehicle or enter external details.");
      return null;
    }
    setBusy(true);
    const allowOverrideCust = forceOverrides?.overrideCustomer ?? overrideCustomer;
    const allowConfirmReg = forceOverrides?.confirmRegChange ?? confirmRegChange;

    try {
      const payload: Record<string, unknown> = {
        vro_no: form.vro_no.trim() || undefined,
        is_external: isExternal || (!form.vehicle_unit && !selectedVehicle),
        chassis_number: form.chassis_number.trim(),
        vehicle_unit: form.vehicle_unit ? Number(form.vehicle_unit) : null,
        customer: form.customer ? Number(form.customer) : null,
        lead: form.lead ? Number(form.lead) : null,
        dealer: form.dealer ? Number(form.dealer) : null,
        dealer_name: form.dealer_name.trim(),
        technician: form.technician ? Number(form.technician) : null,
        status: form.status,
        date_received: form.date_received,
        time_received: form.time_received.trim(),
        date_completed: form.date_completed || null,
        actual_delivered_at: form.actual_delivered_at ? new Date(form.actual_delivered_at).toISOString() : null,
        v_reg_no: form.v_reg_no.trim(),
        battery_kw: form.battery_kw ? Number(form.battery_kw) : null,
        motor_no: form.motor_no.trim(),
        date_of_sale: form.date_of_sale || null,
        ev_company: form.ev_company.trim(),
        customer_name: form.customer_name.trim(),
        customer_address: form.customer_address.trim(),
        customer_mobile: form.customer_mobile.trim(),
        customer_email: form.customer_email.trim(),
        estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : null,
        labour_cost: parts.reduce((acc, p) => acc + (Number(p.labour_cost) || 0), 0),
        parts_cost: parts.reduce((acc, p) => acc + (Number(p.cost) || 0), 0),
        job_description: form.job_description.trim(),
        action_taken: form.action_taken.trim(),
        service_notes: form.service_notes.trim(),
        odometer_reading: form.odometer_reading === "" ? null : Number(form.odometer_reading),
        entry_inventory: Object.fromEntries(
          Object.entries(inventory).map(([key, value]) => [
            key,
            { present: value.present, remarks: value.remarks },
          ]),
        ),
        service_advisor: form.service_advisor.trim(),
        work_forwarded_to: form.work_forwarded_to.trim(),
        customer_undertaking_agreed: form.customer_undertaking_agreed,
        customer_signature: form.customer_signature.trim(),
        override_customer: allowOverrideCust,
        confirm_registration_change: allowConfirmReg,
        parts: parts
          .filter((p) => p.part_name.trim() || p.labour_cost !== "" || p.cost !== "")
          .map((p) => ({
            part_name: p.part_name.trim() || "—",
            part_number: p.part_number.trim(),
            quantity: Number(p.quantity) || 1,
            labour_cost: p.labour_cost === "" ? null : p.labour_cost,
            cost: p.cost === "" ? null : p.cost,
          })),
      };

      const recordId = initial?.id ?? savedRecordId;
      const saved = recordId
        ? await api<{ id: number; vro_no?: string }>(`/api/servicing/records/${recordId}/`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await api<{ id: number; vro_no?: string }>("/api/servicing/records/", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      for (const item of VRO_INVENTORY_ITEMS) {
        const file = inventory[item.key]?.imageFile;
        if (!file) continue;
        const body = new FormData();
        body.append("item_key", item.key);
        body.append("image", file);
        await api(`/api/servicing/records/${saved.id}/entry-images/`, { method: "POST", body });
      }
      setSavedRecordId(saved.id);
      if (saved.vro_no) {
        setForm((prev) => ({ ...prev, vro_no: saved.vro_no ?? prev.vro_no }));
      }
      return saved;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      if (msg.includes("does not match unit's current owner")) {
        setError(`${msg} Click 'Proceed with different customer' below if this vehicle was transferred.`);
        setOverrideCustomer(true);
      } else if (msg.includes("differs from vehicle unit's registered number")) {
        setError(`${msg} Click 'Confirm Registration Update' below to update the vehicle unit.`);
        setConfirmRegChange(true);
      } else {
        setError(msg);
      }
      return null;
    } finally {
      setBusy(false);
    }
  };

  const submit = async (
    e?: React.FormEvent,
    forceOverrides?: { overrideCustomer?: boolean; confirmRegChange?: boolean }
  ) => {
    if (e?.preventDefault) e.preventDefault();
    const saved = await persistVro(forceOverrides);
    if (!saved) return;
    onSaved();
    onClose();
  };

  const tryOpenPrintPreview = () => {
    setPrintPreview(!printPreview);
  };

  const labourTotal = parts.reduce((acc, p) => acc + (Number(p.labour_cost) || 0), 0);
  const partsTotal = parts.reduce((acc, p) => acc + (Number(p.cost) || 0), 0);
  const totalCost = labourTotal + partsTotal;

  return (
    <Modal
      title={isEdit ? `Vehicle Repair Order: ${initial?.vro_no || initial?.chassis_number}` : "New Vehicle Repair Order (VRO)"}
      onClose={onClose}
      wide
    >
      <div className="flex justify-end items-center mb-4 pb-2 border-b border-[#E8E8E5]">
        <div className="flex items-center gap-2">
          {printPreview && (
            <button
              type="button"
              onClick={async () => {
                await logPrintEvent({
                  documentType: "SERVICING_JOB_SHEET",
                  objectId: form.vro_no || (serviceRecordId != null ? String(serviceRecordId) : undefined),
                  title: `VRO ${form.vro_no || (serviceRecordId != null ? String(serviceRecordId) : "")}`,
                });
                window.print();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#04314A] text-white text-[11px] font-bold hover:bg-[#00AAEB] transition-colors"
            >
              <Printer size={13} /> Print Job Sheet
            </button>
          )}
          <button
            type="button"
            onClick={tryOpenPrintPreview}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#E8E8E5] text-[11px] font-bold text-[#04314A] hover:bg-[#FAFAF8]"
          >
            <Printer size={13} /> {printPreview ? "Edit Form" : "Official Paper Order View"}
          </button>
        </div>
      </div>

      {printPreview ? (
        /* Official Paper View matching Photo 4 */
        <div className="print-document bg-white border border-[#222] p-6 text-[#111] font-sans text-[12px] print:border-none print:p-0">
          <div className="text-center mb-4 border-b border-[#222] pb-3">
            <div className="flex justify-between items-center text-[10px] font-bold tracking-widest text-[#555] mb-1">
              <img src="/favicon.svg" alt="VT" className="h-8 w-auto object-contain" />
              <span>VEHICLE TEMPLATE</span>
              <span>Vehicle Template</span>
            </div>
            <h2 className="text-[16px] font-bold uppercase tracking-wider">
              Vehicle Template
            </h2>
            <h3 className="text-[15px] font-black underline mt-1">Vehicle Repair Order</h3>
            <div className="text-right text-[11px] font-bold mt-1">
              VRO No.: {form.vro_no || "AUTO-GENERATED"}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mb-4 text-[11px]">
            <div><strong>Customer Name:</strong> {form.customer_name || "None"}</div>
            <div><strong>Date:</strong> {form.date_received}</div>
            <div><strong>Time:</strong> {form.time_received || "None"}</div>
            <div><strong>Address:</strong> {form.customer_address || "None"}</div>
            <div><strong>V.Reg. No.:</strong> {form.v_reg_no || "None"}</div>
            <div><strong>Mobile No.:</strong> {form.customer_mobile || "None"}</div>
            <div><strong>Vehicle Run (KM):</strong> {form.odometer_reading || "0"} KM</div>
            <div><strong>Battery (KW):</strong> {form.battery_kw || "None"} KW</div>
            <div><strong>Date of Sale:</strong> {form.date_of_sale || "None"}</div>
            <div><strong>VIN Chassis No.:</strong> {form.chassis_number}</div>
            <div><strong>Motor No.:</strong> {form.motor_no || "None"}</div>
            <div><strong>EV Company:</strong> {form.ev_company}</div>
            <div><strong>Dealer&apos;s Name:</strong> {form.dealer_name || "None"}</div>
            <div><strong>Actual Date/Time Delivered:</strong> {form.actual_delivered_at || "In Progress"}</div>
            <div><strong>Estimated cost of Labour and Parts:</strong> {form.estimated_cost ? `NPR ${form.estimated_cost}` : "None"}</div>
          </div>

          <div className="grid grid-cols-2 border border-[#222] mb-4 text-[11px]">
            <div className="border-r border-[#222]">
              <div className="bg-[#EEE] border-b border-[#222] p-1 font-bold">JOB DESCRIPTION</div>
              <div className="p-2 min-h-[70px] whitespace-pre-wrap">
                {form.job_description || "—"}
              </div>
            </div>
            <div>
              <div className="bg-[#EEE] border-b border-[#222] p-1 font-bold">ACTION</div>
              <div className="p-2 min-h-[70px] whitespace-pre-wrap">{form.action_taken || "—"}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {/* Parts table */}
            <div>
              <h4 className="font-bold text-[11px] uppercase mb-1">Parts & Labour Costs</h4>
              <table className="w-full border-collapse border border-[#222] text-[10px]">
                <thead>
                  <tr className="bg-[#EEE]">
                    <th className="border border-[#222] p-1">S.N.</th>
                    <th className="border border-[#222] p-1">Parts Name</th>
                    <th className="border border-[#222] p-1 text-right">Labour Cost</th>
                    <th className="border border-[#222] p-1 text-right">Parts Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((p, idx) => (
                    <tr key={idx}>
                      <td className="border border-[#222] p-1 text-center">{idx + 1}</td>
                      <td className="border border-[#222] p-1">{p.part_name || "—"}</td>
                      <td className="border border-[#222] p-1 text-right">NPR {p.labour_cost || "0"}</td>
                      <td className="border border-[#222] p-1 text-right">NPR {p.cost || "0"}</td>
                    </tr>
                  ))}
                  <tr className="font-bold bg-[#EEE]">
                    <td colSpan={2} className="border border-[#222] p-1 text-right">Total:</td>
                    <td className="border border-[#222] p-1 text-right">NPR {labourTotal}</td>
                    <td className="border border-[#222] p-1 text-right">NPR {partsTotal}</td>
                  </tr>
                  <tr className="font-bold bg-[#FAF9F5]">
                    <td colSpan={3} className="border border-[#222] p-1 text-right">Grand Total:</td>
                    <td className="border border-[#222] p-1 text-right">NPR {totalCost}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Entry Inventory table */}
            <div>
              <h4 className="font-bold text-[11px] uppercase mb-1">Vehicle Entry Checklist</h4>
              <table className="w-full border-collapse border border-[#222] text-[10px]">
                <thead>
                  <tr className="bg-[#EEE]">
                    <th className="border border-[#222] p-1">Description</th>
                    <th className="border border-[#222] p-1">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {VRO_INVENTORY_ITEMS.map((item) => {
                    const val = inventory[item.key];
                    const photo = val?.imagePreview || val?.imageUrl;
                    return (
                      <tr key={item.key}>
                        <td className="border border-[#222] p-1 font-medium">{item.label}</td>
                        <td className="border border-[#222] p-1">
                          {val?.remarks || "None"}
                          {photo && (
                            <img src={photo} alt="" className="mt-1 h-10 w-14 object-cover border border-[#222]" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t border-[#222] pt-3 text-[10px] space-y-1">
            <div className="flex justify-between">
              <div><strong>SERVICE ADVISOR:</strong> {form.service_advisor || "None"}</div>
              <div><strong>Work forwarded to:</strong> {form.work_forwarded_to || "None"}</div>
            </div>
            <div className="p-2 bg-[#F9F9F7] border border-[#DDD] mt-2">
              <strong>Undertaking by Customer:</strong> I hereby authorize you to undertake repairs and testing of my vehicle and agree to the above conditions. Confirm that a copy of this order is given to me. The above estimates are agreed.
            </div>
            <div className="text-right pt-6">
              <span className="border-t border-[#222] px-8 py-1 font-bold">
                Customer&apos;s Signature{form.customer_signature ? `: ${form.customer_signature}` : ""}
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Form Editor */
        <form onSubmit={submit} className="flex flex-col gap-4">
          {/* Step 4: Smart prefill search box when creating new VRO */}
          {!isEdit && !selectedVehicle && !isExternal && (
            <div className="bg-[#FAFAF8] border border-[#E8E8E5] p-4 rounded-xl space-y-3">
              <div>
                <label className="block text-[11px] font-bold tracking-[0.1em] uppercase text-[#737373] mb-1">
                  Find Vehicle (VIN, Registration, Motor No, or Customer Phone)
                </label>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#737373]" />
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Type VIN, license plate, motor no, or customer phone..."
                    className="w-full border border-[#E8E8E5] rounded-lg pl-9 pr-3 py-2 text-[13px] text-[#04314A] bg-white focus:outline-none focus:border-[#00AAEB]"
                  />
                </div>
                <p className="text-[11px] text-[#737373] mt-1">
                  Searches chassis number (VIN), customer mobile phone, vehicle registration number, or VRO number.
                </p>
              </div>

              {searching && (
                <div className="text-[12px] text-[#737373] py-2 flex items-center gap-2">
                  <Clock size={13} className="animate-spin text-[#00AAEB]" /> Searching inventory and customer records...
                </div>
              )}

              {!searching && searchResults.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {searchResults.map((item) => (
                    <div
                      key={`${item.unit.id || item.unit.vin}-${item.customer?.id || ""}`}
                      className="flex items-center justify-between p-3 bg-white border border-[#E8E8E5] rounded-lg hover:border-[#00AAEB] transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-bold text-[#04314A]">{item.unit.vin}</span>
                          {item.unit.registration && (
                            <span className="px-2 py-0.5 rounded bg-[#FAFAF8] border border-[#E8E8E5] text-[10px] font-bold text-[#04314A]">
                              {item.unit.registration}
                            </span>
                          )}
                          <span className="text-[12px] font-semibold text-[#04314A]">
                            {item.unit.model || "VT EV"} {item.unit.color ? `· ${item.unit.color}` : ""}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#737373]">
                          Customer: <strong className="text-[#04314A]">{item.customer?.name || "Unassigned"}</strong>
                          {item.customer?.phone && ` (${item.customer.phone})`}
                          {item.unit.motor_no && ` · Motor: ${item.unit.motor_no}`}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                          {(() => {
                            const vStatus = item.warranty.vehicle?.status || item.warranty.status;
                            const vEnd = item.warranty.vehicle?.end_date || item.warranty.end_date;
                            return (
                              <span
                                className={`px-2 py-0.5 rounded font-bold ${
                                  vStatus === "active"
                                    ? "bg-[#008000] text-white"
                                    : vStatus === "expired"
                                    ? "bg-[#737373] text-white"
                                    : "bg-[#F0F0ED] text-[#737373]"
                                }`}
                              >
                                Vehicle: {vStatus === "active" ? `Active${vEnd ? ` (to ${vEnd})` : ""}` : vStatus === "expired" ? "Expired" : "Not configured"}
                              </span>
                            );
                          })()}

                          {(() => {
                            const bStatus = item.warranty.battery?.status || "not_configured";
                            const bEnd = item.warranty.battery?.end_date;
                            return (
                              <span
                                className={`px-2 py-0.5 rounded font-bold ${
                                  bStatus === "active"
                                    ? "bg-[#008000] text-white"
                                    : bStatus === "expired"
                                    ? "bg-[#737373] text-white"
                                    : "bg-[#F0F0ED] text-[#737373]"
                                }`}
                              >
                                Battery: {bStatus === "active" ? `Active${bEnd ? ` (to ${bEnd})` : ""}` : bStatus === "expired" ? "Expired" : "Not configured"}
                              </span>
                            );
                          })()}
                          {item.last_service && (
                            <span className="text-[#737373]">
                              Last service: {item.last_service.vro_no} ({item.last_service.date})
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSelectVehicle(item)}
                        className="px-3 py-1.5 rounded-lg bg-[#04314A] text-white text-[11px] font-bold hover:bg-[#00AAEB] transition-colors"
                      >
                        Select Vehicle
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                <div className="p-3 bg-white border border-[#E8E8E5] rounded-lg flex items-center justify-between">
                  <span className="text-[12px] text-[#737373]">
                    Vehicle not found in VT records.
                  </span>
                  <button
                    type="button"
                    onClick={handleAddExternal}
                    className="px-3 py-1.5 rounded-lg border border-[#04314A] text-[#04314A] text-[11px] font-bold hover:bg-[#04314A] hover:text-white transition-colors"
                  >
                    Add as External Vehicle
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Locked Selected Vehicle Card */}
          {selectedVehicle && (
            <div className="bg-white border border-[#E8E8E5] rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 border-b border-[#E8E8E5] pb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-bold text-[#04314A]">
                      {selectedVehicle.unit.model || form.vehicle_model_name || "Vehicle"}
                    </span>
                    {selectedVehicle.unit.color && (
                      <span className="text-[12px] text-[#737373]">
                        · {selectedVehicle.unit.color}
                      </span>
                    )}
                    {form.v_reg_no && (
                      <span className="px-2 py-0.5 rounded bg-[#FAFAF8] border border-[#E8E8E5] text-[11px] font-bold text-[#04314A]">
                        {form.v_reg_no}
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-[#737373] mt-0.5">
                    VIN: {form.chassis_number} · Motor: {form.motor_no || "N/A"} · Battery: {form.battery_kw ? `${form.battery_kw} kW` : "N/A"}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const vStatus = selectedVehicle.warranty.vehicle?.status || selectedVehicle.warranty.status;
                    const vEnd = selectedVehicle.warranty.vehicle?.end_date || selectedVehicle.warranty.end_date;
                    return (
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold ${
                          vStatus === "active"
                            ? "bg-[#008000] text-white"
                            : vStatus === "expired"
                            ? "bg-[#737373] text-white"
                            : "bg-[#FAFAF8] border border-[#E8E8E5] text-[#737373]"
                        }`}
                      >
                        {vStatus === "active" ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
                        Vehicle: {vStatus === "active" ? `Active${vEnd ? ` (to ${vEnd})` : ""}` : vStatus === "expired" ? "Expired" : "Not configured"}
                      </span>
                    );
                  })()}

                  {(() => {
                    const bStatus = selectedVehicle.warranty.battery?.status || "not_configured";
                    const bEnd = selectedVehicle.warranty.battery?.end_date;
                    return (
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold ${
                          bStatus === "active"
                            ? "bg-[#008000] text-white"
                            : bStatus === "expired"
                            ? "bg-[#737373] text-white"
                            : "bg-[#FAFAF8] border border-[#E8E8E5] text-[#737373]"
                        }`}
                      >
                        {bStatus === "active" ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
                        Battery: {bStatus === "active" ? `Active${bEnd ? ` (to ${bEnd})` : ""}` : bStatus === "expired" ? "Expired" : "Not configured"}
                      </span>
                    );
                  })()}

                  <button
                    type="button"
                    onClick={handleChangeVehicle}
                    className="px-2.5 py-1 border border-[#E8E8E5] rounded text-[11px] font-semibold text-[#04314A] hover:bg-[#FAFAF8]"
                  >
                    Change
                  </button>
                </div>
              </div>

              {/* Customer and Sale Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#737373]">Customer</div>
                  <div className="font-semibold text-[#04314A] mt-0.5">{form.customer_name || "None"}</div>
                  <div className="text-[11px] text-[#737373]">{form.customer_address || "No address"}</div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#737373]">Customer Phone</div>
                  <input
                    value={form.customer_mobile}
                    onChange={(e) => setForm({ ...form, customer_mobile: e.target.value })}
                    placeholder="Phone number"
                    className="mt-0.5 w-full border border-[#E8E8E5] rounded px-2 py-1 text-[12px] text-[#04314A] bg-[#FAFAF8] focus:bg-white"
                  />
                  <div className="text-[10px] text-[#737373] mt-0.5">Editing updates customer record</div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#737373]">Customer Email</div>
                  <input
                    value={form.customer_email}
                    onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
                    placeholder="Email address"
                    className="mt-0.5 w-full border border-[#E8E8E5] rounded px-2 py-1 text-[12px] text-[#04314A] bg-[#FAFAF8] focus:bg-white"
                  />
                  <div className="text-[10px] text-[#737373] mt-0.5">Editing updates customer record</div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#737373]">Sale & Dealer</div>
                  <div className="font-semibold text-[#04314A] mt-0.5">{form.dealer_name || "Central Workshop"}</div>
                  <div className="text-[11px] text-[#737373]">{form.date_of_sale ? `Sold: ${form.date_of_sale}` : "No sale date"}</div>
                </div>
              </div>

              {/* Previous 3 Service Records */}
              <div className="pt-2 border-t border-[#E8E8E5]">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1.5 flex items-center justify-between">
                  <span>Recent Service Visits ({recentServices.length})</span>
                  {selectedVehicle.service_count > 0 && (
                    <span className="text-[11px] font-normal text-[#737373]">Total lifetime visits: {selectedVehicle.service_count}</span>
                  )}
                </div>
                {loadingRecent ? (
                  <div className="text-[11px] text-[#737373] py-2">Loading past visits...</div>
                ) : recentServices.length === 0 ? (
                  <div className="text-[11px] text-[#737373] py-1">First service visit for this vehicle.</div>
                ) : (
                  <div className="border border-[#E8E8E5] rounded-lg overflow-hidden">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-[#FAFAF8] border-b border-[#E8E8E5] text-[#737373]">
                        <tr>
                          <th className="px-3 py-1.5 font-semibold">VRO No.</th>
                          <th className="px-3 py-1.5 font-semibold">Date</th>
                          <th className="px-3 py-1.5 font-semibold">Odometer</th>
                          <th className="px-3 py-1.5 font-semibold">Status</th>
                          <th className="px-3 py-1.5 font-semibold text-right">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentServices.map((s) => (
                          <tr key={s.id} className="border-b border-[#F0F0ED] last:border-0">
                            <td className="px-3 py-1.5 font-bold text-[#04314A]">{s.vro_no || `VRO-${s.id}`}</td>
                            <td className="px-3 py-1.5 text-[#737373]">{s.date_received}</td>
                            <td className="px-3 py-1.5 text-[#737373]">{s.odometer_reading != null ? `${s.odometer_reading} km` : "None"}</td>
                            <td className="px-3 py-1.5 capitalize text-[#04314A]">{s.status.replace(/_/g, " ")}</td>
                            <td className="px-3 py-1.5 text-right font-semibold text-[#04314A]">NPR {(s.total_cost || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* External Vehicle Entry */}
          {isExternal && !isEdit && (
            <div className="bg-[#FAFAF8] border border-[#E8E8E5] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-[#E8E8E5] pb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-[#04314A] text-white text-[10px] font-bold uppercase tracking-wider">
                    External Vehicle
                  </span>
                  <span className="text-[12px] font-medium text-[#737373]">
                    Vehicle not sold by VT. Enter vehicle and customer details.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsExternal(false);
                    setSearchQuery("");
                  }}
                  className="text-[11px] font-semibold text-[#00AAEB] hover:underline"
                >
                  Cancel and Search
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
                <Field label="VIN / Chassis Number" required>
                  <input
                    required
                    className={inputCls}
                    value={form.chassis_number}
                    onChange={(e) => setForm({ ...form, chassis_number: e.target.value })}
                    placeholder="e.g. EXT-VIN-12345"
                  />
                </Field>

                <Field label="License Plate (V.Reg. No)">
                  <input
                    className={inputCls}
                    value={form.v_reg_no}
                    onChange={(e) => setForm({ ...form, v_reg_no: e.target.value })}
                    placeholder="e.g. BA 2 KHA 8812"
                  />
                </Field>

                <Field label="Vehicle Model / Make">
                  <input
                    className={inputCls}
                    value={form.vehicle_model_name}
                    onChange={(e) => setForm({ ...form, vehicle_model_name: e.target.value })}
                    placeholder="e.g. Other Brand EV"
                  />
                </Field>

                <Field label="Motor Number">
                  <input
                    className={inputCls}
                    value={form.motor_no}
                    onChange={(e) => setForm({ ...form, motor_no: e.target.value })}
                    placeholder="Motor serial"
                  />
                </Field>

                <Field label="Battery Power (kW)">
                  <input
                    className={inputCls}
                    value={form.battery_kw}
                    onChange={(e) => setForm({ ...form, battery_kw: e.target.value })}
                    placeholder="e.g. 15.0"
                  />
                </Field>

                <Field label="Customer Full Name" required>
                  <input
                    required
                    readOnly={!isExternal && Boolean(form.vehicle_unit || form.customer)}
                    className={`${inputCls} ${!isExternal && Boolean(form.vehicle_unit || form.customer) ? "bg-[#F0F0ED] cursor-not-allowed opacity-90" : ""}`}
                    value={form.customer_name}
                    onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                    placeholder="Full name"
                  />
                  {!isExternal && Boolean(form.vehicle_unit || form.customer) && (
                    <span className="text-[10px] text-[#737373]">Read-only: inherited from linked customer.</span>
                  )}
                </Field>

                <Field label="Customer Phone" required>
                  <input
                    required
                    className={inputCls}
                    value={form.customer_mobile}
                    onChange={(e) => setForm({ ...form, customer_mobile: e.target.value })}
                    placeholder="Phone number"
                  />
                </Field>

                <Field label="Customer Address">
                  <input
                    className={inputCls}
                    value={form.customer_address}
                    onChange={(e) => setForm({ ...form, customer_address: e.target.value })}
                    placeholder="Location / City"
                  />
                </Field>
              </div>
            </div>
          )}

          {/* Paper VRO fields — match physical Vehicle Repair Order */}
          <div className="border border-[#E8E8E5] rounded-lg overflow-hidden text-[12px]">
            <div className="bg-[#FAFAF8] px-3 py-2 border-b border-[#E8E8E5] flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12px] font-bold text-[#04314A]">
                Vehicle Repair Order{form.vro_no ? `: ${form.vro_no}` : ""}
              </span>
              <div className="w-40">
                <SelectField
                  value={form.status}
                  onChange={(v) => setForm({ ...form, status: v })}
                  options={SERVICE_STATUSES.map((s) => ({ ...s }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
              <Field label="Customer's Name">
                <input
                  readOnly={linkedFromInventory}
                  className={linkedFromInventory ? inheritedInputCls : inputCls}
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                  placeholder="Customer name"
                />
              </Field>
              <Field label="Date">
                <input
                  type="date"
                  className={inputCls}
                  value={form.date_received}
                  onChange={(e) => setForm({ ...form, date_received: e.target.value })}
                />
              </Field>
              <Field label="Time">
                <input
                  type="time"
                  className={inputCls}
                  value={toTimeInputValue(form.time_received) || form.time_received}
                  onChange={(e) => setForm({ ...form, time_received: e.target.value })}
                />
              </Field>
              <Field label="Address">
                <input
                  readOnly={linkedFromInventory}
                  className={linkedFromInventory ? inheritedInputCls : inputCls}
                  value={form.customer_address}
                  onChange={(e) => setForm({ ...form, customer_address: e.target.value })}
                  placeholder="Address"
                />
              </Field>
              <Field label="V.Reg. No.">
                <input
                  readOnly={linkedFromInventory}
                  className={linkedFromInventory ? inheritedInputCls : inputCls}
                  value={form.v_reg_no}
                  onChange={(e) => setForm({ ...form, v_reg_no: e.target.value })}
                  placeholder="License plate"
                />
              </Field>
              <Field label="Vehicle Run (KM)">
                <input
                  type="number"
                  className={inputCls}
                  value={form.odometer_reading}
                  onChange={(e) => setForm({ ...form, odometer_reading: e.target.value })}
                  placeholder="Odometer"
                />
              </Field>
              <Field label="Battery (KW)">
                <input
                  readOnly={linkedFromInventory}
                  className={linkedFromInventory ? inheritedInputCls : inputCls}
                  value={form.battery_kw}
                  onChange={(e) => setForm({ ...form, battery_kw: e.target.value })}
                  placeholder="e.g. 15.0"
                />
              </Field>
              <Field label="Date of Sale">
                <input
                  type="date"
                  readOnly={linkedFromInventory}
                  className={linkedFromInventory ? inheritedInputCls : inputCls}
                  value={form.date_of_sale}
                  onChange={(e) => setForm({ ...form, date_of_sale: e.target.value })}
                />
              </Field>
              <Field label="Mobile No.">
                <input
                  readOnly={linkedFromInventory}
                  className={linkedFromInventory ? inheritedInputCls : inputCls}
                  value={form.customer_mobile}
                  onChange={(e) => setForm({ ...form, customer_mobile: e.target.value })}
                  placeholder="Phone"
                />
              </Field>
              <Field label="Motor No.">
                <input
                  readOnly
                  className={inheritedInputCls}
                  value={form.motor_no}
                  placeholder="—"
                />
              </Field>
              <Field label="EV Company">
                <input
                  className={inputCls}
                  value={form.ev_company}
                  onChange={(e) => setForm({ ...form, ev_company: e.target.value })}
                />
              </Field>
              <Field label="VIN Chassis No.">
                <input
                  readOnly
                  required
                  className={inheritedInputCls}
                  value={form.chassis_number}
                  placeholder="—"
                />
              </Field>
              <Field label="Dealer's Name">
                <input
                  readOnly={linkedFromInventory}
                  className={linkedFromInventory ? inheritedInputCls : inputCls}
                  value={form.dealer_name}
                  onChange={(e) => setForm({ ...form, dealer_name: e.target.value })}
                  placeholder="Dealer"
                />
              </Field>
              <Field label="Actual Date/Time Delivered">
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={form.actual_delivered_at}
                  onChange={(e) => setForm({ ...form, actual_delivered_at: e.target.value })}
                />
              </Field>
              <Field label="Estimated cost of Labour and Parts">
                <input
                  className={inputCls}
                  value={form.estimated_cost}
                  onChange={(e) => setForm({ ...form, estimated_cost: e.target.value })}
                  placeholder="NPR"
                  inputMode="decimal"
                />
              </Field>
              <Field label="Date Completed">
                <input
                  type="date"
                  className={inputCls}
                  value={form.date_completed}
                  onChange={(e) => setForm({ ...form, date_completed: e.target.value })}
                />
              </Field>
            </div>
          </div>

          {/* Job description & Action — matches paper table */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Job Description">
              <textarea
                rows={4}
                className={inputCls}
                value={form.job_description}
                onChange={(e) => setForm({ ...form, job_description: e.target.value })}
                placeholder="Customer complaints / work requested..."
              />
            </Field>

            <Field label="Action">
              <textarea
                rows={4}
                className={inputCls}
                value={form.action_taken}
                onChange={(e) => setForm({ ...form, action_taken: e.target.value })}
                placeholder="Work completed by technician..."
              />
            </Field>
          </div>

          {/* DESCRIPTION / REMARKS checklist — matches paper */}
          <div className="border border-[#E8E8E5] rounded-lg overflow-hidden">
            <div className="bg-[#FAFAF8] px-3 py-2 border-b border-[#E8E8E5]">
              <span className="text-[12px] font-bold text-[#04314A]">Description / Remarks</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 text-[11px]">
              {VRO_INVENTORY_ITEMS.map((item) => {
                const val = inventory[item.key] ?? { present: true, remarks: "", imageUrl: "", imagePreview: "", imageFile: null };
                const photo = val.imagePreview || val.imageUrl;
                return (
                  <div key={item.key} className="flex items-center gap-2 p-1 border-b border-[#F0F0ED]">
                    <input
                      type="checkbox"
                      checked={val.present}
                      onChange={(e) => updateInv(item.key, { present: e.target.checked })}
                      className="w-4 h-4 rounded text-[#04314A]"
                    />
                    <span className="w-28 font-semibold text-[#04314A]">{item.label}</span>
                    <input
                      value={val.remarks}
                      onChange={(e) => updateInv(item.key, { remarks: e.target.value })}
                      placeholder="Remarks..."
                      className="flex-1 border border-[#E8E8E5] rounded px-2 py-0.5 text-[10px]"
                    />
                    <label className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#00AAEB] cursor-pointer shrink-0">
                      <Camera size={13} />
                      Photo
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          if (file) {
                            updateInv(item.key, {
                              imageFile: file,
                              imagePreview: URL.createObjectURL(file),
                            });
                          }
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {photo && (
                      <span className="relative shrink-0">
                        <img src={photo} alt="" className="h-8 w-12 object-cover rounded border border-[#E8E8E5]" />
                        {val.imageFile && (
                          <button
                            type="button"
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#8B0000] text-white flex items-center justify-center"
                            onClick={() => updateInv(item.key, { imageFile: null, imagePreview: "" })}
                            title="Remove photo"
                          >
                            <X size={10} />
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Changed Parts table */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#737373]">
                Replaced / Serviced Parts ({parts.length})
              </span>
              <button
                type="button"
                onClick={() => setParts((prev) => [...prev, { ...EMPTY_PART }])}
                className="text-[11px] font-semibold text-[#00AAEB] hover:underline flex items-center gap-1"
              >
                <Plus size={12} /> Add Part
              </button>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[#737373]">
                <span className="w-12 shrink-0">S.N.</span>
                <span className="flex-1">Parts Name</span>
                <span className="w-28 shrink-0">Labour Cost</span>
                <span className="w-28 shrink-0">Parts Cost</span>
                <span className="w-6 shrink-0" />
              </div>
              {parts.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px]">
                  <input
                    className={`${inputCls} !w-12 shrink-0 text-center`}
                    value={String(i + 1)}
                    readOnly
                    aria-label="S.N."
                  />
                  <input
                    className={`${inputCls} !w-auto min-w-0 flex-1`}
                    value={p.part_name}
                    onChange={(e) => setPart(i, { part_name: e.target.value })}
                    placeholder="Parts name"
                  />
                  <input
                    className={`${inputCls} !w-28 shrink-0`}
                    value={p.labour_cost}
                    onChange={(e) => setPart(i, { labour_cost: e.target.value })}
                    placeholder="Labour"
                    inputMode="decimal"
                  />
                  <input
                    className={`${inputCls} !w-28 shrink-0`}
                    value={p.cost}
                    onChange={(e) => setPart(i, { cost: e.target.value })}
                    placeholder="Parts"
                    inputMode="decimal"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setParts((prev) => (prev.length === 1 ? [{ ...EMPTY_PART }] : prev.filter((_, j) => j !== i)))
                    }
                    className="p-1 text-red-600 hover:text-red-800"
                  >
                    <Minus size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Advisors, undertaking, signature — matches paper footer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
            <Field label="Service Advisor">
              <input
                className={inputCls}
                value={form.service_advisor}
                onChange={(e) => setForm({ ...form, service_advisor: e.target.value })}
                placeholder="Advisor name"
              />
            </Field>

            <Field label="Work forwarded to">
              <SelectField
                value={form.technician}
                onChange={(v) => {
                  const t = technicians.find((item) => String(item.id) === v);
                  setForm({
                    ...form,
                    technician: v,
                    work_forwarded_to: t ? [t.first_name, t.last_name].filter(Boolean).join(" ") || t.username : "",
                  });
                }}
                options={[
                  { value: "", label: "Unassigned" },
                  ...technicians.map((u) => ({
                    value: String(u.id),
                    label: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username,
                  })),
                ]}
              />
            </Field>
          </div>

          <div className="border border-[#E8E8E5] rounded-lg p-3 text-[12px] space-y-3">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="undertaking"
                checked={form.customer_undertaking_agreed}
                onChange={(e) => setForm({ ...form, customer_undertaking_agreed: e.target.checked })}
                className="w-4 h-4 rounded text-[#04314A] mt-0.5"
              />
              <label htmlFor="undertaking" className="text-[#737373]">
                <span className="font-bold text-[#04314A]">Undertaking by Customer: </span>
                I hereby authorize you to undertake repairs/testing of my vehicle and agree to the above
                conditions. I confirm that a copy of this order is given to me. The above estimates are agreed.
              </label>
            </div>
            <Field label="Customer's Signature">
              <input
                className={inputCls}
                value={form.customer_signature}
                onChange={(e) => setForm({ ...form, customer_signature: e.target.value })}
                placeholder="Customer signature / name"
              />
            </Field>
          </div>

          {error && (
            <div className="text-[12px] font-medium text-red-600 bg-red-50 p-3 rounded space-y-2">
              <div>{error}</div>
              {confirmRegChange && (
                <button
                  type="button"
                  onClick={() => submit(undefined, { confirmRegChange: true })}
                  className="block text-[11px] font-bold text-white bg-[#04314A] px-3 py-1.5 rounded hover:bg-[#032336]"
                >
                  Confirm Registration Update
                </button>
              )}
              {overrideCustomer && (
                <button
                  type="button"
                  onClick={() => submit(undefined, { overrideCustomer: true })}
                  className="block text-[11px] font-bold text-white bg-[#04314A] px-3 py-1.5 rounded hover:bg-[#032336]"
                >
                  Proceed with different customer
                </button>
              )}
            </div>
          )}

          <div data-modal-actions className="flex justify-end gap-2 pt-3 border-t border-[#E8E8E5]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#E8E8E5] rounded-md text-[12px] font-semibold text-[#737373]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 rounded-md bg-[#04314A] text-white text-[12px] font-semibold hover:bg-[#00AAEB] disabled:opacity-50"
            >
              {busy ? "Saving..." : isEdit ? "Update VRO" : "Create Repair Order"}
            </button>
          </div>
        </form>
      )}

    </Modal>
  );
}

function prefillFromUnitDetail(unit: UnitDetail): PrefillResult {
  const cust = unit.customer_detail;
  const unitAny = unit as UnitDetail & { registration_no?: string };
  return {
    unit: {
      id: unit.id,
      vin: unit.vin_chassis_no,
      model: unit.model_detail
        ? [unit.model_detail.brand, unit.model_detail.model_name].filter(Boolean).join(" ")
        : "",
      model_id: unit.vehicle_model,
      color: unit.color || "",
      motor_no: unit.motor_no || "",
      battery: unit.effective_battery_kw != null ? Number(unit.effective_battery_kw) : null,
      registration: unitAny.registration_no || "",
      odometer_last: unit.odometer_km ?? null,
    },
    customer: cust
      ? {
          id: cust.id,
          code: "",
          name: cust.name || unit.customer_name || "",
          phone: cust.phone || "",
          email: "",
          address: "",
          type: "Individual",
        }
      : unit.customer_name
        ? {
            id: unit.customer,
            code: "",
            name: unit.customer_name,
            phone: "",
            email: "",
            address: "",
            type: "Individual",
          }
        : null,
    sale: unit.sold_date ? { date: unit.sold_date, dealer: "", dealer_id: null } : null,
    warranty: {
      status: (unit.vehicle_warranty_status as PrefillResult["warranty"]["status"]) || "none",
      end_date: unit.warranty_end_date || unit.warranty_end || null,
      start_date: null,
    },
    last_service: null,
    service_count: unit.service_records?.length ?? 0,
  };
}

async function createDraftServicingOrder(prefill: PrefillResult): Promise<ServiceRecord> {
  const now = new Date();
  const payload: Record<string, unknown> = {
    chassis_number: prefill.unit.vin,
    vehicle_unit: prefill.unit.id,
    is_external: !prefill.unit.id,
    customer: prefill.customer?.id ?? null,
    customer_name: prefill.customer?.name ?? "",
    customer_mobile: prefill.customer?.phone ?? "",
    customer_address: prefill.customer?.address ?? "",
    customer_email: prefill.customer?.email ?? "",
    dealer: prefill.sale?.dealer_id ?? null,
    dealer_name: prefill.sale?.dealer ?? "",
    v_reg_no: prefill.unit.registration ?? "",
    motor_no: prefill.unit.motor_no ?? "",
    battery_kw: prefill.unit.battery,
    date_of_sale: prefill.sale?.date ?? null,
    odometer_reading: prefill.unit.odometer_last,
    status: "received",
    date_received: now.toISOString().slice(0, 10),
    time_received: nowTimeInputValue(),
    ev_company: "Vehicle Template",
    customer_undertaking_agreed: true,
    parts: [],
  };
  return api<ServiceRecord>("/api/servicing/records/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export default function ServicingManager({
  page,
  onNavigate,
}: {
  page?: string;
  onNavigate?: (path: string) => void;
} = {}) {
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [technicians, setTechnicians] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dealer, setDealer] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editing, setEditing] = useState<ServiceRecord | null>(null);
  const [intakeUnit, setIntakeUnit] = useState<UnitDetail | null>(null);
  const [showReceiveIntake, setShowReceiveIntake] = useState(false);
  const [viewingVrc, setViewingVrc] = useState<{
    unit: UnitDetail | null;
    checklist: VehicleReceiveCheckList;
    recordId: number;
  } | null>(null);
  const [handledNewKey, setHandledNewKey] = useState("");
  const { push: toast, node: toastNode } = useToast();

  const queryString = useMemo(() => {
    if (page?.includes("?")) return page.slice(page.indexOf("?") + 1);
    if (typeof window !== "undefined") return window.location.search.replace(/^\?/, "");
    return "";
  }, [page]);

  const clearNewQuery = () => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("new")) return;
    params.delete("new");
    // Keep unit= so New Servicing Order / Book Service can reopen the receive form.
    const qs = params.toString();
    const next = qs ? `servicing?${qs}` : "servicing";
    if (onNavigate) onNavigate(next);
    else window.history.replaceState({}, "", `/dashboard/${next}`);
  };

  useEffect(() => {
    fetchDealers().then(setDealers).catch(() => {});
    api<StaffUser[] | { results: StaffUser[] }>("/api/users/")
      .then((d) => {
        const rows = Array.isArray(d) ? d : d.results ?? [];
        setTechnicians(rows.filter((user) => (user.role_names ?? []).includes("Technician")));
      })
      .catch(() => {});
  }, []);

  const openReceiveIntake = () => {
    setIntakeUnit(null);
    setShowReceiveIntake(true);
    clearNewQuery();
  };

  // React to ?new=1&unit=<id> even when ServicingManager is already mounted (SPA navigate).
  useEffect(() => {
    const params = new URLSearchParams(queryString);
    const s = params.get("status");
    if (s) setStatus(s);
    const q = params.get("search");
    if (q) setSearchInput(q);

    const vro = params.get("vro");
    if (vro) {
      api<ServiceRecord[] | { results: ServiceRecord[] }>(`/api/servicing/records/?search=${encodeURIComponent(vro)}`)
        .then((res) => {
          const list = Array.isArray(res) ? res : (res.results ?? []);
          const match = list.find((r) => r.vro_no === vro || String(r.id) === vro || r.chassis_number === vro);
          if (match) setEditing(match);
        })
        .catch(() => {});
    }

    if (params.get("new") !== "1") {
      if (handledNewKey) setHandledNewKey("");
      return;
    }
    const key = `new:${params.get("unit") || ""}`;
    if (handledNewKey === key) return;
    setHandledNewKey(key);
    // Always open with empty VIN — user picks via searchable UnitPicker.
    openReceiveIntake();
  }, [queryString]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (dealer) params.set("dealer", dealer);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const qs = params.toString();
    api<ServiceRecord[] | { results: ServiceRecord[] }>(`/api/servicing/records/${qs ? `?${qs}` : ""}`)
      .then((data) => setRecords(Array.isArray(data) ? data : (data.results ?? [])))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load service records"))
      .finally(() => setLoading(false));
  };

  useEffect(load, [search, status, dealer, dateFrom, dateTo]);

  const quickStatus = async (r: ServiceRecord, next: string) => {
    try {
      await api(`/api/servicing/records/${r.id}/`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      toast(`${r.vro_no || r.chassis_number} → ${next.replace(/_/g, " ")}`);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Status update failed");
    }
  };

  const remove = async (r: ServiceRecord) => {
    if (!window.confirm(`Delete repair order "${r.vro_no || r.chassis_number}"?`)) return;
    try {
      await api(`/api/servicing/records/${r.id}/`, { method: "DELETE" });
      toast("Repair order deleted");
      load();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Delete failed";
      setError(msg);
      toast(msg);
    }
  };

  const openVrc = async (r: ServiceRecord) => {
    try {
      let checklist: VehicleReceiveCheckList | null = null;
      if (r.receive_checklist_id) {
        checklist = await fetchReceiveChecklist(r.receive_checklist_id);
      } else {
        const list = await fetchReceiveChecklists({ service_record: r.id });
        checklist = list[0] ?? null;
      }
      if (!checklist) {
        toast("No receive checklist found for this order");
        return;
      }
      let unit: UnitDetail | null = null;
      const unitId = r.vehicle_unit || checklist.vehicle;
      if (unitId) {
        try {
          unit = await fetchUnit(unitId);
        } catch {
          /* modal can still show checklist snapshot */
        }
      }
      setViewingVrc({ unit, checklist, recordId: r.id });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to load receive checklist");
    }
  };

  const activeCount = records.filter((r) => r.status === "received" || r.status === "in_progress").length;
  const waitingPartsCount = records.filter((r) => r.status === "waiting_for_parts").length;
  const completedCount = records.filter((r) => r.status === "completed" || r.status === "delivered").length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-[#04314A]">Servicing Orders.</h1>
          <p className="text-[13px] text-[#737373]">
            Receive the vehicle, then complete the repair order — tracked by VIN / chassis number.
          </p>
        </div>

        <button
          onClick={() => openReceiveIntake()}
          className="self-start sm:self-auto flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#04314A] text-white text-[12px] font-semibold hover:bg-[#00AAEB] transition-colors"
        >
          <Plus size={14} /> New Servicing Order
        </button>
      </div>

      {/* Summary counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-white border border-[#E8E8E5] rounded-lg p-3">
          <div className="text-[11px] text-[#737373]">Total Servicing Orders</div>
          <div className="text-[20px] font-bold text-[#04314A] mt-0.5">{records.length}</div>
        </div>
        <div className="bg-white border border-[#E8E8E5] rounded-lg p-3">
          <div className="text-[11px] text-[#737373]">In Workshop</div>
          <div className="text-[20px] font-bold text-[#04314A] mt-0.5">{activeCount}</div>
        </div>
        <div className="bg-white border border-[#E8E8E5] rounded-lg p-3">
          <div className="text-[11px] text-[#737373]">Waiting for Parts</div>
          <div className="text-[20px] font-bold text-[#04314A] mt-0.5">{waitingPartsCount}</div>
        </div>
        <div className="bg-white border border-[#E8E8E5] rounded-lg p-3">
          <div className="text-[11px] text-[#737373]">Completed / Delivered</div>
          <div className="text-[20px] font-bold text-[#04314A] mt-0.5">{completedCount}</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-[#E8E8E5] rounded-lg p-3 mb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#737373]" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search VRO no, VIN, customer, license plate..."
              className="w-full border border-[#E8E8E5] rounded-md pl-9 pr-3 py-1.5 text-[12px] text-[#04314A] placeholder:text-[#B0B0AA] focus:outline-none focus:border-[#00AAEB]"
            />
          </div>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border border-[#E8E8E5] rounded-md px-3 py-1.5 text-[12px] text-[#04314A] focus:outline-none focus:border-[#00AAEB]"
        >
          <option value="">All Statuses</option>
          {SERVICE_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          value={dealer}
          onChange={(e) => setDealer(e.target.value)}
          className="border border-[#E8E8E5] rounded-md px-3 py-1.5 text-[12px] text-[#04314A] focus:outline-none focus:border-[#00AAEB]"
        >
          <option value="">All Workshops / Dealers</option>
          {dealers.map((d) => (
            <option key={d.id} value={String(d.id)}>{d.name}</option>
          ))}
        </select>

        {(search || status || dealer || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setSearchInput("");
              setSearch("");
              setStatus("");
              setDealer("");
              setDateFrom("");
              setDateTo("");
            }}
            className="text-[12px] text-[#00AAEB] hover:underline"
          >
            Reset
          </button>
        )}
        </div>
        <p className="text-[11px] text-[#737373]">
          Searches chassis number (VIN), customer mobile phone, vehicle registration number, or VRO number.
        </p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-[12px]">
          {error}
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white border border-[#E8E8E5] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8] text-[11px] font-semibold text-[#737373]">
                <th className="px-4 py-3">VRO No. / VIN</th>
                <th className="px-4 py-3">Vehicle Model</th>
                <th className="px-4 py-3">Customer / Lead</th>
                <th className="px-4 py-3">Time In / Out</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Cost (NPR)</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[#737373]">
                    Loading servicing orders...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-[#737373]">
                    No servicing orders found. Click &quot;New Servicing Order&quot; to start with a receive checklist.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="border-b border-[#F0F0ED] hover:bg-[#FAFAF8]">
                    <td className="px-4 py-3 font-medium text-[#04314A]">
                      <EntityLink
                        type="vro"
                        id={r.vro_no || `VRO-${r.id}`}
                        label={r.vro_no || `VRO-${r.id}`}
                        onClick={(e) => {
                          e?.preventDefault();
                          setEditing(r);
                        }}
                      />
                      <div className="text-[11px] text-[#737373] mt-0.5">
                        <EntityLink
                          type="unit"
                          id={r.vehicle_unit || r.chassis_number}
                          label={r.chassis_number}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#04314A]">
                      <div>{r.vehicle_model_name || r.vehicle_name || "VT EV"}</div>
                      {r.v_reg_no && (
                        <div className="text-[11px] text-[#737373]">Reg: {r.v_reg_no}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#04314A]">
                      {r.customer_name ? (
                        <EntityLink
                          type="customer"
                          id={r.customer || r.customer_name}
                          label={r.customer_name}
                          sublabel={r.customer_mobile}
                        />
                      ) : (
                        <span className="text-[#737373]">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-[#737373]">
                      <div>In: {r.date_received} {r.time_received ? `(${r.time_received})` : ""}</div>
                      {r.actual_delivered_at ? (
                        <div className="text-[#00AAEB] font-medium">Out: {new Date(r.actual_delivered_at).toLocaleDateString()}</div>
                      ) : r.date_completed ? (
                        <div>Done: {r.date_completed}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-[#04314A]">
                      <span className="inline-flex items-center gap-1 font-semibold text-[11px] text-[#04314A]">
                        <Clock size={11} className="text-[#00AAEB]" />
                        {r.duration_display || "None"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={r.status}
                        onChange={(e) => quickStatus(r, e.target.value)}
                        className="border border-[#E8E8E5] rounded px-2 py-1 text-[11px] font-semibold text-[#04314A] bg-white cursor-pointer"
                      >
                        {SERVICE_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 font-semibold text-[#04314A]">
                      NPR {(r.total_cost || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        {r.has_receive_checklist && (
                          <button
                            onClick={() => void openVrc(r)}
                            className="px-2.5 py-1 border border-[#E8E8E5] rounded text-[11px] font-semibold text-[#04314A] hover:bg-gray-100"
                          >
                            View VRC
                          </button>
                        )}
                        <button
                          onClick={() => setEditing(r)}
                          className="px-2.5 py-1 border border-[#E8E8E5] rounded text-[11px] font-semibold text-[#04314A] hover:bg-gray-100"
                        >
                          {r.vro_filled ? "View VRO" : "Create VRO"}
                        </button>
                        <button
                          onClick={() => remove(r)}
                          className="p-1 rounded text-[#737373] hover:text-red-700"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showReceiveIntake && (
        <VehicleReceiveModal
          unit={intakeUnit}
          purpose="servicing"
          allowUnitChange
          onUnitChange={setIntakeUnit}
          onPrepareServiceRecord={async (selected) => {
            let prefill = prefillFromUnitDetail(selected);
            try {
              const prefills = await api<PrefillResult[]>(
                `/api/servicing/prefill/?q=${encodeURIComponent(selected.vin_chassis_no)}`,
              );
              const list = Array.isArray(prefills) ? prefills : [];
              const match =
                list.find((p) => Number(p.unit.id) === Number(selected.id)) ??
                list.find(
                  (p) => (p.unit.vin || "").toLowerCase() === selected.vin_chassis_no.toLowerCase(),
                );
              if (match) prefill = match;
            } catch {
              /* use unit-derived prefill */
            }
            const created = await createDraftServicingOrder(prefill);
            toast(`Servicing order ${created.vro_no || created.chassis_number} created`);
            return created.id;
          }}
          onClose={() => {
            setShowReceiveIntake(false);
            setIntakeUnit(null);
          }}
          onSaved={() => {
            setShowReceiveIntake(false);
            setIntakeUnit(null);
            load();
          }}
        />
      )}

      {viewingVrc && (
        <VehicleReceiveModal
          unit={viewingVrc.unit}
          purpose="servicing"
          serviceRecordId={viewingVrc.recordId}
          initialChecklist={viewingVrc.checklist}
          allowUnitChange={false}
          onClose={() => setViewingVrc(null)}
          onSaved={() => {
            setViewingVrc(null);
            load();
          }}
        />
      )}

      {editing && (
        <RecordForm
          initial={editing}
          dealers={dealers}
          technicians={technicians}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}

      {toastNode}
    </div>
  );
}
