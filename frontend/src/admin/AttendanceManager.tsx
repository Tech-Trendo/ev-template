import { useEffect, useState } from "react";
import { CheckCircle2, Clock, X, Search, Download } from "lucide-react";
import { api, ApiError, API_BASE, getValidAccessToken } from "@/lib/api";
import { useAuth } from "./AuthContext";
import { Badge, inputCls, Field, SelectField, useToast } from "./crm/ui";

type AttendanceRow = {
  id: number;
  user: number;
  username: string;
  full_name: string;
  timestamp: string;
  type: string;
  confidence_score: number | null;
  device: string;
  location: string;
};

type StaffUser = { id: number; username: string; first_name: string; last_name: string };

function displayName(u: StaffUser) {
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function localDateTimeValue(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function downloadCsv(path: string, filename: string) {
  const token = await getValidAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function RecordAttendanceCard({
  users,
  onMarked,
}: {
  users: StaffUser[];
  onMarked: () => void;
}) {
  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState<"check_in" | "check_out">("check_in");
  const [when, setWhen] = useState(localDateTimeValue);
  const [location, setLocation] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { push: toast } = useToast();

  const save = async () => {
    if (!userId) {
      setError("Choose the staff member whose attendance you are recording.");
      return;
    }
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const data = await api<AttendanceRow>("/api/attendance/records/", {
        method: "POST",
        body: JSON.stringify({
          user: Number(userId),
          type: kind,
          timestamp: new Date(when).toISOString(),
          device: "HR manual entry",
          location: location.trim(),
        }),
      });
      const staff = users.find((u) => String(u.id) === userId);
      const msg = `${kind === "check_in" ? "Check in" : "Check out"} recorded for ${staff ? displayName(staff) : "staff"} at ${fmtDateTime(data.timestamp)}`;
      setMessage(msg);
      toast(msg);
      onMarked();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not record attendance";
      setError(msg);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="bg-white border border-[#E8E8E5] rounded-2xl p-6 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-10 h-10 rounded-full bg-[#00AAEB] text-white flex items-center justify-center shrink-0">
          <Clock size={18} />
        </span>
        <div>
          <h2 className="text-[16px] font-black text-[#04314A]">Record attendance</h2>
          <p className="text-[12px] text-[#737373]">HR records check-in and check-out for staff. Staff cannot mark their own attendance.</p>
        </div>
      </div>

      {error && <p className="mb-3 text-[12px] text-[#04314A] bg-[#F7F7F5] border-l-2 border-[#00AAEB] px-3.5 py-2.5 rounded-r-xl">{error}</p>}
      {message && (
        <p className="mb-3 text-[12px] text-[#04314A] bg-white border border-[#E8E8E5] px-3.5 py-2.5 rounded-xl flex items-center gap-2 font-medium">
          <CheckCircle2 size={14} className="text-[#00AAEB]" /> {message}
        </p>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <Field label="Staff">
          <SelectField
            value={userId}
            onChange={setUserId}
            options={[
              { value: "", label: "Select staff…" },
              ...users.map((u) => ({ value: String(u.id), label: displayName(u) })),
            ]}
          />
        </Field>
        <Field label="Type">
          <SelectField
            value={kind}
            onChange={(v) => setKind(v as "check_in" | "check_out")}
            options={[
              { value: "check_in", label: "Check In" },
              { value: "check_out", label: "Check Out" },
            ]}
          />
        </Field>
        <Field label="Date and time">
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Location">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Office or site"
            className={inputCls}
          />
        </Field>
      </div>
      <button
        onClick={save}
        disabled={working}
        className="mt-4 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[#04314A] text-white text-[12px] font-bold tracking-[0.06em] uppercase hover:bg-[#00AAEB] transition-colors disabled:opacity-50"
      >
        {working ? "Saving…" : "Save attendance"}
      </button>
    </div>
  );
}

export default function AttendanceManager() {
  const { isSuperAdmin, hasPerm, me } = useAuth();
  const canManage = isSuperAdmin || hasPerm("attendance.manage_attendance");
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { push: toast, node: toastNode } = useToast();

  useEffect(() => {
    if (!canManage) return;
    api<StaffUser[]>("/api/users/").then((d) => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
  }, [canManage]);

  const loadLogs = () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (canManage && userFilter) params.set("user", userFilter);
    if (typeFilter) params.set("type", typeFilter);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const qs = params.toString();
    api<AttendanceRow[] | { results: AttendanceRow[] }>(`/api/attendance/records/${qs ? `?${qs}` : ""}`)
      .then((data) => setRows(Array.isArray(data) ? data : (data.results ?? [])))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load attendance log"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userFilter, typeFilter, dateFrom, dateTo, canManage]);

  const filteredRows = searchInput.trim()
    ? rows.filter((r) => {
        const q = searchInput.trim().toLowerCase();
        return (
          r.username.toLowerCase().includes(q) ||
          r.full_name.toLowerCase().includes(q) ||
          (r.location || "").toLowerCase().includes(q)
        );
      })
    : rows;

  const exportCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (userFilter) params.set("user", userFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const qs = params.toString();
      await downloadCsv(`/api/attendance/records/export/${qs ? `?${qs}` : ""}`, "attendance-export.csv");
      toast("Attendance CSV downloaded");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Export failed");
    }
  };

  if (!canManage) {
    return (
      <div className="max-w-lg bg-white border border-[#E8E8E5] rounded-2xl p-8">
        <h1 className="text-[22px] font-black text-[#04314A]">Attendance</h1>
        <p className="text-[13px] text-[#737373] mt-2 leading-relaxed">
          Attendance is recorded by HR. You cannot add your own check-in or check-out.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[36px] font-black tracking-tight text-[#04314A] leading-none">Attendance.</h1>
          <p className="text-[13px] text-[#737373] mt-2">
            HR records check-in and check-out for staff. Face attendance is not used.
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[#04314A] text-white text-[12px] font-semibold tracking-[0.06em] uppercase hover:bg-[#00AAEB] transition-colors shrink-0"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      <RecordAttendanceCard users={users} onMarked={loadLogs} />

      {error && (
        <p className="mb-4 text-[13px] text-[#00AAEB] bg-[#00AAEB]/5 border-l-2 border-[#00AAEB] px-3 py-2 rounded-r-lg flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError("")} className="w-7 h-7 flex items-center justify-center text-[#737373] hover:text-[#04314A] shrink-0">
            <X size={14} />
          </button>
        </p>
      )}

      <div className="flex flex-col gap-3 mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B0B0AA]" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Filter by name or location…"
              className="w-full border border-[#E8E8E5] rounded-xl bg-white pl-10 pr-4 py-2.5 text-[13px] font-medium text-[#04314A] placeholder:text-[#B0B0AA] focus:outline-none focus:border-[#00AAEB] transition-colors"
            />
          </div>
          <div className="w-full sm:w-48">
            <SelectField
              value={userFilter}
              onChange={setUserFilter}
              options={[{ value: "", label: "All staff" }, ...users.map((u) => ({ value: String(u.id), label: displayName(u) }))]}
            />
          </div>
          <div className="w-full sm:w-44">
            <SelectField
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: "", label: "In + Out" },
                { value: "check_in", label: "Check In" },
                { value: "check_out", label: "Check Out" },
              ]}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={`${inputCls} !w-auto text-[12px]`} />
          <span className="text-[12px] text-[#B0B0AA]">→</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={`${inputCls} !w-auto text-[12px]`} />
          <span className="ml-auto text-[12px] font-semibold text-[#737373] whitespace-nowrap">
            {filteredRows.length} record{filteredRows.length === 1 ? "" : "s"}
            {me ? ` · @${me.username}` : ""}
          </span>
        </div>
      </div>

      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[720px]">
            <thead>
              <tr className="border-b border-[#E8E8E5]">
                {["Staff", "Date & Time", "Type", "Location", "Recorded as"].map((h) => (
                  <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-[13px] text-[#737373]">Loading…</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center">
                    <Clock size={22} className="mx-auto mb-3 text-[#B0B0AA]" />
                    <p className="text-[13px] text-[#737373]">No attendance records match your filters.</p>
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.id} className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8]">
                    <td className="px-5 py-3.5">
                      <div className="text-[13px] font-bold text-[#04314A]">{r.full_name}</div>
                      <div className="text-[11px] text-[#737373]">@{r.username}</div>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                      {fmtDateTime(r.timestamp)}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge status={r.type} />
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373]">{r.location || "—"}</td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373]">{r.device || "HR manual entry"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {toastNode}
    </div>
  );
}
