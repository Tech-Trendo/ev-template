import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Save, Send } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAuth } from "../AuthContext";
import {
  completePdi,
  fetchActiveChecklist,
  fetchPdi,
  fetchUnit,
  openInspectionPath,
  savePdiDraft,
  submitPdi,
  unitStartPdi,
  unitStartVei,
  uploadPdiResultPhoto,
  type ChecklistTemplate,
  type InspectionType,
  type OverallRating,
  type PdiInspection,
  type UnitDetail,
} from "@/lib/inventory";
import { Field, inputCls, Modal, useToast } from "../crm/ui";
import ChecklistSection, { type CheckValue } from "./ChecklistSection";

const paperRowLabel =
  "shrink-0 text-[11px] font-bold tracking-[0.06em] uppercase text-[#0B3D2B] whitespace-nowrap";
const paperInput =
  "flex-1 min-w-[8rem] bg-transparent border-0 border-b border-[#D4D4CE] rounded-none px-0 py-1 text-[13px] font-semibold text-[#0B3D2B] placeholder:text-[#B0B0AA] focus:outline-none focus:border-[#10B981]";
const paperInputReadOnly = `${paperInput} border-[#E8E8E5] cursor-default`;

function PaperFieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 flex-wrap sm:flex-nowrap">
      <span className={paperRowLabel}>{label}:</span>
      <div className="flex flex-1 min-w-[10rem] items-baseline gap-2 flex-wrap">{children}</div>
    </div>
  );
}

type Header = {
  ev_company_name: string;
  vin_chassis_no: string;
  model_snapshot: string;
  battery_power_snapshot: string;
  motor_power_snapshot: string;
  motor_no_snapshot: string;
  manufacture_date_snapshot: string;
  color_snapshot: string;
  odometer_km_snapshot: string;
  inspection_date: string;
  checked_by: string;
  overall_rating: OverallRating | "";
};

export default function PDIForm({
  unitId,
  pdiId,
  initialType = "PDI",
  onNavigate,
}: {
  unitId: string;
  pdiId: string; // "new" or inspection id
  initialType?: InspectionType;
  onNavigate: (p: string) => void;
}) {
  const { me } = useAuth();
  const isNew = pdiId === "new";
  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [inspection, setInspection] = useState<PdiInspection | null>(null);
  const [header, setHeader] = useState<Header | null>(null);
  const [values, setValues] = useState<Record<number, CheckValue>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const toast = useToast();
  const editGen = useRef(0);
  const savedGen = useRef(0);
  const submittingRef = useRef(false);
  const saveLock = useRef(Promise.resolve());
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const stateRef = useRef({
    header: null as Header | null,
    values: {} as Record<number, CheckValue>,
    inspection: null as PdiInspection | null,
    unit: null as UnitDetail | null,
    isVei: initialType === "VEI",
  });

  const touch = () => {
    editGen.current += 1;
  };

  const runSave = <T,>(fn: () => Promise<T>) => {
    const run = saveLock.current.then(fn, fn);
    saveLock.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const isVei = inspection ? inspection.inspection_type === "VEI" : initialType === "VEI";
  stateRef.current = { header, values, inspection, unit, isVei };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (isNew ? Promise.resolve(null) : fetchPdi(pdiId))
      .then(async (pdi) => {
        const inspType: InspectionType = pdi ? pdi.inspection_type : (initialType || "PDI");
        const [u, t] = await Promise.all([
          fetchUnit(unitId),
          // Same checklist form for VEI and PDI — only the document/URL differs.
          fetchActiveChecklist("PDI"),
        ]);
        if (cancelled) return;
        if (!pdi) {
          const route = openInspectionPath(u.id, inspType, u.pdi_history);
          if (route) {
            onNavigate(route);
            return;
          }
        }
        setUnit(u);
        setTemplate(t);
        const initial: Record<number, CheckValue> = {};
        t.items.forEach((item) => {
          initial[item.id] = { result: "NA", remark: "" };
        });
        if (pdi) {
          if (pdi.status !== "DRAFT") {
            onNavigate(`units/${u.id}/${pdi.inspection_type === "VEI" ? "vei" : "pdi"}/${pdi.id}`);
            return;
          }
          setInspection(pdi);
          setHeader({
            ev_company_name: pdi.ev_company_name || "EV OS",
            vin_chassis_no: pdi.vin_chassis_no,
            model_snapshot: pdi.model_snapshot,
            battery_power_snapshot: pdi.battery_power_snapshot,
            motor_power_snapshot: pdi.motor_power_snapshot,
            motor_no_snapshot: pdi.motor_no_snapshot,
            manufacture_date_snapshot: pdi.manufacture_date_snapshot ?? "",
            color_snapshot: pdi.color_snapshot,
            odometer_km_snapshot: String(pdi.odometer_km_snapshot),
            inspection_date: pdi.inspection_date,
            checked_by: pdi.checked_by || "SHAILENDRA KUMAR YADAV",
            overall_rating: pdi.overall_rating ?? "",
          });
          pdi.results.forEach((r) => {
            initial[r.item] = {
              result: r.result,
              remark: r.remark,
              photoUrl: r.photo_display || undefined,
            };
          });
        } else {
          const meName =
            me && (me.first_name || me.last_name)
              ? `${me.first_name} ${me.last_name}`.trim()
              : (me?.username ?? "");
          setHeader({
            ev_company_name: "EV OS",
            vin_chassis_no: u.vin_chassis_no,
            model_snapshot: `${u.model_detail.brand} ${u.model_detail.model_name}`,
            battery_power_snapshot: u.effective_battery_kw ?? "",
            motor_power_snapshot: u.effective_motor_kw ?? "",
            motor_no_snapshot: u.motor_no,
            manufacture_date_snapshot: u.manufacture_date ?? "",
            color_snapshot: u.color,
            odometer_km_snapshot: String(u.odometer_km),
            inspection_date: new Date().toISOString().slice(0, 10),
            checked_by: meName || "SHAILENDRA KUMAR YADAV",
            overall_rating: "",
          });
        }
        setValues(initial);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Load failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, pdiId, initialType]);

  const patch = (p: Partial<Header>) => {
    touch();
    setHeader((h) => (h ? { ...h, ...p } : h));
  };

  const stats = useMemo(() => {
    const vals = Object.values(values);
    return {
      total: vals.length,
      ok: vals.filter((v) => v.result === "OK").length,
      notOk: vals.filter((v) => v.result === "NOT_OK").length,
      na: vals.filter((v) => v.result === "NA").length,
    };
  }, [values]);

  /** Ensure a DRAFT inspection exists, then PATCH header + results. */
  const persistDraft = async (opts?: { quiet?: boolean }): Promise<PdiInspection> => {
    const snap = stateRef.current;
    const h = snap.header;
    const u = snap.unit;
    if (!u || !h) throw new Error("Not ready");
    const genAtStart = editGen.current;
    let pdi = snap.inspection;
    if (!pdi) {
      try {
        const leaving = document.visibilityState === "hidden";
        pdi = snap.isVei ? await unitStartVei(u.id, leaving) : await unitStartPdi(u.id, leaving);
      } catch (e) {
        if (e instanceof ApiError && /already has an open/i.test(e.message)) {
          const freshUnit = await fetchUnit(u.id);
          const route = openInspectionPath(freshUnit.id, snap.isVei ? "VEI" : "PDI", freshUnit.pdi_history);
          if (route) {
            onNavigate(route);
            const redirect = new Error("redirect");
            (redirect as Error & { redirect?: boolean }).redirect = true;
            throw redirect;
          }
        }
        throw e;
      }
      stateRef.current = { ...stateRef.current, inspection: pdi };
      setInspection(pdi);
      const kind = pdi.inspection_type === "VEI" ? "vei" : "pdi";
      const next = window.location.pathname.replace(/\/(pdi|vei)\/new\/?$/, `/${kind}/${pdi.id}/edit`);
      if (next !== window.location.pathname) window.history.replaceState({}, "", next);
    }
    const body: Record<string, unknown> = {
      ev_company_name: h.ev_company_name,
      vin_chassis_no: h.vin_chassis_no,
      model_snapshot: h.model_snapshot,
      battery_power_snapshot: h.battery_power_snapshot,
      motor_power_snapshot: h.motor_power_snapshot,
      motor_no_snapshot: h.motor_no_snapshot,
      manufacture_date_snapshot: h.manufacture_date_snapshot || null,
      color_snapshot: h.color_snapshot,
      odometer_km_snapshot: Number(h.odometer_km_snapshot) || 0,
      inspection_date: h.inspection_date,
      checked_by: h.checked_by,
      overall_rating: h.overall_rating || null,
      results_write: Object.entries(snap.values).map(([item, v]) => ({
        item: Number(item),
        result: v.result,
        remark: v.remark,
      })),
    };
    pdi = await savePdiDraft(pdi.id, body, document.visibilityState === "hidden");
    stateRef.current = { ...stateRef.current, inspection: pdi };
    setInspection(pdi);

    for (const [itemId, v] of Object.entries(snap.values)) {
      if (!v.photoFile) continue;
      const file = v.photoFile;
      try {
        const updated = await uploadPdiResultPhoto(pdi.id, Number(itemId), file);
        setValues((prev) => {
          const cur = prev[Number(itemId)];
          if (!cur || cur.photoFile !== file) return prev;
          return {
            ...prev,
            [itemId]: {
              ...cur,
              photoFile: null,
              photoPreview: undefined,
              photoUrl: updated.photo_display || undefined,
            },
          };
        });
      } catch {
        // Photo failures must not lose the draft — the next save retries.
      }
    }

    if (editGen.current !== genAtStart) return pdi;
    savedGen.current = genAtStart;
    if (opts?.quiet) return pdi;

    const fresh = await fetchPdi(pdi.id);
    setInspection(fresh);
    stateRef.current = { ...stateRef.current, inspection: fresh };
    const next: Record<number, CheckValue> = { ...snap.values };
    fresh.results.forEach((r) => {
      next[r.item] = {
        result: r.result,
        remark: r.remark,
        photoUrl: r.photo_display || undefined,
      };
    });
    setValues(next);
    return fresh;
  };

  flushRef.current = async () => {
    if (submittingRef.current) return;
    if (editGen.current === savedGen.current) return;
    if (!stateRef.current.header || !stateRef.current.unit) return;
    try {
      await runSave(async () => {
        if (submittingRef.current || editGen.current === savedGen.current) return;
        await persistDraft({ quiet: true });
      });
    } catch (e) {
      if (e instanceof Error && (e as Error & { redirect?: boolean }).redirect) return;
      setError(e instanceof ApiError ? e.message : "Save failed");
      throw e;
    }
  };

  useEffect(() => {
    if (loading || !header) return;
    if (editGen.current === savedGen.current) return;
    const t = window.setTimeout(() => {
      void flushRef.current().catch(() => undefined);
    }, 800);
    return () => window.clearTimeout(t);
  }, [header, values, loading]);

  useEffect(() => {
    const leave = () => {
      void flushRef.current().catch(() => undefined);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") leave();
    };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", onHide);
      leave();
    };
  }, []);

  const saveDraft = async () => {
    setBusy(true);
    setError("");
    try {
      const pdi = await runSave(() => persistDraft());
      toast.push(`Draft saved (${pdi.pdi_no})`);
      if (isNew) onNavigate(`units/${unit!.id}/${isVei ? "vei" : "pdi"}/${pdi.id}/edit`);
    } catch (e) {
      if (e instanceof Error && (e as Error & { redirect?: boolean }).redirect) return;
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const doSubmit = async () => {
    if (!header) return;
    if (!header.overall_rating) {
      setError("Select an Overall Rating before submitting.");
      setConfirmSubmit(false);
      return;
    }
    if (!header.checked_by.trim()) {
      setError("Check Staff / Representative is required.");
      setConfirmSubmit(false);
      return;
    }
    const missingRemark = template?.items.find(
      (i) => values[i.id]?.result === "NOT_OK" && !values[i.id]?.remark.trim(),
    );
    if (missingRemark) {
      setError(`Add a defect remark for “${missingRemark.label}”.`);
      setConfirmSubmit(false);
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    setError("");
    try {
      const pdi = await runSave(() => persistDraft());
      const submitted = await completePdi(pdi.id, {
        overall_rating: header.overall_rating,
        checked_by: header.checked_by,
      });
      savedGen.current = editGen.current;
      toast.push(
        `${isVei ? "VEI" : "PDI"} ${submitted.pdi_no} completed — vehicle ${submitted.not_ok_count || header.overall_rating === "POOR" ? "FAILED" : "PASSED"}`,
      );
      onNavigate(`units/${unit!.id}/${isVei ? "vei" : "pdi"}/${submitted.id}`);
    } catch (e) {
      if (!(e instanceof Error && (e as Error & { redirect?: boolean }).redirect)) {
        setError(e instanceof ApiError ? e.message : "Submit failed");
      }
    } finally {
      submittingRef.current = false;
      setBusy(false);
      setConfirmSubmit(false);
    }
  };

  if (loading || !header || !template || !unit) {
    return (
      <div className="py-24 text-center text-[13px] text-[#737373]">
        {error ? (
          <>
            <p className="font-bold text-[#0B3D2B] mb-2">Couldn&apos;t load PDI form</p>
            <p className="mb-4">{error}</p>
            <button
              onClick={() => onNavigate(`units/${unitId}`)}
              className="px-6 py-3 rounded-full bg-[#0B3D2B] text-white text-[12px] font-semibold"
            >
              Back to Unit
            </button>
          </>
        ) : (
          "Loading PDI form…"
        )}
      </div>
    );
  }

  return (
    <div className="w-full pb-16">
      <button
        onClick={() => {
          void flushRef.current()
            .then(() => onNavigate(`units/${unit.id}`))
            .catch(() => undefined);
        }}
        className="flex items-center gap-1.5 text-[12px] font-semibold text-[#737373] hover:text-[#10B981] transition-colors mb-4"
      >
        <ArrowLeft size={14} /> Back to Unit
      </button>

      <div className="bg-white border border-[#E8E8E5] rounded-2xl p-5 sm:p-7">
        <div className="text-center pb-5 mb-6 border-b-2 border-[#0B3D2B]">
          <p className="text-[13px] sm:text-[15px] font-black tracking-[0.18em] uppercase text-[#0B3D2B]">
            EV OS
          </p>
          <h1 className="text-[18px] sm:text-[22px] font-black tracking-tight text-[#0B3D2B] mt-1">
            PRE-DELIVERY INSPECTION/VEHICLE DELIVERY CHECK LIST
          </h1>
        </div>

        {error && (
          <p className="mb-4 text-[13px] text-[#10B981] bg-[#10B981]/5 border-l-2 border-[#10B981] px-3 py-2">
            {error}
          </p>
        )}

        <table className="w-full mb-8 border-collapse text-left">
          <tbody>
            <tr className="align-top">
              <td className="w-1/2 py-2.5 pr-4 sm:pr-8">
                <PaperFieldRow label="EV Company Name">
                  <input
                    value={header.ev_company_name}
                    onChange={(e) => patch({ ev_company_name: e.target.value })}
                    className={paperInput}
                  />
                </PaperFieldRow>
              </td>
              <td className="w-1/2 py-2.5">
                <PaperFieldRow label="PDI No. / Date">
                  <input
                    value={inspection?.pdi_no ?? ""}
                    readOnly
                    tabIndex={-1}
                    placeholder="—"
                    className={`${paperInputReadOnly} max-w-[9rem]`}
                  />
                  <input
                    type="date"
                    value={header.inspection_date}
                    onChange={(e) => patch({ inspection_date: e.target.value })}
                    className={`${paperInput} max-w-[10rem]`}
                  />
                </PaperFieldRow>
              </td>
            </tr>
            <tr className="align-top">
              <td className="py-2.5 pr-4 sm:pr-8">
                <PaperFieldRow label="VIN / Chassis No.">
                  <input
                    value={header.vin_chassis_no}
                    onChange={(e) => patch({ vin_chassis_no: e.target.value })}
                    className={paperInput}
                  />
                </PaperFieldRow>
              </td>
              <td className="py-2.5">
                <PaperFieldRow label="Manufacture Date">
                  <input
                    type="date"
                    value={header.manufacture_date_snapshot}
                    onChange={(e) => patch({ manufacture_date_snapshot: e.target.value })}
                    className={paperInput}
                  />
                </PaperFieldRow>
              </td>
            </tr>
            <tr className="align-top">
              <td className="py-2.5 pr-4 sm:pr-8">
                <PaperFieldRow label="Model & Battery Power (kW)">
                  <input
                    value={header.model_snapshot}
                    readOnly
                    tabIndex={-1}
                    className={`${paperInputReadOnly} min-w-[6rem]`}
                  />
                  <input
                    value={header.battery_power_snapshot}
                    onChange={(e) => patch({ battery_power_snapshot: e.target.value })}
                    placeholder="kW"
                    className={`${paperInput} max-w-[4.5rem] text-center`}
                  />
                </PaperFieldRow>
              </td>
              <td className="py-2.5">
                <PaperFieldRow label="Vehicle Color">
                  <input
                    value={header.color_snapshot}
                    onChange={(e) => patch({ color_snapshot: e.target.value })}
                    className={paperInput}
                  />
                </PaperFieldRow>
              </td>
            </tr>
            <tr className="align-top">
              <td className="py-2.5 pr-4 sm:pr-8">
                <PaperFieldRow label="Motor Power (kW) / Motor No.">
                  <input
                    value={header.motor_power_snapshot}
                    onChange={(e) => patch({ motor_power_snapshot: e.target.value })}
                    placeholder="kW"
                    className={`${paperInput} max-w-[4.5rem] text-center`}
                  />
                  <input
                    value={header.motor_no_snapshot}
                    onChange={(e) => patch({ motor_no_snapshot: e.target.value })}
                    className={paperInput}
                  />
                </PaperFieldRow>
              </td>
              <td className="py-2.5">
                <PaperFieldRow label="Vehicle Run (KM)">
                  <input
                    value={header.odometer_km_snapshot}
                    onChange={(e) => patch({ odometer_km_snapshot: e.target.value })}
                    inputMode="numeric"
                    className={paperInput}
                  />
                </PaperFieldRow>
              </td>
            </tr>
          </tbody>
        </table>

        <ChecklistSection
          items={template.items}
          sectionLabels={template.section_labels}
          values={values}
          onChange={(itemId, value) => {
            touch();
            setValues((prev) => ({ ...prev, [itemId]: value }));
          }}
        />

        <div className="grid sm:grid-cols-2 gap-6 mt-8 pt-6 border-t border-[#E8E8E5]">
          <div className="flex gap-2">
            {(
              [
                ["VERY_GOOD", "Very Good"],
                ["GOOD", "Good"],
                ["POOR", "Poor"],
              ] as [OverallRating, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => patch({ overall_rating: v })}
                className={`flex-1 py-2.5 rounded-xl border text-[12px] font-bold transition-all ${
                  header.overall_rating === v
                    ? "bg-[#0B3D2B] text-white border-[#0B3D2B]"
                    : "bg-white text-[#737373] border-[#E8E8E5] hover:border-[#0B3D2B]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            <Field label="Check Staff / Representative" required>
              <input value={header.checked_by} onChange={(e) => patch({ checked_by: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Date">
              <input type="date" value={header.inspection_date} onChange={(e) => patch({ inspection_date: e.target.value })} className={inputCls} />
            </Field>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center justify-end mt-6 pt-5 border-t border-[#E8E8E5]">
          <button
            onClick={saveDraft}
            disabled={busy}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-[#0B3D2B] text-[#0B3D2B] text-[12px] font-bold tracking-[0.06em] uppercase hover:bg-[#0B3D2B] hover:text-white transition-colors disabled:opacity-50"
          >
            <Save size={14} /> {busy ? "Saving…" : "Save Draft"}
          </button>
          <button
            onClick={() => setConfirmSubmit(true)}
            disabled={busy}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#10B981] text-white text-[12px] font-bold tracking-[0.06em] uppercase hover:bg-[#0B3D2B] transition-colors disabled:opacity-50"
          >
            <Send size={14} /> Submit PDI
          </button>
        </div>
      </div>

      {confirmSubmit && (
        <Modal title="Submit PDI?" onClose={() => setConfirmSubmit(false)}>
          <p className="text-[13px] text-[#737373] leading-relaxed mb-2">
            {stats.notOk > 0 || header.overall_rating === "POOR" ? (
              <>
                This inspection has{" "}
                <span className="font-bold text-[#8B0000]">{stats.notOk} Not OK item(s)</span>{" "}
                — the vehicle will move to{" "}
                <span className="font-bold text-[#0B3D2B]">PDI Failed</span>.
              </>
            ) : (
              <>
                All clear — the vehicle will move to{" "}
                <span className="font-bold text-[#0B3D2B]">PDI Passed</span>.
              </>
            )}
          </p>
          <p className="text-[13px] text-[#737373] mb-6">
            Submitted inspections are locked from further edits.
          </p>
          <div data-modal-actions className="flex gap-3 justify-end">
            <button
              onClick={() => setConfirmSubmit(false)}
              className="px-6 py-2.5 border border-[#E8E8E5] rounded-full text-[12px] font-semibold text-[#737373] hover:border-[#0B3D2B] hover:text-[#0B3D2B] transition-colors"
            >
              Review
            </button>
            <button
              onClick={doSubmit}
              disabled={busy}
              className="px-6 py-2.5 rounded-full bg-[#10B981] text-white text-[12px] font-semibold hover:bg-[#0B3D2B] transition-colors disabled:opacity-50"
            >
              {busy ? "Submitting…" : "Submit"}
            </button>
          </div>
        </Modal>
      )}

      {toast.node}
    </div>
  );
}
