import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  crm,
  type TestDriveStatus,
  type Quotation,
  type QuotationStatus,
  formatNpr,
} from "./data";
import { Field, Modal, SelectField, inputCls, primaryBtnCls } from "./ui";
import { useCrmMeta, useUserOptions, useVehicleOptions, resolveSelection } from "./useOptions";
import {
  BankBranchPicker,
  BankPicker,
  CustomerPicker,
  VehicleModelPicker,
  findBankByName,
  findBranchByName,
  type VehicleModelOption,
  UnitPicker,
  type UnitOption,
} from "../components/pickers";
import { fetchVariants, fetchModelSpecs, type VehicleVariant } from "@/lib/inventory";

export function AddActivityModal({
  onClose,
  onSaved,
  leadId,
  customerId,
  defaultType = "call",
  defaultSubject = "",
}: {
  onClose: () => void;
  onSaved: (msg: string) => void;
  leadId?: string;
  customerId?: string;
  defaultType?: string;
  defaultSubject?: string;
}) {
  const [type, setType] = useState<string>(defaultType);
  const [subject, setSubject] = useState(defaultSubject);
  const [description, setDescription] = useState("");
  const [datetime, setDatetime] = useState(new Date().toISOString().slice(0, 16));
  const [user, setUser] = useState(() => {
    try { return localStorage.getItem("vt_username") || ""; } catch { return ""; }
  });
  const userOptions = useUserOptions();
  const meta = useCrmMeta();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // User options come from the API; sync the selected user once loaded.
  useEffect(() => {
    setUser((cur) => {
      const stored = (() => { try { return localStorage.getItem("vt_username"); } catch { return null; } })();
      return resolveSelection(cur, userOptions, stored);
    });
  }, [userOptions]);

  const submit = async () => {
    if (!subject.trim()) return setError("Subject is required.");
    setSaving(true);
    try {
      await crm.addActivity({ type, subject, description, datetime, user, leadId, customerId });
      onSaved("Activity logged.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  };

  return (
    <Modal title="Add Activity" onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Activity Type" required>
          <SelectField
            value={type}
            onChange={setType}
            options={meta.activityTypes.map((t) => ({ value: t, label: meta.activityLabels[t] ?? t }))}
          />
        </Field>
        <Field label="Date / Time" required>
          <input type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} className={inputCls} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Subject" required error={error && !subject.trim() ? error : undefined}>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Called customer regarding Cargo 10T" className={inputCls} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputCls} />
          </Field>
        </div>
        <Field label="User">
          <SelectField value={user} onChange={setUser} options={userOptions.map((s) => ({ value: s, label: s }))} />
        </Field>
      </div>
      {error && subject.trim() && <p className="mt-4 text-[12px] text-[#00AAEB]">{error}</p>}
      <div data-modal-actions className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#737373] hover:text-[#04314A] transition-colors">
          Cancel
        </button>
        <button onClick={submit} disabled={saving} className={primaryBtnCls}>
          {saving ? "Saving…" : "Log Activity"}
        </button>
      </div>
    </Modal>
  );
}

export function ScheduleTestDriveModal({
  onClose,
  onSaved,
  customers,
  presetCustomerId,
  leadId,
  leadName,
  onCompleted,
}: {
  onClose: () => void;
  onSaved: (msg: string) => void;
  customers: { id: string; name: string }[];
  presetCustomerId?: string;
  leadId?: string | null;
  leadName?: string;
  /** Called when the test drive is marked completed, so parent can prompt to create a quotation. */
  onCompleted?: (leadId: string | null, vehicle: string) => void;
}) {
  const vehicles = useVehicleOptions();
  const salespeople = useUserOptions();
  const meta = useCrmMeta();
  const [customerId, setCustomerId] = useState(presetCustomerId ?? (leadId ? "" : (customers[0]?.id ?? "")));
  const [vehicle, setVehicle] = useState("");
  const [unitId, setUnitId] = useState<string>("");
  const [date, setDate] = useState(new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10));
  const [time, setTime] = useState("11:00");
  const [location, setLocation] = useState("VT Showroom, Thapathali");
  const [salesperson, setSalesperson] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<TestDriveStatus>("scheduled");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Vehicle and salesperson options come from the API; sync defaults once loaded.
  useEffect(() => {
    setVehicle((cur) => resolveSelection(cur, vehicles));
  }, [vehicles]);
  useEffect(() => {
    setSalesperson((cur) => {
      const stored = (() => { try { return localStorage.getItem("vt_username"); } catch { return null; } })();
      return resolveSelection(cur, salespeople, stored);
    });
  }, [salespeople]);

  const submit = async () => {
    if (!customerId && !leadId) return setError("Please select a customer or link to a lead.");
    if (!vehicle) return setError("Vehicle is required.");
    if (!date || !time) return setError("Date and time are required.");
    setSaving(true);
    try {
      const selectedCustomer = customers.find((c) => c.id === customerId);
      await crm.scheduleTestDrive({
        customerId: customerId || null,
        customerName: selectedCustomer?.name || leadName || (leadId ? `Lead #${leadId}` : ""),
        vehicle, date, time, salesperson, location, notes, status,
        unitId: unitId ? String(unitId) : null,
        leadId: leadId ?? undefined,
      });
      onSaved("Test drive scheduled.");
      if (status === "completed" && onCompleted) {
        onCompleted(leadId ?? null, vehicle);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to schedule");
      setSaving(false);
    }
  };

  return (
    <Modal title="Schedule Test Drive" onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {leadId ? (
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-[#737373] mb-1">
              Connected Lead
            </label>
            <div className="px-3.5 py-2.5 bg-[#FAFAF8] border border-[#E8E8E5] rounded-xl text-[13px] font-semibold text-[#04314A]">
              {leadName || `Lead #${leadId}`} (Unconverted Lead)
            </div>
          </div>
        ) : (
          <CustomerPicker
            value={customerId ? Number(customerId) : null}
            onChange={(id) => setCustomerId(id ? String(id) : "")}
            required
          />
        )}
        <Field label="Vehicle" required>
          <SelectField value={vehicle} onChange={setVehicle} options={vehicles.map((v) => ({ value: v, label: v }))} />
        </Field>
        <UnitPicker
          value={unitId ? Number(unitId) : null}
          onChange={(id) => setUnitId(id ? String(id) : "")}
          statusFilter="READY_FOR_SALE"
          label="Demo Unit (Optional)"
          placeholder="No specific unit"
          allowClear
        />
        <Field label="Preferred Date" required>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Preferred Time" required>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Location" required>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Salesperson">
          <SelectField value={salesperson} onChange={setSalesperson} options={salespeople.map((s) => ({ value: s, label: s }))} />
        </Field>
        <Field label="Status">
          <SelectField value={status} onChange={(v) => setStatus(v as TestDriveStatus)} options={meta.testDriveStatuses.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
          </Field>
        </div>
      </div>
      {error && <p className="mt-4 text-[12px] text-[#00AAEB]">{error}</p>}
      <div data-modal-actions className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#737373] hover:text-[#04314A] transition-colors">
          Cancel
        </button>
        <button onClick={submit} disabled={saving} className={primaryBtnCls}>
          {saving ? "Scheduling..." : "Schedule Test Drive"}
        </button>
      </div>
    </Modal>
  );
}


export function QuotationModal({
  onClose,
  onSaved,
  customers,
  presetCustomerId,
  quotationId,
  leadId,
  leadName,
}: {
  onClose: () => void;
  onSaved: (msg: string, quote?: Quotation) => void;
  customers: { id: string; name: string; company: string }[];
  presetCustomerId?: string;
  quotationId?: string;
  leadId?: string | null;
  leadName?: string;
}) {
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string; company?: string; pan?: string; phone?: string; address?: string } | null>(null);
  const [customerId, setCustomerId] = useState(presetCustomerId ?? "");
  const [panNumber, setPanNumber] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [vehicleModelId, setVehicleModelId] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<VehicleModelOption | null>(null);
  const [variantId, setVariantId] = useState<string>("");
  const [variants, setVariants] = useState<VehicleVariant[]>([]);
  const [variantsReady, setVariantsReady] = useState(true);
  const [variantsError, setVariantsError] = useState("");
  const [modelHasVariants, setModelHasVariants] = useState(false);
  const [batteryCapacity, setBatteryCapacity] = useState("");
  const [batterySelect, setBatterySelect] = useState("");
  const [vehicleLength, setVehicleLength] = useState("");
  const [bankId, setBankId] = useState<number | null>(null);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [bankName, setBankName] = useState("");
  const [bankAddress, setBankAddress] = useState("");
  const bankTouched = useRef(false);
  const branchTouched = useRef(false);
  const [lengthSelect, setLengthSelect] = useState("");
  const [vehicleDescription, setVehicleDescription] = useState("6 Ton Payload with 2 Doors");
  const [transmission, setTransmission] = useState("Automatic");
  const [rangeKm, setRangeKm] = useState("");
  const [extraSpecs, setExtraSpecs] = useState<{ label: string; value: string }[]>([]);
  const [staff, setStaff] = useState<{ username: string; first_name: string; last_name: string }[]>([]);
  const [version, setVersion] = useState("Commercial Electric Truck");
  const [chargerInfo, setChargerInfo] = useState("Support GB/T DC Fast Charger");
  const [paymentTerms, setPaymentTerms] = useState("40% Down Payment & 60% Bank DO before Dispatch.");
  const [deliveryTerms, setDeliveryTerms] = useState("As per Client Requirement.");
  const [warrantyTerms, setWarrantyTerms] = useState("Company Authorized Warranty Terms.");
  const [insuranceTerms, setInsuranceTerms] = useState("1 Year Insurance Included in Offered Price.");
  const [registrationTerms, setRegistrationTerms] = useState("1 Year Registration Included in Offered Price.");
  const [salesperson, setSalesperson] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [vehiclePrice, setVehiclePrice] = useState("");
  const [discount, setDiscount] = useState("");
  const [otherCharges, setOtherCharges] = useState(0);
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [existingStatus, setExistingStatus] = useState<QuotationStatus>("draft");
  const [existingCreatedAt, setExistingCreatedAt] = useState<string>("");
  const [validUntil, setValidUntil] = useState<string>("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAdvancedSpecs, setShowAdvancedSpecs] = useState(false);

  // Model-aware helpers
  const [batteryChoices, setBatteryChoices] = useState<string[]>([]);
  const [lengthChoices, setLengthChoices] = useState<string[]>([]);
  const modelSelected = Boolean(vehicleModelId);

  const batteryOptions = useMemo(() => {
    if (!modelSelected) return [{ value: "", label: "Select a vehicle model first" }];
    const values = [...batteryChoices];
    if (batteryCapacity && !values.includes(batteryCapacity)) values.unshift(batteryCapacity);
    if (values.length === 0) return [{ value: "", label: "No battery capacities for this model" }];
    return [{ value: "", label: "Select battery capacity" }, ...values.map((value) => ({ value, label: value }))];
  }, [modelSelected, batteryChoices, batteryCapacity]);

  const lengthOptions = useMemo(() => {
    if (!modelSelected) return [{ value: "", label: "Select a vehicle model first" }];
    const values = [...lengthChoices];
    if (vehicleLength && !values.includes(vehicleLength)) values.unshift(vehicleLength);
    if (values.length === 0) return [{ value: "", label: "No cargo lengths for this model" }];
    return [{ value: "", label: "Select cargo length" }, ...values.map((value) => ({ value, label: value }))];
  }, [modelSelected, lengthChoices, vehicleLength]);

  useEffect(() => {
    if (!vehicleModelId) {
      setBatteryChoices([]);
      setLengthChoices([]);
      return;
    }
    let active = true;
    fetchModelSpecs({ vehicle_model: vehicleModelId, is_active: "true" })
      .then((rows) => {
        if (!active) return;
        setBatteryChoices(rows.filter((row) => row.kind === "battery").map((row) => row.label));
        setLengthChoices(rows.filter((row) => row.kind === "cargo_length").map((row) => row.label));
      })
      .catch(() => {
        if (!active) return;
        setBatteryChoices([]);
        setLengthChoices([]);
      });
    return () => {
      active = false;
    };
  }, [vehicleModelId]);

  // Variants belong to the selected model. Do not load them before a model is chosen.
  useEffect(() => {
    if (!vehicleModelId) {
      setVariants([]);
      setVariantId("");
      setVariantsReady(true);
      setVariantsError("");
      setModelHasVariants(false);
      return;
    }
    let active = true;
    setVariants([]);
    setVariantsReady(false);
    setVariantsError("");
    fetchVariants({ vehicle_model: vehicleModelId, is_active: "true" })
      .then((vars) => {
        if (!active) return;
        const list = Array.isArray(vars) ? vars : [];
        setVariants(list);
        setModelHasVariants((current) => current || list.length > 0);
        setVariantId((current) =>
          list.some((v) => String(v.id) === String(current)) ? current : "",
        );
        setVariantsReady(true);
      })
      .catch((e) => {
        if (!active) return;
        setVariants([]);
        setVariantsReady(true);
        setVariantsError(e instanceof Error ? e.message : "Could not load vehicle variants.");
      });
    return () => {
      active = false;
    };
  }, [vehicleModelId]);

  // Track the saved reference so edit mode does not replace it with a new sequence.
  const savedReferenceNo = useRef("");

  // Auto-build Quotation / Reference No. from model + variant + battery + cargo length.
  useEffect(() => {
    if (!vehicleModelId || !variantId || !batteryCapacity || !vehicleLength) {
      if (!quotationId) setReferenceNo("");
      return;
    }
    let active = true;
    const params = new URLSearchParams({
      vehicle_model: vehicleModelId,
      variant: variantId,
      battery_capacity: batteryCapacity,
      vehicle_length: vehicleLength,
    });
    if (quotationId) params.set("exclude", quotationId);
    api<{ reference_no?: string; stem?: string }>(`/api/crm/quotations/next-reference/?${params.toString()}`)
      .then((res) => {
        if (!active || !res.reference_no) return;
        const stem = (res.stem || res.reference_no.replace(/-\d+$/, "")).trim();
        const saved = (savedReferenceNo.current || "").trim();
        // Editing: keep the saved number when it already matches the current stem.
        if (quotationId && saved && stem && new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d+$`, "i").test(saved)) {
          setReferenceNo(saved);
          return;
        }
        setReferenceNo(res.reference_no);
        if (quotationId) savedReferenceNo.current = res.reference_no;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [vehicleModelId, variantId, batteryCapacity, vehicleLength, quotationId]);

  const applyCustomerDetails = (c: {
    id: string | number;
    name: string;
    company?: string;
    pan_vat_number?: string;
    phone?: string;
    address?: string;
    location?: string;
  } | null) => {
    if (!c) {
      setSelectedCustomer(null);
      setPanNumber("");
      setCustomerPhone("");
      setCustomerAddress("");
      return;
    }
    const address = c.address || c.location || "";
    setSelectedCustomer({
      id: String(c.id),
      name: c.name,
      company: c.company || "",
      pan: c.pan_vat_number || "",
      phone: c.phone || "",
      address,
    });
    setPanNumber(c.pan_vat_number || "");
    setCustomerPhone(c.phone || "");
    setCustomerAddress(address);
  };

  // Prefill phone/address/PAN from customer when opened with a preset id
  useEffect(() => {
    if (!presetCustomerId || quotationId) return;
    let active = true;
    api<any>(`/api/crm/customers/${presetCustomerId}/`)
      .then((c) => {
        if (active && c) applyCustomerDetails(c);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [presetCustomerId, quotationId]);

  // Lead prefill (no customer yet — pull contact details from the lead)
  useEffect(() => {
    if (leadId) {
      api<any>(`/api/crm/leads/${leadId}/`)
        .then((l) => {
          if (!l) return;
          if (l.phone) setCustomerPhone(l.phone);
          if (l.address) setCustomerAddress(l.address);
          if (l.company && !selectedCustomer) setSelectedCustomer({ id: "", name: leadName || l.name, company: l.company });
          if (l.vehicle_model && !vehicleModelId) setVehicleModelId(String(l.vehicle_model));
          if (l.variant && !variantId) setVariantId(String(l.variant));
        })
        .catch(() => {});
    }
  }, [leadId]);

  // Prefill existing quotation
  useEffect(() => {
    if (!quotationId) return;
    crm.quotation(quotationId).then((q) => {
      if (!q) return;
      if (q.customerId) setCustomerId(q.customerId);
      if (q.customerName) setSelectedCustomer({ id: q.customerId, name: q.customerName, company: q.company, pan: q.panNumber, phone: q.customerPhone, address: q.customerAddress });
      if (q.panNumber) setPanNumber(q.panNumber);
      if (q.customerPhone) setCustomerPhone(q.customerPhone);
      if (q.customerAddress) setCustomerAddress(q.customerAddress);
      if (q.vehicleModelId) setVehicleModelId(String(q.vehicleModelId));
      if (q.vehicleModelDetail) {
        setSelectedModel({
          id: q.vehicleModelDetail.id,
          brand: q.vehicleModelDetail.brand,
          model_name: q.vehicleModelDetail.model_name,
        });
      }
      if (q.variantId) setVariantId(String(q.variantId));
      if (q.batteryCapacity) {
        setBatteryCapacity(q.batteryCapacity);
        setBatterySelect(batteryOptions.some((b) => b.value === q.batteryCapacity) ? q.batteryCapacity : "");
      }
      if (q.vehicleLength) {
        setVehicleLength(q.vehicleLength);
        setLengthSelect(lengthOptions.some((l) => l.value === q.vehicleLength) ? q.vehicleLength : "");
      }
      if (q.bankName) {
        setBankName(q.bankName);
        findBankByName(q.bankName).then(async (bank) => {
          if (!bank || bankTouched.current) return;
          setBankId(bank.id);
          setBankName(bank.name);
          if (!q.bankAddress || branchTouched.current) return;
          const branch = await findBranchByName(bank.id, q.bankAddress);
          if (!branch || branchTouched.current) return;
          setBranchId(branch.id);
          setBankAddress(branch.name);
        }).catch(() => {});
      }
      if (q.bankAddress) setBankAddress(q.bankAddress);
      if (q.vehicleDescription) setVehicleDescription(q.vehicleDescription);
      if (q.transmission) setTransmission(q.transmission);
      if (q.vehicleModelDetail?.range_km || q.rangeKm) setRangeKm(q.vehicleModelDetail?.range_km || q.rangeKm || "");
      if (q.extraSpecs) setExtraSpecs(q.extraSpecs);
      if (q.version) setVersion(q.version);
      if (q.chargerInfo) setChargerInfo(q.chargerInfo);
      if (q.paymentTerms) setPaymentTerms(q.paymentTerms);
      if (q.deliveryTerms) setDeliveryTerms(q.deliveryTerms);
      if (q.warrantyTerms) setWarrantyTerms(q.warrantyTerms);
      if (q.insuranceTerms) setInsuranceTerms(q.insuranceTerms);
      if (q.registrationTerms) setRegistrationTerms(q.registrationTerms);
      if (q.salesperson) setSalesperson(q.salesperson);
      setQuantity(q.quantity != null ? String(q.quantity) : "1");
      setVehiclePrice(q.item.vehiclePrice != null ? String(q.item.vehiclePrice) : "");
      setDiscount(q.item.discount != null ? String(q.item.discount) : "");
      setOtherCharges(q.item.otherCharges || 0);
      savedReferenceNo.current = q.referenceNo || "";
      setReferenceNo(q.referenceNo || "");
      setNotes(q.notes || "");
      if (q.status) setExistingStatus(q.status);
      if (q.createdAt) setExistingCreatedAt(q.createdAt);
      if (q.validUntil) setValidUntil(q.validUntil);
    });
  }, [quotationId]);

  useEffect(() => {
    api<{ username: string; first_name: string; last_name: string }[] | { results: { username: string; first_name: string; last_name: string }[] }>("/api/users/")
      .then((data) => setStaff(Array.isArray(data) ? data : data.results ?? []))
      .catch(() => undefined);
  }, []);

  const salespersonOptions = useMemo(() => {
    return staff.map((user) => {
      const name = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username;
      return { value: name, label: name, username: user.username };
    });
  }, [staff]);

  useEffect(() => {
    if (!salesperson || salespersonOptions.length === 0) return;
    const byUsername = salespersonOptions.find((option) => option.username === salesperson);
    if (byUsername && byUsername.value !== salesperson) setSalesperson(byUsername.value);
  }, [salesperson, salespersonOptions]);

  // Prices are always VAT-inclusive; never add VAT on top.
  const item = {
    vehiclePrice: vehiclePrice === "" ? 0 : Number(vehiclePrice),
    accessories: 0,
    discount: discount === "" ? 0 : Number(discount),
    vatRate: 0,
    otherCharges: Number(otherCharges) || 0,
  };
  const totals = crm.quotationTotals(item);

  const handleModelChange = (id: string | number | null, m: VehicleModelOption | null) => {
    const sId = id ? String(id) : "";
    setVehicleModelId(sId);
    setSelectedModel(m);
    setVariantId("");
    setVariants([]);
    setVariantsReady(!sId);
    setVariantsError("");
    setModelHasVariants(Boolean(m?.has_active_variants));
    setRangeKm(m?.range_km ? String(m.range_km) : "");
    if (m) {
      const mName = (m.model_name || "").toUpperCase();
      const is6 = mName.includes("6T") || mName.includes("6 TON");
      const is10 = mName.includes("10T") || mName.includes("10 TON");
      if (is6) {
        setVehicleDescription("6 Ton Payload with 2 Doors");
        setRangeKm(m.range_km ? String(m.range_km) : "");
      } else if (is10) {
        setVehicleDescription("10 Ton Payload with 2 Doors");
        setRangeKm(m.range_km ? String(m.range_km) : "");
      }
      setBatteryCapacity("");
      setBatterySelect("");
      setVehicleLength("");
      setLengthSelect("");
    } else {
      setBatteryCapacity("");
      setBatterySelect("");
      setVehicleLength("");
      setLengthSelect("");
    }
  };

  const submit = async (send: boolean) => {
    if (!customerId && !leadId) return setError("Customer or Lead is required.");
    if (!vehicleModelId) return setError("Vehicle Model is required.");
    if (!variantsReady) return setError("Vehicle variants are still loading.");
    if (variantsError) return setError(variantsError);
    if ((modelHasVariants || variants.length > 0) && !variantId) {
      return setError(
        variants.length === 0
          ? "This model has variants, but none could be loaded."
          : "Please select a vehicle variant.",
      );
    }
    if (!batteryCapacity) return setError("Please select a battery capacity.");
    if (!vehicleLength) return setError("Please select a cargo length.");
    if (!bankName.trim()) return setError("Please select a bank.");
    if (!bankAddress.trim()) return setError("Please select a bank branch.");
    if (vehiclePrice === "" || Number(vehiclePrice) <= 0) return setError("Please enter the vehicle price.");
    if (quantity === "" || !Number.isInteger(Number(quantity)) || Number(quantity) < 1) {
      return setError("Please enter a quantity of at least 1.");
    }
    if (discount === "") return setError("Please enter the discount. Use 0 if there is none.");
    setSaving(true);
    try {
      let customerName = leadName || (leadId ? `Lead #${leadId}` : "");
      let company = "";
      let resolvedPan = panNumber.trim();
      let resolvedPhone = customerPhone.trim();
      let resolvedAddress = customerAddress.trim();

      if (customerId) {
        if (selectedCustomer && String(selectedCustomer.id) === String(customerId)) {
          customerName = selectedCustomer.name;
          company = selectedCustomer.company || "";
          if (!resolvedPhone && selectedCustomer.phone) resolvedPhone = selectedCustomer.phone;
          if (!resolvedAddress && selectedCustomer.address) resolvedAddress = selectedCustomer.address;
          if (!resolvedPan && selectedCustomer.pan) resolvedPan = selectedCustomer.pan;
        } else {
          const match = customers.find((c) => String(c.id) === String(customerId));
          if (match) {
            customerName = match.name;
            company = match.company;
          }
          try {
            const fetched = await api<any>(`/api/crm/customers/${customerId}/`);
            customerName = fetched.name || customerName;
            company = fetched.company || company;
            if (fetched.pan_vat_number) resolvedPan = fetched.pan_vat_number;
            if (fetched.phone) resolvedPhone = fetched.phone;
            if (fetched.address || fetched.location) resolvedAddress = fetched.address || fetched.location;
          } catch {}
        }
      }

      const brand = selectedModel?.brand || "VT";
      const mName = selectedModel?.model_name || "Cargo 6T";
      const lengthPart = vehicleLength ? ` - ${vehicleLength}` : "";
      const modelDisplayName = `${brand} ${mName}${lengthPart} Commercial Electric Vehicle`;

      const payload = {
        customerId: customerId || "",
        customerName: customerName || (leadId ? `Lead #${leadId}` : ""),
        company,
        panNumber: resolvedPan,
        customerPhone: resolvedPhone,
        customerAddress: resolvedAddress,
        vehicleModelId: vehicleModelId || null,
        variantId: variantId || null,
        unitId: null,
        vehicle: modelDisplayName,
        vehicleDescription: vehicleDescription.trim(),
        batteryCapacity: batteryCapacity.trim(),
        vehicleLength: vehicleLength.trim(),
        bankName: bankName.trim(),
        bankAddress: bankAddress.trim(),
        transmission: transmission.trim(),
        rangeKm: (selectedModel?.range_km ? String(selectedModel.range_km) : rangeKm).trim(),
        extraSpecs,
        version: version.trim(),
        chargerInfo: chargerInfo.trim(),
        quantity: Number(quantity),
        paymentTerms: paymentTerms.trim(),
        deliveryTerms: deliveryTerms.trim(),
        warrantyTerms: warrantyTerms.trim(),
        insuranceTerms: insuranceTerms.trim(),
        registrationTerms: registrationTerms.trim(),
        salesperson,
        item,
        validUntil: validUntil || "",
        referenceNo: referenceNo.trim(),
        notes: notes.trim(),
        status: (send ? "sent" : (quotationId ? existingStatus : "draft")) as QuotationStatus,
        createdAt: existingCreatedAt || new Date().toISOString(),
        leadId: leadId ?? null,
      };

      if (quotationId) {
        const updated = await crm.saveQuotation({ id: quotationId, ...payload });
        onSaved(send ? "Quotation sent." : "Quotation updated.", updated);
        onClose();
      } else {
        const created = await crm.saveQuotation(payload);
        onSaved(send ? "Quotation sent." : "Quotation saved as draft.", created);
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  };

  return (
    <Modal title={quotationId ? "Edit Quotation" : "Create Quotation"} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {leadId ? (
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-[#737373] mb-1">
              Connected Lead
            </label>
            <div className="px-3.5 py-2.5 bg-[#FAFAF8] border border-[#E8E8E5] rounded-xl text-[13px] font-semibold text-[#04314A]">
              {leadName || `Lead #${leadId}`}
            </div>
          </div>
        ) : (
          <CustomerPicker
            allowCreate={false}
            value={customerId ? Number(customerId) : null}
            onChange={(id, c) => {
              setCustomerId(id ? String(id) : "");
              applyCustomerDetails(c);
            }}
            required
            compact
          />
        )}

        <VehicleModelPicker
          value={vehicleModelId ? Number(vehicleModelId) : null}
          onChange={(id, m) => handleModelChange(id, m)}
          label="Vehicle Model"
          placeholder="Select vehicle model (e.g. VT Cargo 6T)..."
          required
        />

        {/* Variant Dropdown - data arrives from API */}
        <Field label="Vehicle Variant" required>
          <SelectField
            disabled={!modelSelected}
            value={variantId}
            onChange={(vId) => {
              setVariantId(vId);
              const selectedVar = variants.find((v) => String(v.id) === String(vId));
              if (selectedVar && selectedVar.price_override !== null && selectedVar.price_override !== undefined) {
                setVehiclePrice(String(selectedVar.price_override));
              }
            }}
            options={[
              {
                value: "",
                label: !modelSelected
                  ? "Select a vehicle model first"
                  : variants.length > 0
                  ? "Select variant..."
                  : "No variants for this model",
              },
              ...variants.map((v) => ({
                value: String(v.id),
                label: v.product_code ? `${v.name} (${v.product_code})` : v.name,
              })),
            ]}
          />
        </Field>

        {/* Battery Capacity Dropdown */}
        <Field label="Battery Capacity" required>
          <div className="space-y-1.5">
            <SelectField
              disabled={!modelSelected}
              value={modelSelected ? batterySelect : ""}
              onChange={(val) => {
                setBatterySelect(val);
                setBatteryCapacity(val);
              }}
              options={batteryOptions}
            />
          </div>
        </Field>

        {/* Cargo Length Dropdown */}
        <Field label="Cargo Length" required>
          <div className="space-y-1.5">
            <SelectField
              disabled={!modelSelected}
              value={modelSelected ? lengthSelect : ""}
              onChange={(val) => {
                setLengthSelect(val);
                setVehicleLength(val);
              }}
              options={lengthOptions}
            />
          </div>
        </Field>

        {/* Contact from customer is read-only; lead-only quotes can still set PAN. */}
        {customerId ? (
          <div className="sm:col-span-2 rounded-xl border border-[#E8E8E5] bg-[#FAFAF8] px-4 py-3 text-[12px]">
            <div className="font-semibold text-[#04314A] mb-1.5">Contact from customer</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1 text-[#737373]">
              <div>
                <span className="font-medium text-[#04314A]">PAN / VAT:</span>{" "}
                {panNumber || "—"}
              </div>
              <div>
                <span className="font-medium text-[#04314A]">Phone:</span>{" "}
                {customerPhone || "—"}
              </div>
              <div>
                <span className="font-medium text-[#04314A]">Address:</span>{" "}
                {customerAddress || "—"}
              </div>
            </div>
            <p className="mt-2 text-[11px] text-[#A3A39E]">
              Change these on the customer record — they are copied into the quotation when saved.
            </p>
          </div>
        ) : (
          <Field label="Client PAN / VAT No.">
            <input
              type="text"
              value={panNumber}
              onChange={(e) => setPanNumber(e.target.value)}
              placeholder={leadId ? "Optional for lead quotations" : "Select a customer first"}
              className={inputCls}
            />
          </Field>
        )}

        {/* Pricing */}
        <Field label="Quantity" required>
          <input type="number" min={1} step={1} value={quantity} placeholder="1" onChange={(e) => setQuantity(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Vehicle Price (NPR)" required>
          <input type="number" min={0} value={vehiclePrice} placeholder="Enter vehicle price" onChange={(e) => setVehiclePrice(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Discount (NPR)" required>
          <input type="number" min={0} value={discount} placeholder="Enter discount" onChange={(e) => setDiscount(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Salesperson">
          <SelectField
            value={salesperson}
            onChange={setSalesperson}
            options={[
              { value: "", label: "Select salesperson" },
              ...salespersonOptions.map((option) => ({ value: option.value, label: option.label })),
            ]}
          />
        </Field>
        <Field label="Valid Until">
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Quotation / Reference No.">
          <input
            type="text"
            value={referenceNo}
            readOnly
            placeholder="Selects after model, variant, battery, and cargo length"
            className={`${inputCls} bg-[#FAFAF8]`}
            title="Generated as QT-{tonnage}-{product code}-{battery}-{cargo}-{sequence}"
          />
        </Field>
        <BankPicker
          value={bankId}
          placeholder={bankId ? "Select bank..." : bankName || "Select bank..."}
          onChange={(id, bank) => {
            bankTouched.current = true;
            branchTouched.current = true;
            setBankId(id);
            setBankName(bank?.name || "");
            setBranchId(null);
            setBankAddress("");
          }}
        />
        <BankBranchPicker
          bankId={bankId}
          value={branchId}
          placeholder={branchId ? "Select bank branch..." : bankAddress || "Select bank branch..."}
          onChange={(id, branch) => {
            branchTouched.current = true;
            setBranchId(id);
            setBankAddress(branch?.name || "");
          }}
        />

        <div className="sm:col-span-2">
          <button
            type="button"
            onClick={() => setShowAdvancedSpecs(!showAdvancedSpecs)}
            className="text-[12px] font-semibold text-[#04314A] hover:underline flex items-center gap-1.5 py-1"
          >
            <span>{showAdvancedSpecs ? "Hide" : "Show"} Specifications and Terms (Letterhead Defaults)</span>
          </button>
        </div>

        {showAdvancedSpecs && (
          <>
            <Field label="Description">
              <input
                type="text"
                value={vehicleDescription}
                onChange={(e) => setVehicleDescription(e.target.value)}
                placeholder="e.g. 6 Ton Payload with 2 Doors"
                className={inputCls}
              />
            </Field>
            <Field label="Transmission">
              <input
                type="text"
                value={transmission}
                onChange={(e) => setTransmission(e.target.value)}
                placeholder="e.g. Automatic"
                className={inputCls}
              />
            </Field>
            <Field label="Version">
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="e.g. Commercial Electric Truck"
                className={inputCls}
              />
            </Field>
            <Field label="Charger">
              <input
                type="text"
                value={chargerInfo}
                onChange={(e) => setChargerInfo(e.target.value)}
                placeholder="e.g. Support GB/T DC Fast Charger"
                className={inputCls}
              />
            </Field>
            <Field label="Payment Terms">
              <input
                type="text"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="e.g. 40% Down Payment & 60% Bank DO before Dispatch."
                className={inputCls}
              />
            </Field>
            <Field label="Delivery Terms">
              <input
                type="text"
                value={deliveryTerms}
                onChange={(e) => setDeliveryTerms(e.target.value)}
                placeholder="e.g. As per Client Requirement."
                className={inputCls}
              />
            </Field>
            <Field label="Warranty Terms">
              <input
                type="text"
                value={warrantyTerms}
                onChange={(e) => setWarrantyTerms(e.target.value)}
                placeholder="e.g. Company Authorized Warranty Terms."
                className={inputCls}
              />
            </Field>
            <Field label="Insurance Terms">
              <input
                type="text"
                value={insuranceTerms}
                onChange={(e) => setInsuranceTerms(e.target.value)}
                placeholder="e.g. 1 Year Insurance Included in Offered Price."
                className={inputCls}
              />
            </Field>
            <Field label="Registration Terms">
              <input
                type="text"
                value={registrationTerms}
                onChange={(e) => setRegistrationTerms(e.target.value)}
                placeholder="e.g. 1 Year Registration Included in Offered Price."
                className={inputCls}
              />
            </Field>
            <div className="sm:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#737373]">Custom fields</span>
                <button
                  type="button"
                  onClick={() => setExtraSpecs((rows) => [...rows, { label: "", value: "" }])}
                  className="text-[12px] font-semibold text-[#00AAEB] hover:text-[#04314A]"
                >
                  Add field
                </button>
              </div>
              {extraSpecs.map((row, index) => (
                <div key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                  <input
                    type="text"
                    value={row.label}
                    onChange={(e) =>
                      setExtraSpecs((rows) => rows.map((item, i) => (i === index ? { ...item, label: e.target.value } : item)))
                    }
                    placeholder="Label"
                    className={inputCls}
                  />
                  <input
                    type="text"
                    value={row.value}
                    onChange={(e) =>
                      setExtraSpecs((rows) => rows.map((item, i) => (i === index ? { ...item, value: e.target.value } : item)))
                    }
                    placeholder="Value"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => setExtraSpecs((rows) => rows.filter((_, i) => i !== index))}
                    className="text-[12px] font-semibold text-[#737373] hover:text-[#DC2626] px-2"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="sm:col-span-2">
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional quotation notes" className={inputCls} />
          </Field>
        </div>
      </div>

      <div className="mt-5 border border-[#E8E8E5] rounded-xl bg-[#FAFAF8] px-5 py-4 flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#737373]">Total (incl. VAT)</span>
        <span className="text-[20px] font-black text-[#04314A]">{formatNpr(totals.total)}</span>
      </div>

      {error || variantsError ? (
        <p className="mt-4 text-[12px] text-[#DC2626] font-medium">{error || variantsError}</p>
      ) : null}
      <div data-modal-actions className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#737373] hover:text-[#04314A] transition-colors">
          Cancel
        </button>
        <button onClick={() => submit(true)} disabled={saving} className={primaryBtnCls}>
          Save and Send
        </button>
        <button onClick={() => submit(false)} disabled={saving} className={primaryBtnCls}>
          {quotationId ? "Save Changes" : "Save Draft"}
        </button>
      </div>
    </Modal>
  );
}
