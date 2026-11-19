// CRM data service layer.
// All CRM records (leads, customers, opportunities, test drives, quotations,
// activities) are persisted through the backend Django API (`/api/crm/...`)
// so they show up in the Django admin as well.
//
// NOTE: VEHICLES and SALESPERSONS below are offline fallbacks only:
// dropdowns load live values from `/api/vehicles/` and `/api/users/`
// (see ./useOptions.ts).

import { API_BASE, api, getValidAccessToken } from "@/lib/api";

export const VEHICLES = ["Cargo 6T", "Cargo 10T", "D2"];
export const SALESPERSONS = ["Bikash Maharjan", "Prakriti Shrestha", "Anil Tamang"];

export const LEAD_SOURCES = [
  "Website",
  "Book Test Drive",
  "Request Quote",
  "Vehicle Enquiry",
  "Facebook",
  "Instagram",
  "Google",
  "Phone",
  "Walk-in",
  "Referral",
  "Dealer",
  "Other",
] as const;

export const LEAD_STATUSES = ["new", "contacted", "qualified", "converted", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STAGES = [
  "new_lead",
  "contacted",
  "qualified",
  "test_drive",
  "quotation",
  "negotiation",
  "won",
  "lost",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  new_lead: "New Lead",
  contacted: "Contacted",
  qualified: "Qualified",
  test_drive: "Test Drive",
  quotation: "Quotation",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export const CUSTOMER_TYPES = ["Individual", "Business", "Fleet", "Government", "NGO/INGO", "Dealer"] as const;

export const TEST_DRIVE_STATUSES = ["requested", "scheduled", "confirmed", "completed", "cancelled", "no_show"] as const;
export type TestDriveStatus = (typeof TEST_DRIVE_STATUSES)[number];

export const QUOTATION_STATUSES = ["draft", "sent", "viewed", "accepted", "rejected", "expired"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const ACTIVITY_TYPES = ["call", "email", "whatsapp", "meeting", "note", "test_drive", "quotation", "status_change"] as const;
export type ActivityTypeCode = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_LABELS: Record<ActivityTypeCode, string> = {
  call: "Call",
  email: "Email",
  whatsapp: "WhatsApp",
  meeting: "Meeting",
  note: "Note",
  test_drive: "Test Drive",
  quotation: "Quotation",
  status_change: "Status Change",
};

// Additional labels for synthetic/system activity types not in the dropdown.
export const EXTENDED_ACTIVITY_LABELS: Record<string, string> = {
  ...ACTIVITY_LABELS,
  lead_created: "Lead Created",
};

export type Lead = {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  vehicle: string;
  vehicleModelId?: string | null;
  vehicleModelDetail?: { id: number; brand: string; model_name: string } | null;
  variantId?: string | null;
  variantDetail?: { id: number; name: string } | null;
  interestLevel: number | null;
  interestLevelName: string;
  source: string;
  budget: number;
  createdBy: string;
  notes: string;
  status: LeadStatus;
  pipelineStage?: string;
  createdAt: string;
  lastActivity: string;
};

export type LeadSource = {
  id: number;
  name: string;
  is_active: boolean;
  lead_count: number;
  created_at: string;
  updated_at: string;
};

export type ActivityType = {
  id: number;
  name: string;
  label: string;
  is_active: boolean;
  activity_count: number;
  created_at: string;
  updated_at: string;
};

export type Bank = {
  id: number;
  name: string;
  code: string;
  category: string;
  is_active: boolean;
  branch_count: number;
  created_at: string;
  updated_at: string;
};

export type BankBranch = {
  id: number;
  bank: number;
  bank_name: string;
  name: string;
  code: string;
  address: string;
  district: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Customer = {
  id: string;
  displayId?: string;
  lead?: string | null;
  name: string;
  company: string;
  type: string;
  phone: string;
  email: string;
  location: string;
  vehicles: string[];
  notes: string;
  totalPurchases: number;
  status: "active" | "inactive";
  lastActivity: string;
  createdAt: string;
  createdByName?: string;
  updatedByName?: string;
  source?: string;
  panNumber?: string;
  pan_vat_number?: string;
};

export type Opportunity = {
  id: string;
  displayId?: string;
  title: string;
  customerId: string;
  customerName: string;
  company: string;
  vehicle: string;
  stage: Stage;
  value: number;
  probability: number;
  closeDate: string;
  assignedTo: string;
  lastActivity: string;
  createdAt: string;
};

export type Activity = {
  id: string;
  leadId?: string;
  customerId?: string;
  type: string;
  subject: string;
  description: string;
  datetime: string;
  user: string;
};

export type TestDrive = {
  id: string;
  displayId?: string;
  leadId?: string | null;
  customerId?: string | null;
  customerName: string;
  vehicle: string;
  unitId?: string | null;
  unitVin?: string | null;
  date: string;
  time: string;
  salesperson: string;
  location: string;
  status: TestDriveStatus;
  notes: string;
};

export type QuotationItem = {
  vehiclePrice: number;
  accessories: number;
  discount: number;
  vatRate: number;
  otherCharges: number;
};

/** Customer-facing quotation number: Quotation / Reference No., with -R1/-R2 for revisions. */
export function quotationLabel(q: {
  id: string;
  referenceNo?: string;
  displayId?: string;
  revisionNumber?: number;
}): string {
  const rev =
    typeof q.revisionNumber === "number" && q.revisionNumber > 0 ? q.revisionNumber : 0;
  const revSuffix = rev > 0 ? `-R${rev}` : "";
  const ref = (q.referenceNo || "").trim().replace(/-R\d+$/i, "");
  if (ref) return `${ref}${revSuffix}`;
  if (q.displayId) return q.displayId;
  const base = q.id.startsWith("QT-") ? q.id : `QT-${q.id}`;
  return rev > 0 && !/-R\d+$/i.test(base) ? `${base}${revSuffix}` : base;
}

export type Quotation = {
  id: string;
  displayId?: string;
  leadId?: string | null;
  customerId: string;
  customerName: string;
  company: string;
  vehicleModelId?: string | null;
  vehicleModelDetail?: { id: number; brand: string; model_name: string; range_km?: string } | null;
  variantId?: string | null;
  variantDetail?: {
    id: number;
    name: string;
    product_code?: string;
    body_type_name?: string;
    spec_text?: string;
    price_override?: string | number | null;
  } | null;
  unitId?: string | null;
  unitDetail?: { id: number; vin_chassis_no: string; status: string } | null;
  vehicle: string;
  salesperson: string;
  salespersonName?: string;
  salespersonEmail?: string;
  salespersonPhone?: string;
  item: QuotationItem;
  panNumber?: string;
  customerPhone?: string;
  customerAddress?: string;
  batteryCapacity?: string;
  vehicleLength?: string;
  bankName?: string;
  bankAddress?: string;
  vehicleDescription?: string;
  transmission?: string;
  rangeKm?: string;
  extraSpecs?: { label: string; value: string }[];
  version?: string;
  chargerInfo?: string;
  quantity?: number;
  paymentTerms?: string;
  deliveryTerms?: string;
  warrantyTerms?: string;
  insuranceTerms?: string;
  registrationTerms?: string;
  amountInWords?: string;
  validUntil: string;
  referenceNo?: string;
  notes: string;
  status: QuotationStatus;
  createdAt: string;
  convertedToOrder?: boolean;
  uuid?: string;
  parent?: string | number | null;
  root?: string | number | null;
  revisionNumber?: number;
  isLatest?: boolean;
  saleId?: string | null;
  saleUnitId?: string | null;
  saleUnitVin?: string | null;
  createdByName?: string;
  updatedByName?: string;
};

export type Overview = {
  totalLeads: number;
  qualifiedLeads: number;
  openOpportunities: number;
  openPipelineValue: number;
  upcomingTestDrives: number;
  completedTestDrives: number;
  activeQuotations: number;
  conversionRate: number;
  stageCounts: Record<Stage, number>;
  pipelineStageCounts?: Record<string, number>;
};

// ---------------------------------------------------------------------------
// API mapping helpers: the backend API is snake_case, the UI is camelCase.
// ---------------------------------------------------------------------------

type ApiLead = {
  id: number | string;
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  vehicle: string;
  vehicle_model?: number | null;
  vehicle_model_detail?: { id: number; brand: string; model_name: string; range_km?: string } | null;
  variant?: number | null;
  variant_detail?: { id: number; name: string } | null;
  interest_level: number | null;
  interest_level_detail?: { id: number; name: string } | null;
  source: string;
  budget: number | string;
  notes?: string;
  status: string;
  pipeline_stage?: string;
  created_at: string;
  last_activity: string;
  created_by_name?: string;
};

type ApiCustomer = {
  id: number | string;
  display_id?: string;
  lead?: number | string | null;
  name: string;
  company: string;
  type: string;
  phone: string;
  email: string;
  location: string;
  vehicles?: string[];
  notes?: string;
  total_purchases: number | string;
  status: string;
  last_activity: string;
  created_at: string;
  created_by_name?: string;
  updated_by_name?: string;
  source?: string;
};

type ApiOpportunity = {
  id: number | string;
  display_id?: string;
  title: string;
  customer: number | null;
  customer_name: string;
  company: string;
  vehicle: string;
  stage: string;
  value: number | string;
  probability: number;
  close_date: string | null;
  assigned_to_name?: string;
  last_activity: string;
  created_at: string;
};

type ApiTestDrive = {
  id: number | string;
  display_id?: string;
  lead: number | null;
  customer: number | null;
  customer_name: string;
  unit?: number | null;
  unit_vin?: string | null;
  vehicle: string;
  date: string;
  time: string | null;
  salesperson: string;
  location: string;
  status: string;
  notes?: string;
};

type ApiQuotation = {
  id: number | string;
  display_id?: string;
  lead: number | null;
  customer: number | null;
  customer_name: string;
  company: string;
  vehicle_model?: number | null;
  vehicle_model_detail?: { id: number; brand: string; model_name: string; range_km?: string } | null;
  variant?: number | null;
  variant_detail?: {
    id: number;
    name: string;
    product_code?: string;
    body_type_name?: string;
    spec_text?: string;
    price_override?: string | null;
  } | null;
  unit?: number | null;
  unit_detail?: { id: number; vin_chassis_no: string; status: string } | null;
  vehicle: string;
  salesperson: string;
  salesperson_name?: string;
  salesperson_email?: string;
  salesperson_phone?: string;
  vehicle_price: number | string;
  accessories: number | string;
  discount: number | string;
  vat_rate: number | string;
  other_charges: number | string;
  valid_until: string | null;
  reference_no?: string;
  notes?: string;
  status: string;
  created_at: string;
  converted_to_order?: boolean;
  uuid?: string;
  parent?: number | null;
  root?: number | null;
  revision_number?: number;
  is_latest?: boolean;
  sale_id?: number | null;
  sale_unit_id?: number | null;
  sale_unit_vin?: string | null;
  pan_number?: string;
  customer_phone?: string;
  customer_address?: string;
  battery_capacity?: string;
  vehicle_length?: string;
  bank_name?: string;
  bank_address?: string;
  vehicle_description?: string;
  transmission?: string;
  range_km?: string;
  extra_specs?: { label: string; value: string }[];
  version?: string;
  charger_info?: string;
  quantity?: number;
  payment_terms?: string;
  delivery_terms?: string;
  warranty_terms?: string;
  insurance_terms?: string;
  registration_terms?: string;
  amount_in_words?: string;
  created_by_name?: string;
  updated_by_name?: string;
};

type ApiActivity = {
  id: number | string;
  lead: number | null;
  customer: number | null;
  type: string;
  subject: string;
  description: string;
  datetime: string;
  user?: string;
};

type ApiLeadSource = {
  id: number;
  name: string;
  is_active: boolean;
  lead_count?: number | null;
  created_at: string;
  updated_at: string;
};

type ApiActivityType = {
  id: number;
  name: string;
  label?: string | null;
  is_active: boolean;
  activity_count?: number | null;
  created_at: string;
  updated_at: string;
};

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const asStr = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

function fromApiLead(r: ApiLead): Lead {
  return {
    id: asStr(r.id),
    name: r.name || "",
    company: r.company || "",
    phone: r.phone,
    email: r.email || "",
    address: r.address || "",
    vehicle: r.vehicle || "",
    vehicleModelId: r.vehicle_model ? asStr(r.vehicle_model) : null,
    vehicleModelDetail: r.vehicle_model_detail || null,
    variantId: r.variant ? asStr(r.variant) : null,
    variantDetail: r.variant_detail || null,
    interestLevel: r.interest_level ?? null,
    interestLevelName: r.interest_level_detail?.name || "",
    source: r.source,
    budget: toNum(r.budget),
    createdBy: r.created_by_name || "",
    notes: r.notes || "",
    status: r.status as LeadStatus,
    pipelineStage: r.pipeline_stage || r.status,
    createdAt: r.created_at,
    lastActivity: r.last_activity,
  };
}

function fromApiLeadSource(r: ApiLeadSource): LeadSource {
  return {
    id: r.id,
    name: r.name,
    is_active: r.is_active,
    lead_count: toNum(r.lead_count),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function fromApiActivityType(r: ApiActivityType): ActivityType {
  return {
    id: r.id,
    name: r.name,
    label: r.label || "",
    is_active: r.is_active,
    activity_count: toNum(r.activity_count),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function toApiLeadBody(input: Partial<Lead>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.company !== undefined) body.company = input.company;
  if (input.phone !== undefined) body.phone = input.phone;
  if (input.email !== undefined) body.email = input.email;
  if (input.address !== undefined) body.address = input.address;
  if (input.vehicle !== undefined) body.vehicle = input.vehicle;
  if (input.vehicleModelId !== undefined) body.vehicle_model = input.vehicleModelId ? Number(input.vehicleModelId) : null;
  if (input.variantId !== undefined) body.variant = input.variantId ? Number(input.variantId) : null;
  if (input.interestLevel !== undefined) body.interest_level = input.interestLevel;
  if (input.source !== undefined) body.source = input.source;
  if (input.budget !== undefined) body.budget = input.budget;
  if (input.notes !== undefined) body.notes = input.notes;
  if (input.status !== undefined) body.status = input.status;
  return body;
}

function fromApiCustomer(r: ApiCustomer): Customer {
  return {
    id: asStr(r.id),
    displayId: r.display_id,
    lead: r.lead ? asStr(r.lead) : null,
    name: r.name,
    company: r.company || "",
    type: r.type,
    phone: r.phone || "",
    email: r.email || "",
    location: r.location || "",
    vehicles: Array.isArray(r.vehicles) ? r.vehicles.filter(Boolean) : [],
    notes: r.notes || "",
    totalPurchases: toNum(r.total_purchases),
    status: (r.status === "inactive" ? "inactive" : "active") as Customer["status"],
    lastActivity: r.last_activity,
    createdAt: r.created_at,
    createdByName: r.created_by_name || "",
    updatedByName: r.updated_by_name || "",
    source: r.source || "",
  };
}

function fromApiOpportunity(r: ApiOpportunity): Opportunity {
  return {
    id: asStr(r.id),
    displayId: r.display_id,
    title: r.title,
    customerId: r.customer ? asStr(r.customer) : "",
    customerName: r.customer_name || "",
    company: r.company || "",
    vehicle: r.vehicle || "",
    stage: r.stage as Stage,
    value: toNum(r.value),
    probability: toNum(r.probability),
    closeDate: r.close_date || "",
    assignedTo: r.assigned_to_name || "",
    lastActivity: r.last_activity,
    createdAt: r.created_at,
  };
}

function fromApiTestDrive(r: ApiTestDrive): TestDrive {
  return {
    id: asStr(r.id),
    displayId: r.display_id,
    leadId: r.lead ? asStr(r.lead) : null,
    customerId: r.customer ? asStr(r.customer) : "",
    customerName: r.customer_name || "",
    vehicle: r.vehicle || "",
    unitId: r.unit ? asStr(r.unit) : null,
    unitVin: r.unit_vin || null,
    date: r.date,
    time: r.time || "",
    salesperson: r.salesperson || "",
    location: r.location || "",
    status: r.status as TestDriveStatus,
    notes: r.notes || "",
  };
}

function fromApiQuotation(r: ApiQuotation): Quotation {
  return {
    id: asStr(r.id),
    displayId: r.display_id,
    leadId: r.lead ? asStr(r.lead) : null,
    customerId: r.customer ? asStr(r.customer) : "",
    customerName: r.customer_name || "",
    company: r.company || "",
    vehicleModelId: r.vehicle_model ? asStr(r.vehicle_model) : null,
    vehicleModelDetail: r.vehicle_model_detail || null,
    variantId: r.variant ? asStr(r.variant) : null,
    variantDetail: r.variant_detail || null,
    unitId: r.unit ? asStr(r.unit) : null,
    unitDetail: r.unit_detail || null,
    vehicle: r.vehicle || "",
    salesperson: r.salesperson || "",
    salespersonName: r.salesperson_name || "",
    salespersonEmail: r.salesperson_email || "",
    salespersonPhone: r.salesperson_phone || "",
    item: {
      vehiclePrice: toNum(r.vehicle_price),
      accessories: toNum(r.accessories),
      discount: toNum(r.discount),
      vatRate: toNum(r.vat_rate),
      otherCharges: toNum(r.other_charges),
    },
    panNumber: r.pan_number || "",
    customerPhone: r.customer_phone || "",
    customerAddress: r.customer_address || "",
    batteryCapacity: r.battery_capacity || "",
    vehicleLength: r.vehicle_length || "",
    bankName: r.bank_name || "",
    bankAddress: r.bank_address || "",
    vehicleDescription: r.vehicle_description || "",
    transmission: r.transmission || "Automatic",
    rangeKm: r.vehicle_model_detail?.range_km || r.range_km || "",
    extraSpecs: Array.isArray(r.extra_specs) ? r.extra_specs : [],
    version: r.version || "Commercial Electric Truck",
    chargerInfo: r.charger_info || "Support GB/T DC Fast Charger",
    quantity: typeof r.quantity === "number" ? r.quantity : 1,
    paymentTerms: r.payment_terms || "40% Down Payment & 60% Bank DO before Dispatch.",
    deliveryTerms: r.delivery_terms || "As per Client Requirement.",
    warrantyTerms: r.warranty_terms || "Company Authorized Warranty Terms.",
    insuranceTerms: r.insurance_terms || "1 Year Insurance Included in Offered Price.",
    registrationTerms: r.registration_terms || "1 Year Registration Included in Offered Price.",
    amountInWords: r.amount_in_words || "",
    validUntil: r.valid_until || "",
    referenceNo: r.reference_no || "",
    notes: r.notes || "",
    status: r.status as QuotationStatus,
    createdAt: r.created_at,
    convertedToOrder: Boolean(r.converted_to_order),
    uuid: r.uuid || undefined,
    parent: r.parent ? asStr(r.parent) : null,
    root: r.root ? asStr(r.root) : null,
    revisionNumber: typeof r.revision_number === "number" ? r.revision_number : 0,
    isLatest: r.is_latest !== undefined ? Boolean(r.is_latest) : true,
    saleId: r.sale_id ? asStr(r.sale_id) : null,
    saleUnitId: r.sale_unit_id ? asStr(r.sale_unit_id) : null,
    saleUnitVin: r.sale_unit_vin || null,
    createdByName: r.created_by_name || "",
    updatedByName: r.updated_by_name || "",
  };
}

function fromApiActivity(r: ApiActivity): Activity {
  return {
    id: asStr(r.id),
    leadId: r.lead ? asStr(r.lead) : undefined,
    customerId: r.customer ? asStr(r.customer) : undefined,
    type: r.type,
    subject: r.subject,
    description: r.description || "",
    datetime: r.datetime,
    user: r.user || "",
  };
}

export const crm = {
  // Overview: computed from the same API data the pages use.
  async overview(): Promise<Overview> {
    const [leads, opps, tds, quotes] = await Promise.all([
      crm.leads(),
      crm.opportunities(),
      crm.testDrives(),
      crm.quotations(),
    ]);
    const openOpps = opps.filter((o) => o.stage !== "won" && o.stage !== "lost");
    return {
      totalLeads: leads.filter((l) => l.status !== "converted" && l.status !== "lost").length,
      qualifiedLeads: leads.filter((l) => l.status === "qualified").length,
      openOpportunities: openOpps.length,
      openPipelineValue: openOpps.reduce((sum, o) => sum + o.value, 0),
      upcomingTestDrives: tds.filter(
        (t) => t.date >= new Date().toISOString().slice(0, 10) && !["cancelled", "no_show"].includes(t.status),
      ).length,
      completedTestDrives: tds.filter((t) => t.status === "completed").length,
      activeQuotations: quotes.filter((q) => ["draft", "sent", "viewed"].includes(q.status)).length,
      conversionRate:
        leads.length === 0
          ? 0
          : Math.round((leads.filter((l) => l.status === "converted").length / leads.length) * 100),
      stageCounts: Object.fromEntries(
        STAGES.map((stage) => [stage, opps.filter((o) => o.stage === stage).length]),
      ) as Record<Stage, number>,
      pipelineStageCounts: {
        new: leads.filter((l) => l.pipelineStage === "new").length,
        contacted: leads.filter((l) => l.pipelineStage === "contacted").length,
        test_drive: leads.filter((l) => l.pipelineStage === "test_drive").length,
        quotation: leads.filter((l) => l.pipelineStage === "quotation").length,
        negotiation: leads.filter((l) => l.pipelineStage === "negotiation").length,
        won: leads.filter((l) => l.pipelineStage === "won").length,
        lost: leads.filter((l) => l.pipelineStage === "lost").length,
      },
    };
  },

  leads(): Promise<Lead[]> {
    return api<ApiLead[]>("/api/crm/leads/").then((rows) => rows.map(fromApiLead));
  },

  // Dynamic lead sources: managed on the Lead Sources page and used by the
  // lead source dropdowns via /api/crm/meta/.
  leadSources(): Promise<LeadSource[]> {
    return api<ApiLeadSource[]>("/api/crm/lead-sources/").then((rows) => rows.map(fromApiLeadSource));
  },

  async createLeadSource(name: string, isActive = true): Promise<LeadSource> {
    const created = await api<ApiLeadSource>("/api/crm/lead-sources/", {
      method: "POST",
      body: JSON.stringify({ name, is_active: isActive }),
    });
    return fromApiLeadSource(created);
  },

  async updateLeadSource(id: number, patch: { name?: string; is_active?: boolean }): Promise<LeadSource> {
    const updated = await api<ApiLeadSource>(`/api/crm/lead-sources/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return fromApiLeadSource(updated);
  },

  async deleteLeadSource(id: number): Promise<void> {
    await api<void>(`/api/crm/lead-sources/${id}/`, { method: "DELETE" });
  },

  // Dynamic activity types: managed on the Lead Sources page and used by the
  // Add Activity form's type dropdown via /api/crm/meta/.
  activityTypes(): Promise<ActivityType[]> {
    return api<ApiActivityType[]>("/api/crm/activity-types/").then((rows) => rows.map(fromApiActivityType));
  },

  async createActivityType(name: string, label = "", isActive = true): Promise<ActivityType> {
    const created = await api<ApiActivityType>("/api/crm/activity-types/", {
      method: "POST",
      body: JSON.stringify({ name, label, is_active: isActive }),
    });
    return fromApiActivityType(created);
  },

  async updateActivityType(
    id: number,
    patch: { name?: string; label?: string; is_active?: boolean },
  ): Promise<ActivityType> {
    const updated = await api<ApiActivityType>(`/api/crm/activity-types/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return fromApiActivityType(updated);
  },

  async deleteActivityType(id: number): Promise<void> {
    await api<void>(`/api/crm/activity-types/${id}/`, { method: "DELETE" });
  },

  banks(): Promise<Bank[]> {
    return api<Bank[]>("/api/crm/banks/");
  },

  async createBank(input: { name: string; code?: string; category?: string; is_active?: boolean }): Promise<Bank> {
    return api<Bank>("/api/crm/banks/", { method: "POST", body: JSON.stringify(input) });
  },

  async updateBank(
    id: number,
    patch: Partial<Pick<Bank, "name" | "code" | "category" | "is_active">>,
  ): Promise<Bank> {
    return api<Bank>(`/api/crm/banks/${id}/`, { method: "PATCH", body: JSON.stringify(patch) });
  },

  async deleteBank(id: number): Promise<void> {
    await api<void>(`/api/crm/banks/${id}/`, { method: "DELETE" });
  },

  async createBankBranch(input: {
    bank: number;
    name: string;
    code?: string;
    address?: string;
    district?: string;
    is_active?: boolean;
  }): Promise<BankBranch> {
    return api<BankBranch>("/api/crm/bank-branches/", { method: "POST", body: JSON.stringify(input) });
  },

  async updateBankBranch(
    id: number,
    patch: Partial<Pick<BankBranch, "bank" | "name" | "code" | "address" | "district" | "is_active">>,
  ): Promise<BankBranch> {
    return api<BankBranch>(`/api/crm/bank-branches/${id}/`, { method: "PATCH", body: JSON.stringify(patch) });
  },

  async deleteBankBranch(id: number): Promise<void> {
    await api<void>(`/api/crm/bank-branches/${id}/`, { method: "DELETE" });
  },

  async lead(id: string): Promise<Lead | undefined> {
    try {
      return fromApiLead(await api<ApiLead>(`/api/crm/leads/${id}/`));
    } catch {
      return undefined;
    }
  },

  async createLead(
    input: Omit<Lead, "id" | "createdAt" | "lastActivity" | "status" | "createdBy"> & { createdBy?: string },
  ): Promise<Lead> {
    const created = await api<ApiLead>("/api/crm/leads/", {
      method: "POST",
      body: JSON.stringify(toApiLeadBody(input)),
    });
    return fromApiLead(created);
  },

  async updateLead(id: string, patch: Partial<Lead>): Promise<Lead> {
    const updated = await api<ApiLead>(`/api/crm/leads/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(toApiLeadBody(patch)),
    });
    return fromApiLead(updated);
  },

  async deleteLead(id: string): Promise<void> {
    await api<void>(`/api/crm/leads/${id}/`, { method: "DELETE" });
  },

  customers(): Promise<Customer[]> {
    return api<ApiCustomer[]>("/api/crm/customers/").then((rows) => rows.map(fromApiCustomer));
  },

  async customer(id: string): Promise<Customer | undefined> {
    try {
      return fromApiCustomer(await api<ApiCustomer>(`/api/crm/customers/${id}/`));
    } catch {
      return undefined;
    }
  },

  async convertLead(id: string): Promise<{ lead: Lead; customer: Customer }> {
    const result = await api<{ lead: ApiLead; customer: ApiCustomer }>(
      `/api/crm/leads/${id}/convert/`,
      { method: "POST" },
    );
    return { lead: fromApiLead(result.lead), customer: fromApiCustomer(result.customer) };
  },

  async importFromEvent(input: {
    eventId: number | string;
    visitorIds?: (number | string)[];
    selectAll?: boolean;
    search?: string;
    interestLevel?: string | number;
    vehicle?: string | number;
    date?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<{
    event: { id: number; name: string };
    total: number;
    created: number;
    skipped: { visitor_id: number; name: string; reason: string }[];
    skipped_count: number;
    failed: number;
    errors: { visitor_id?: number; name?: string; error?: string }[];
  }> {
    return api(
      "/api/crm/leads/import-from-event/",
      {
        method: "POST",
        body: JSON.stringify({
          event_id: input.eventId,
          visitor_ids: input.visitorIds ?? [],
          select_all: !!input.selectAll,
          search: input.search || "",
          interest_level: input.interestLevel ?? "",
          vehicle: input.vehicle ?? "",
          date: input.date || "",
          date_from: input.dateFrom || "",
          date_to: input.dateTo || "",
        }),
      },
    );
  },

  opportunities(): Promise<Opportunity[]> {
    return api<ApiOpportunity[]>("/api/crm/opportunities/").then((rows) => rows.map(fromApiOpportunity));
  },

  async updateOpportunityStage(id: string, stage: Stage): Promise<Opportunity> {
    const body: Record<string, unknown> = { stage };
    if (stage === "won") body.probability = 100;
    if (stage === "lost") body.probability = 0;
    const updated = await api<ApiOpportunity>(`/api/crm/opportunities/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return fromApiOpportunity(updated);
  },

  activities(filter?: { leadId?: string; customerId?: string }): Promise<Activity[]> {
    const params = new URLSearchParams();
    if (filter?.leadId) params.set("lead", filter.leadId);
    if (filter?.customerId) params.set("customer", filter.customerId);
    const qs = params.toString();
    return api<ApiActivity[]>(`/api/crm/activities/${qs ? `?${qs}` : ""}`).then((rows) =>
      rows.map(fromApiActivity),
    );
  },

  async addActivity(input: Omit<Activity, "id">): Promise<Activity> {
    const fallbackUser = (() => {
      try {
        return localStorage.getItem("vt_username") || "";
      } catch {
        return "";
      }
    })();
    const resolvedUser = input.user && input.user !== "System" ? input.user : fallbackUser;

    const created = await api<ApiActivity>("/api/crm/activities/", {
      method: "POST",
      body: JSON.stringify({
        type: input.type,
        subject: input.subject,
        description: input.description,
        datetime: input.datetime,
        user_name: resolvedUser || undefined,
        lead: input.leadId || null,
        customer: input.customerId || null,
      }),
    });
    return fromApiActivity(created);
  },

  testDrives(): Promise<TestDrive[]> {
    return api<ApiTestDrive[]>("/api/crm/test-drives/").then((rows) => rows.map(fromApiTestDrive));
  },

  async scheduleTestDrive(input: Omit<TestDrive, "id">): Promise<TestDrive> {
    const created = await api<ApiTestDrive>("/api/crm/test-drives/", {
      method: "POST",
      body: JSON.stringify({
        lead: input.leadId ? Number(input.leadId) : null,
        customer: Number(input.customerId) || null,
        customer_name: input.customerName,
        vehicle: input.vehicle,
        unit: input.unitId ?? null,
        date: input.date,
        time: input.time || null,
        salesperson: input.salesperson,
        location: input.location,
        status: input.status,
        notes: input.notes,
      }),
    });
    return fromApiTestDrive(created);
  },

  async updateTestDrive(id: string, patch: Partial<TestDrive>): Promise<TestDrive> {
    const body: Record<string, unknown> = {};
    if (patch.date !== undefined) body.date = patch.date;
    if (patch.time !== undefined) body.time = patch.time || null;
    if (patch.location !== undefined) body.location = patch.location;
    if (patch.salesperson !== undefined) body.salesperson = patch.salesperson;
    if (patch.status !== undefined) body.status = patch.status;
    if (patch.notes !== undefined) body.notes = patch.notes;
    const updated = await api<ApiTestDrive>(`/api/crm/test-drives/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return fromApiTestDrive(updated);
  },

  quotations(): Promise<Quotation[]> {
    return api<ApiQuotation[]>("/api/crm/quotations/").then((rows) => rows.map(fromApiQuotation));
  },

  quotation(id: string): Promise<Quotation> {
    return api<ApiQuotation>(`/api/crm/quotations/${id}/`).then(fromApiQuotation);
  },

  quotationTotals(item: QuotationItem) {
    // Vehicle prices are always VAT-inclusive; do not add VAT on top.
    const subtotal = item.vehiclePrice + item.accessories - item.discount + item.otherCharges;
    return { subtotal, vat: 0, total: subtotal };
  },

  async saveQuotation(input: Omit<Quotation, "id"> & { id?: string }): Promise<Quotation> {
    const body = {
      lead: input.leadId ? Number(input.leadId) : null,
      customer: Number(input.customerId) || null,
      customer_name: input.customerName || "",
      company: input.company || "",
      vehicle_model: input.vehicleModelId ? Number(input.vehicleModelId) : null,
      variant: input.variantId ? Number(input.variantId) : null,
      unit: input.unitId ? Number(input.unitId) : null,
      reserved_unit: null,
      vehicle: (input.vehicle || "").slice(0, 100),
      salesperson: input.salesperson,
      salesperson_email: input.salespersonEmail || undefined,
      salesperson_phone: input.salespersonPhone || undefined,
      pan_number: input.panNumber || "",
      customer_phone: input.customerPhone || "",
      customer_address: input.customerAddress || "",
      battery_capacity: input.batteryCapacity || "",
      vehicle_length: input.vehicleLength || "",
      bank_name: input.bankName || "",
      bank_address: input.bankAddress || "",
      vehicle_description: input.vehicleDescription || "",
      transmission: input.transmission || "Automatic",
      range_km: input.rangeKm || "",
      extra_specs: (input.extraSpecs || []).filter((row) => row.label.trim() || row.value.trim()),
      version: input.version || "Commercial Electric Truck",
      charger_info: input.chargerInfo || "Support GB/T DC Fast Charger",
      quantity: input.quantity ?? 1,
      payment_terms: input.paymentTerms || "40% Down Payment & 60% Bank DO before Dispatch.",
      delivery_terms: input.deliveryTerms || "As per Client Requirement.",
      warranty_terms: input.warrantyTerms || "Company Authorized Warranty Terms.",
      insurance_terms: input.insuranceTerms || "1 Year Insurance Included in Offered Price.",
      registration_terms: input.registrationTerms || "1 Year Registration Included in Offered Price.",
      vehicle_price: input.item.vehiclePrice,
      accessories: input.item.accessories,
      discount: input.item.discount,
      vat_rate: input.item.vatRate,
      other_charges: input.item.otherCharges,
      valid_until: input.validUntil || null,
      reference_no: input.referenceNo || "",
      notes: input.notes || "",
      status: input.status,
    };
    const saved = input.id
      ? await api<ApiQuotation>(`/api/crm/quotations/${input.id}/`, { method: "PATCH", body: JSON.stringify(body) })
      : await api<ApiQuotation>("/api/crm/quotations/", { method: "POST", body: JSON.stringify(body) });
    return fromApiQuotation(saved);
  },

  async acceptQuotation(id: string): Promise<Quotation> {
    const accepted = await api<ApiQuotation>(`/api/crm/quotations/${id}/`, {
      method: "PATCH",
      body: JSON.stringify({ status: "accepted" }),
    });
    return fromApiQuotation(accepted);
  },

  async reviseQuotation(
    id: string,
    updates?: {
      customerId?: string;
      customerName?: string;
      company?: string;
      vehicleModelId?: string | null;
      variantId?: string | null;
      unitId?: string | null;
      vehicle?: string;
      salesperson?: string;
      salesperson_name?: string;
      salespersonEmail?: string;
      salespersonPhone?: string;
      item?: QuotationItem;
      validUntil?: string;
      referenceNo?: string;
      notes?: string;
      status?: QuotationStatus;
      leadId?: string | null;
    },
  ): Promise<Quotation> {
    const body = updates
      ? {
          lead: updates.leadId ? Number(updates.leadId) : null,
          customer: Number(updates.customerId) || null,
          customer_name: updates.customerName,
          company: updates.company,
          vehicle_model: updates.vehicleModelId ? Number(updates.vehicleModelId) : null,
          variant: updates.variantId ? Number(updates.variantId) : null,
          unit: updates.unitId ? Number(updates.unitId) : null,
          vehicle: updates.vehicle,
          salesperson: updates.salesperson,
          salesperson_email: updates.salespersonEmail,
          salesperson_phone: updates.salespersonPhone,
          vehicle_price: updates.item?.vehiclePrice,
          accessories: updates.item?.accessories,
          discount: updates.item?.discount,
          vat_rate: updates.item?.vatRate,
          other_charges: updates.item?.otherCharges,
          valid_until: updates.validUntil || null,
          reference_no: updates.referenceNo || "",
          notes: updates.notes || "",
          status: updates.status,
        }
      : undefined;

    const revised = await api<ApiQuotation>(`/api/crm/quotations/${id}/revise/`, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
    return fromApiQuotation(revised);
  },

  async getQuotationRevisions(id: string): Promise<Quotation[]> {
    const rows = await api<ApiQuotation[]>(`/api/crm/quotations/${id}/revisions/`);
    return rows.map(fromApiQuotation);
  },

  async downloadQuotationPdf(id: string, displayId?: string): Promise<void> {
    const token = await getValidAccessToken();
    if (!token) throw new Error("Not signed in.");
    const res = await fetch(`${API_BASE}/api/crm/quotations/${id}/pdf/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Download failed (${res.status}).`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${displayId || `QT-${id}`}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export function formatNpr(n: number): string {
  return `NPR ${n.toLocaleString("en-IN")}`;
}

export function formatDate(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${formatDate(iso)} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

export function relativeDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.round((today.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  return formatDate(iso);
}

export function amountInNepaliWords(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (n === 0) return "RUPEES ZERO ONLY /-";
  const ones = [
    "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
    "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
    "SEVENTEEN", "EIGHTEEN", "NINETEEN",
  ];
  const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

  const twoDigits = (num: number): string => {
    if (num < 20) return ones[num];
    const t = Math.floor(num / 10);
    const o = num % 10;
    return tens[t] + (o ? `-${ones[o]}` : "");
  };

  const threeDigits = (num: number): string => {
    const h = Math.floor(num / 100);
    const rem = num % 100;
    const res: string[] = [];
    if (h) res.push(`${ones[h]} HUNDRED`);
    if (rem) res.push(twoDigits(rem));
    return res.join(" ");
  };

  const crore = Math.floor(n / 10000000);
  const remCrore = n % 10000000;
  const lakh = Math.floor(remCrore / 100000);
  const remLakh = remCrore % 100000;
  const thousand = Math.floor(remLakh / 1000);
  const hundreds = remLakh % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} CRORE${crore > 1 ? "S" : ""}`);
  if (lakh) parts.push(`${twoDigits(lakh)} LAKH${lakh > 1 ? "S" : ""}`);
  if (thousand) parts.push(`${twoDigits(thousand)} THOUSAND`);
  if (hundreds) parts.push(threeDigits(hundreds));

  return `RUPEES ${parts.join(" ")} ONLY /-`;
}

