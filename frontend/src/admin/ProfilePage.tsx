import { useState, useEffect } from "react";
import {
  Building2,
  Mail,
  Phone,
  ShieldCheck,
  User,
  Calendar,
  MapPin,
  Lock,
  Briefcase,
  AlertCircle,
  FileBadge,
  Activity as ActivityIcon,
  CheckCircle,
} from "lucide-react";
import { useAuth } from "./AuthContext";
import { PageHeader, Badge } from "@/components/ui";
import { api } from "@/lib/api";

function InfoRow({
  icon: Icon,
  label,
  value,
  isSensitive = false,
}: {
  icon?: typeof User;
  label: string;
  value: React.ReactNode;
  isSensitive?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 py-3 border-b border-[#E8E8E5] last:border-0 dark:border-[#174261]">
      <span className="text-[11px] font-semibold text-[#737373] dark:text-[#94A3B8] inline-flex items-center gap-1.5">
        {Icon && <Icon size={13} className="text-[#00AAEB]" />}
        {label}
        {isSensitive && (
          <span title="Sensitive field">
            <Lock size={11} className="text-[#A3A39E]" />
          </span>
        )}
      </span>
      <div className="text-[13px] font-medium text-[#04314A] dark:text-[#F7F7F5]">
        {value || <span className="text-[#A3A39E] font-normal">Not provided</span>}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { me } = useAuth();
  const [activeTab, setActiveTab] = useState<"profile" | "activity">("profile");
  const [myActivity, setMyActivity] = useState<any>(null);
  const [loadingActivity, setLoadingActivity] = useState(false);

  useEffect(() => {
    if (activeTab === "activity" && !myActivity) {
      setLoadingActivity(true);
      api<any>("/api/performance/my-activity/")
        .then((res) => setMyActivity(res))
        .catch(() => {})
        .finally(() => setLoadingActivity(false));
    }
  }, [activeTab, myActivity]);

  if (!me) return null;

  const fullName = [me.first_name, me.last_name].filter(Boolean).join(" ") || me.username;
  const initial = (fullName.trim()[0] ?? "?").toUpperCase();

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="My Profile"
        subtitle="View your employee profile information and assigned roles."
        badge={
          (me.is_super_admin || me.is_superuser) ? (
            <Badge variant="info">Super Admin</Badge>
          ) : me.employment_status ? (
            <Badge variant={me.employment_status === "active" ? "success" : "warning"}>
              {me.employment_status}
            </Badge>
          ) : null
        }
      />

      <div className="flex gap-2 border-b border-[#E8E8E5] pb-2 dark:border-[#174261]">
        <button
          onClick={() => setActiveTab("profile")}
          className={`px-4 py-2 rounded-lg text-[12px] font-bold uppercase tracking-wider transition-colors ${
            activeTab === "profile"
              ? "bg-[#04314A] text-white"
              : "bg-[#F7F7F5] text-[#737373] hover:text-[#04314A] dark:bg-[#0B2538] dark:text-[#94A3B8]"
          }`}
        >
          Profile Details
        </button>
        <button
          onClick={() => setActiveTab("activity")}
          className={`px-4 py-2 rounded-lg text-[12px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 ${
            activeTab === "activity"
              ? "bg-[#04314A] text-white"
              : "bg-[#F7F7F5] text-[#737373] hover:text-[#04314A] dark:bg-[#0B2538] dark:text-[#94A3B8]"
          }`}
        >
          <ActivityIcon size={14} /> My Activity
        </button>
      </div>

      {activeTab === "profile" ? (
        <>
          {/* Profile Summary Card */}
      <div className="bg-white border border-[#E8E8E5] rounded-xl p-5 sm:p-6 dark:bg-[#0B2538] dark:border-[#174261]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#E8E8E5] dark:border-[#174261]">
          <div className="flex items-center gap-4">
            {me.photo_url ? (
              <img
                src={me.photo_url}
                alt={fullName}
                className="w-14 h-14 rounded-full object-cover border border-[#E8E8E5] dark:border-[#174261] shrink-0"
              />
            ) : (
              <span className="w-14 h-14 rounded-full bg-[#04314A] text-white flex items-center justify-center text-[20px] font-semibold shrink-0 select-none">
                {initial}
              </span>
            )}
            <div>
              <h2 className="text-[18px] font-semibold text-[#04314A] dark:text-[#F7F7F5]">
                {fullName}
              </h2>
              <p className="text-[12px] text-[#737373] dark:text-[#94A3B8]">
                @{me.username} · {me.designation || "Staff Member"} {me.department && `(${me.department})`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {me.role_names?.map((role) => (
              <Badge key={role} variant="neutral">
                {role}
              </Badge>
            ))}
          </div>
        </div>

        {/* Structured Sections Grid */}
        <div className="grid md:grid-cols-2 gap-8 pt-5">
          {/* Section 1: Account & Contact */}
          <div className="space-y-1">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#00AAEB] mb-3">
              Account & Contact
            </h3>
            <InfoRow icon={Mail} label="Work Email" value={me.email} />
            <InfoRow icon={Phone} label="Work / Mobile Phone" value={me.phone} />
            <InfoRow icon={Mail} label="Personal Email" value={me.personal_email} />
            <InfoRow
              icon={Building2}
              label="Assigned Dealership"
              value={me.dealer_name || "Head Office / All Dealers"}
            />
          </div>

          {/* Section 2: Employment */}
          <div className="space-y-1">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#00AAEB] mb-3">
              Employment Details
            </h3>
            <InfoRow icon={Briefcase} label="Department" value={me.department} />
            <InfoRow icon={Briefcase} label="Designation" value={me.designation} />
            <InfoRow
              icon={Calendar}
              label="Join Date"
              value={me.join_date ? new Date(me.join_date).toLocaleDateString() : null}
            />
            <InfoRow
              icon={ShieldCheck}
              label="Employment Status"
              value={
                <Badge variant={me.employment_status === "active" ? "success" : "warning"}>
                  {me.employment_status || "Active"}
                </Badge>
              }
            />
          </div>

          {/* Section 3: Addresses */}
          <div className="space-y-1">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#00AAEB] mb-3">
              Addresses
            </h3>
            <InfoRow icon={MapPin} label="Current / Temporary Address" value={me.temporary_address} />
            <InfoRow icon={MapPin} label="Permanent Address" value={me.permanent_address} />
          </div>

          {/* Section 4: Sensitive Government ID */}
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#00AAEB]">
                Government Identification
              </h3>
              {!me.can_view_sensitive && (
                <span className="text-[10px] text-[#A3A39E] flex items-center gap-1">
                  <Lock size={10} /> Masked (Restricted)
                </span>
              )}
            </div>
            <InfoRow
              icon={Calendar}
              label="Date of Birth"
              value={me.date_of_birth}
              isSensitive={!me.can_view_sensitive}
            />
            <InfoRow
              icon={FileBadge}
              label="PAN / VAT Number"
              value={me.pan_vat_number}
              isSensitive={!me.can_view_sensitive}
            />
            <InfoRow
              icon={FileBadge}
              label="Citizenship Number"
              value={me.citizenship_number}
              isSensitive={!me.can_view_sensitive}
            />
          </div>

          {/* Section 5: Emergency Contact */}
          {(me.emergency_contact_name || me.emergency_contact_phone) && (
            <div className="space-y-1 md:col-span-2 pt-2 border-t border-[#E8E8E5] dark:border-[#174261]">
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#00AAEB] mb-3">
                Emergency Contact
              </h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <InfoRow icon={User} label="Contact Name" value={me.emergency_contact_name} />
                <InfoRow icon={Phone} label="Contact Phone" value={me.emergency_contact_phone} />
              </div>
            </div>
          )}
        </div>
      </div>

    </>
  ) : (
    /* My Activity Tab Content */
    <div className="space-y-6">
      {loadingActivity ? (
        <div className="p-12 text-center text-[13px] text-[#737373]">
          Loading your activity statistics…
        </div>
      ) : !myActivity ? (
        <div className="p-12 text-center text-[13px] text-[#737373]">
          Unable to load activity data.
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-[#E8E8E5] rounded-xl p-5 dark:bg-[#0B2538] dark:border-[#174261]">
              <span className="text-[10px] font-bold tracking-wider uppercase text-[#737373] block mb-1">
                Actions Today
              </span>
              <div className="text-[24px] font-black text-[#04314A] dark:text-[#F7F7F5]">
                {myActivity.today_total || 0}
              </div>
              <span className="text-[11px] text-[#00AAEB] font-semibold mt-1 block">
                Recorded today
              </span>
            </div>

            <div className="bg-white border border-[#E8E8E5] rounded-xl p-5 dark:bg-[#0B2538] dark:border-[#174261]">
              <span className="text-[10px] font-bold tracking-wider uppercase text-[#737373] block mb-1">
                Past 30 Days
              </span>
              <div className="text-[24px] font-black text-[#04314A] dark:text-[#F7F7F5]">
                {myActivity.month_total || 0}
              </div>
              <span className="text-[11px] text-[#737373] mt-1 block">
                Total operations
              </span>
            </div>

            <div className="bg-white border border-[#E8E8E5] rounded-xl p-5 dark:bg-[#0B2538] dark:border-[#174261] col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold tracking-wider uppercase text-[#737373] block mb-1">
                Dealership
              </span>
              <div className="text-[16px] font-black text-[#04314A] dark:text-[#F7F7F5] truncate">
                {myActivity.dealer_name || "Central Office"}
              </div>
              <span className="text-[11px] text-[#737373] mt-1 block">
                {myActivity.role || "Staff"}
              </span>
            </div>
          </div>

          {/* Monthly Action Breakdown */}
          <div className="bg-white border border-[#E8E8E5] rounded-xl p-5 dark:bg-[#0B2538] dark:border-[#174261]">
            <h3 className="text-[12px] font-bold tracking-[0.1em] uppercase text-[#04314A] dark:text-[#F7F7F5] mb-4">
              Past 30 Days Breakdown
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ["Leads Created", myActivity.month_counts?.["LEAD_CREATED"] || 0],
                ["Customers Created", myActivity.month_counts?.["CUSTOMER_CREATED"] || 0],
                ["Quotations Created", myActivity.month_counts?.["QUOTATION_CREATED"] || 0],
                ["Sales Recorded", myActivity.month_counts?.["SALE_RECORDED"] || 0],
                ["Test Drives", myActivity.month_counts?.["TEST_DRIVE_COMPLETED"] || 0],
                ["Servicing Jobs", myActivity.month_counts?.["SERVICE_CREATED"] || 0],
                ["Inspections", myActivity.month_counts?.["INSPECTION_DONE"] || 0],
                ["Units Entered", myActivity.month_counts?.["UNIT_ENTERED"] || 0],
              ].map(([label, val]) => (
                <div key={label as string} className="p-3 bg-[#F7F7F5] dark:bg-[#04314A]/40 rounded-lg">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#737373] dark:text-[#94A3B8] block">
                    {label}
                  </span>
                  <span className="text-[16px] font-black text-[#04314A] dark:text-[#F7F7F5]">
                    {val}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity Timeline */}
          <div className="bg-white border border-[#E8E8E5] rounded-xl p-5 dark:bg-[#0B2538] dark:border-[#174261]">
            <h3 className="text-[12px] font-bold tracking-[0.1em] uppercase text-[#04314A] dark:text-[#F7F7F5] mb-4">
              Recent Activity Timeline
            </h3>
            {myActivity.recent_activities?.length === 0 ? (
              <p className="text-[12px] text-[#737373] py-4 text-center">
                No recent audit log activities recorded.
              </p>
            ) : (
              <div className="space-y-3">
                {myActivity.recent_activities?.map((item: any) => (
                  <div
                    key={item.id}
                    className="p-3 border border-[#E8E8E5] dark:border-[#174261] rounded-lg flex items-start justify-between gap-3 text-[12px]"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-[#04314A] text-white uppercase">
                          {item.action}
                        </span>
                        <span className="text-[10px] font-bold uppercase text-[#737373] dark:text-[#94A3B8]">
                          {item.object_type} #{item.object_id}
                        </span>
                      </div>
                      <p className="text-[#04314A] dark:text-[#F7F7F5] font-medium">
                        {item.summary}
                      </p>
                    </div>
                    <span className="text-[11px] text-[#737373] dark:text-[#94A3B8] whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )}
</div>
);
}
