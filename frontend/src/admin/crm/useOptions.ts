// Shared option hooks for CRM dropdowns.
// Vehicle names and salesperson (user) names are loaded from the backend API
// so they always stay in sync with the Vehicle and User models.
// The hardcoded lists in ./data are only used as offline fallbacks.

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  ACTIVITY_LABELS,
  ACTIVITY_TYPES,
  CUSTOMER_TYPES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  QUOTATION_STATUSES,
  SALESPERSONS,
  STAGES,
  STAGE_LABELS,
  TEST_DRIVE_STATUSES,
  VEHICLES,
} from "./data";

// Vehicle names from the Vehicle model (`/api/vehicles/?all=1`).
export function useVehicleOptions(): string[] {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    api<{ name: string }[]>("/api/vehicles/?all=1")
      .then((data) => {
        if (!mounted || !Array.isArray(data)) return;
        const list = data.map((v) => v.name).filter(Boolean);
        if (list.length > 0) setNames(list);
      })
      .catch(() => { if (mounted) setNames(VEHICLES); });
    return () => { mounted = false; };
  }, []);

  return names;
}

// Salesperson names from the User model (`/api/users/`).
export function useUserOptions(): string[] {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    api<{ username: string }[]>("/api/users/")
      .then((data) => {
        if (!mounted || !Array.isArray(data)) return;
        const list = data.map((u) => u.username).filter(Boolean);
        if (list.length > 0) setNames(list);
      })
      .catch(() => { if (mounted) setNames(SALESPERSONS); });
    return () => { mounted = false; };
  }, []);

  return names;
}

// Keeps a form selection in sync once API options arrive:
// keeps the current value when valid, otherwise falls back to the
// stored username (for salesperson) or the first available option.
export function resolveSelection(current: string, options: string[], stored?: string | null): string {
  if (options.includes(current)) return current;
  if (stored && options.includes(stored)) return stored;
  return options[0] ?? "";
}

// ---------------------------------------------------------------------------
// CRM choice metadata loaded from `/api/crm/meta/` (sourced from the Django
// model choices). Constants in ./data are offline fallbacks only.
// ---------------------------------------------------------------------------

export type CrmMeta = {
  leadSources: string[];
  leadStatuses: string[];
  leadStatusLabels: Record<string, string>;
  customerTypes: string[];
  stages: string[];
  stageLabels: Record<string, string>;
  pipelineStages: string[];
  pipelineStageLabels: Record<string, string>;
  pipelineSummary: Record<string, number>;
  testDriveStatuses: string[];
  quotationStatuses: string[];
  activityTypes: string[];
  activityLabels: Record<string, string>;
  enquiryStatuses: string[];
  enquiryStatusLabels: Record<string, string>;
  enquiryTypes: string[];
  enquiryTypeLabels: Record<string, string>;
};

const FALLBACK_META: CrmMeta = {
  leadSources: [...LEAD_SOURCES],
  leadStatuses: [...LEAD_STATUSES],
  leadStatusLabels: { new: "New", contacted: "Contacted", qualified: "Qualified", converted: "Converted", lost: "Lost" },
  customerTypes: [...CUSTOMER_TYPES],
  stages: [...STAGES],
  stageLabels: { ...STAGE_LABELS },
  pipelineStages: ["new", "contacted", "test_drive", "quotation", "negotiation", "won", "lost"],
  pipelineStageLabels: {
    new: "New Lead",
    contacted: "Contacted",
    test_drive: "Test Drive",
    quotation: "Quotation",
    negotiation: "Negotiation",
    won: "Won / Sold",
    lost: "Lost",
  },
  pipelineSummary: {
    new: 0,
    contacted: 0,
    test_drive: 0,
    quotation: 0,
    negotiation: 0,
    won: 0,
    lost: 0,
  },
  testDriveStatuses: [...TEST_DRIVE_STATUSES],
  quotationStatuses: [...QUOTATION_STATUSES],
  activityTypes: [...ACTIVITY_TYPES],
  activityLabels: { ...ACTIVITY_LABELS },
  enquiryStatuses: ["new", "in_progress", "closed"],
  enquiryStatusLabels: { new: "New", in_progress: "In Progress", closed: "Closed" },
  enquiryTypes: ["contact", "test_drive", "quote"],
  enquiryTypeLabels: { contact: "Contact", test_drive: "Test Drive", quote: "Quote Request" },
};

function normalizeMeta(data: Record<string, unknown>): CrmMeta {
  const arr = (v: unknown, fallback: string[]): string[] =>
    Array.isArray(v) ? v.map(String).filter(Boolean) : fallback;
  const rec = (v: unknown, fallback: Record<string, string>): Record<string, string> => {
    if (!v || typeof v !== "object") return fallback;
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = String(val);
    return out;
  };
  return {
    leadSources: arr(data.lead_sources, FALLBACK_META.leadSources),
    leadStatuses: arr(data.lead_statuses, FALLBACK_META.leadStatuses),
    leadStatusLabels: rec(data.lead_status_labels, FALLBACK_META.leadStatusLabels),
    customerTypes: arr(data.customer_types, FALLBACK_META.customerTypes),
    stages: arr(data.stages, FALLBACK_META.stages),
    stageLabels: rec(data.stage_labels, FALLBACK_META.stageLabels),
    pipelineStages: arr(data.pipeline_stages, FALLBACK_META.pipelineStages),
    pipelineStageLabels: rec(data.pipeline_stage_labels, FALLBACK_META.pipelineStageLabels),
    pipelineSummary: (data.pipeline_summary as Record<string, number>) || FALLBACK_META.pipelineSummary,
    testDriveStatuses: arr(data.test_drive_statuses, FALLBACK_META.testDriveStatuses),
    quotationStatuses: arr(data.quotation_statuses, FALLBACK_META.quotationStatuses),
    activityTypes: arr(data.activity_types, FALLBACK_META.activityTypes),
    activityLabels: rec(data.activity_labels, FALLBACK_META.activityLabels),
    enquiryStatuses: arr(data.enquiry_statuses, FALLBACK_META.enquiryStatuses),
    enquiryStatusLabels: rec(data.enquiry_status_labels, FALLBACK_META.enquiryStatusLabels),
    enquiryTypes: arr(data.enquiry_types, FALLBACK_META.enquiryTypes),
    enquiryTypeLabels: rec(data.enquiry_type_labels, FALLBACK_META.enquiryTypeLabels),
  };
}

export function useCrmMeta(refreshKey = 0): CrmMeta {
  const [meta, setMeta] = useState<CrmMeta>(FALLBACK_META);

  useEffect(() => {
    let mounted = true;
    api<Record<string, unknown>>("/api/crm/meta/")
      .then((data) => {
        if (mounted) setMeta(normalizeMeta(data));
      })
      .catch(() => { /* keep fallback */ });
    return () => { mounted = false; };
  }, [refreshKey]);

  return meta;
}
