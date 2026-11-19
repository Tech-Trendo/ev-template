"use client";

import { useState } from "react";
import { unitReserve } from "@/lib/inventory";
import { UnitPicker, type UnitOption } from "@/admin/components/pickers";
import { Field, Modal, inputCls, primaryBtnCls } from "./ui";

export function ReserveUnitModal({
  onClose,
  onSaved,
  leadId,
  leadName,
  customerId,
  customerName,
  presetUnitId,
  presetUnitVin,
}: {
  onClose: () => void;
  onSaved: (msg: string) => void;
  leadId?: string | number | null;
  leadName?: string;
  customerId?: string | number | null;
  customerName?: string;
  presetUnitId?: string | number | null;
  presetUnitVin?: string;
}) {
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(
    presetUnitId ? Number(presetUnitId) : null,
  );
  const [selectedUnit, setSelectedUnit] = useState<UnitOption | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!selectedUnitId) {
      return setError("Please select a vehicle unit to reserve.");
    }
    setSaving(true);
    try {
      await unitReserve(selectedUnitId, {
        lead: leadId ? Number(leadId) : null,
        customer: customerId ? Number(customerId) : null,
        customer_name: customerName || leadName || "",
        note: note.trim() || undefined,
      });
      onSaved(`Unit ${selectedUnit?.vin_chassis_no || presetUnitVin || selectedUnitId} reserved.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reserve unit");
      setSaving(false);
    }
  };

  return (
    <Modal title="Reserve Vehicle Unit" onClose={onClose}>
      <div className="space-y-4">
        {presetUnitId && presetUnitVin && !selectedUnit ? (
          <div className="bg-[#FAFAF8] border border-[#E8E8E5] rounded-xl p-3.5">
            <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-[#737373] mb-1">
              Proposed Unit
            </span>
            <div className="text-[13px] font-bold text-[#04314A]">
              VIN: {presetUnitVin}
            </div>
          </div>
        ) : null}

        <UnitPicker
          value={selectedUnitId}
          onChange={(id, u) => {
            setSelectedUnitId(id);
            setSelectedUnit(u);
            if (error) setError("");
          }}
          statusFilter="READY_FOR_SALE"
          label="Select Ready Unit"
          required
        />

        {(leadName || customerName) && (
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-[#737373] mb-1">
              Reserved For
            </label>
            <div className="px-3.5 py-2.5 bg-[#FAFAF8] border border-[#E8E8E5] rounded-xl text-[13px] font-semibold text-[#04314A]">
              {customerName ? `Customer: ${customerName}` : `Lead: ${leadName || leadId}`}
            </div>
          </div>
        )}

        <Field label="Reservation Notes">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. Deposit received, holding until final payment."
            className={inputCls}
          />
        </Field>

        <p className="text-[11px] text-[#737373]">
          Default reservation length can vary; check the expiry date shown. Expired reservations release the unit back to ready inventory.
        </p>

        {error && <p className="text-[12px] text-[#00AAEB]">{error}</p>}

        <div data-modal-actions className="mt-6 flex justify-end gap-3 pt-3 border-t border-[#F0F0ED]">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#737373] hover:text-[#04314A] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className={primaryBtnCls}
          >
            {saving ? "Reserving..." : "Reserve Unit"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
