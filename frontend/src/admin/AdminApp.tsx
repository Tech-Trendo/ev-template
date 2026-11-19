"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Truck,
  Newspaper,
  Users,
  LogOut,
  UserPlus,
  Building2,
  CalendarCheck,
  FileText,
  Activity as ActivityIcon,
  CalendarDays,
  Tag,
  ShieldCheck,
  Layers,
  Settings,
  Store,
  Wrench,
  KeyRound,
  Clock,
  ShieldAlert,
  UserRound,
  BarChart3,
  Boxes,
  Car,
  Container,
  History,
  ClipboardCheck,
  FolderArchive,
  Database,
  Menu,
  X,
} from "lucide-react";
import { AuthProvider, useAuth } from "./AuthContext";
import Login from "./Login";
import Dashboard from "./Dashboard";
import TeamPerformancePage from "./performance/TeamPerformancePage";
import VehiclesManager from "./VehiclesManager";
import StoriesManager from "./StoriesManager";
import StoriesEditor from "./StoriesEditor";
import EnquiriesManager from "./EnquiriesManager";
import QuoteRequestsManager from "./QuoteRequestsManager";
import CrmOverview from "./crm/CrmOverview";
import LeadsPage from "./crm/LeadsPage";
import LeadDetail from "./crm/LeadDetail";
import CustomersPage from "./crm/CustomersPage";
import CustomerDetail from "./crm/CustomerDetail";
import TestDrivesPage from "./crm/TestDrivesPage";
import QuotationsPage from "./crm/QuotationsPage";
import QuotationDetail from "./crm/QuotationDetail";
import ActivitiesPage from "./crm/ActivitiesPage";
import LeadSourcesPage from "./crm/LeadSourcesPage";
import EventsManager from "./events/EventsManager";
import EventDetail from "./events/EventDetail";
import InterestLevelsManager from "./events/InterestLevelsManager";
import UsersManager from "./UsersManager";
import RolesManager from "./RolesManager";
import DealersManager from "./DealersManager";
import ServicingManager from "./ServicingManager";
import ServiceDuePage from "./ServiceDuePage";
import AuditLogPage from "./AuditLogPage";
import StockDashboard from "./inventory/StockDashboard";
import UnitsManager from "./inventory/UnitsManager";
import UnitRoutes from "./inventory/UnitRoutes";
import ChinaTransportManager from "./inventory/ChinaTransportManager";
import BatchDetail from "./inventory/BatchDetail";
import InventoryAdditionalsPage from "./inventory/InventoryAdditionalsPage";
import VariantsManager from "./inventory/VariantsManager";
import ChecklistTemplateManager from "./inventory/ChecklistTemplateManager";
import LibraryPage from "./documents/LibraryPage";
import HistoricalImportPage from "./inventory/HistoricalImportPage";
import EmployeesPage from "./hrm/EmployeesPage";
import DepartmentsPage from "./hrm/DepartmentsPage";
import EmploymentTypesPage from "./hrm/EmploymentTypesPage";
import AttendanceManager from "./AttendanceManager";
import ProfilePage from "./ProfilePage";
import CmsEditor from "./cms/CmsEditor";
import { CMS_SCHEMAS } from "./cms/schemas";
import GlobalSearch from "./components/GlobalSearch";
import NotificationBell from "./components/NotificationBell";
import { ToastProvider } from "@/components/ui";
import { api } from "@/lib/api";
import { installManualYears } from "@/lib/hrm/bsCalendar";

type NavItem =
  | {
      key: string;
      label: string;
      icon: typeof LayoutDashboard;
      allowAll?: boolean;
      superAdminOnly?: boolean;
      perms?: string[];
    }
  | { section: string };

const CRM_ANY = [
  "crm.view_lead",
  "crm.view_customer",
  "crm.view_opportunity",
  "crm.view_testdrive",
  "crm.view_quotation",
  "crm.view_activity",
  "crm.view_leadsource",
  "crm.view_activitytype",
  "leads.view_enquiry",
];

const NAV: NavItem[] = [
  // Top-level (no section)
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, allowAll: true },

  // Sales / CRM
  { section: "Sales/CRM" },
  { key: "crm", label: "CRM Overview", icon: BarChart3, perms: CRM_ANY },
  { key: "crm-leads", label: "Leads", icon: UserPlus, perms: ["crm.view_lead"] },
  { key: "crm-customers", label: "Customers", icon: Building2, perms: ["crm.view_customer"] },
  { key: "crm-testdrives", label: "Test Drives", icon: CalendarCheck, perms: ["crm.view_testdrive"] },
  { key: "crm-quotations", label: "Quotations", icon: FileText, perms: ["crm.view_quotation"] },
  { key: "quote-requests", label: "Quote Requests", icon: FileText, perms: ["leads.view_enquiry"] },
  { key: "enquiries", label: "Enquiries", icon: Users, perms: ["leads.view_enquiry"] },
  { key: "crm-activities", label: "Activities", icon: ActivityIcon, perms: ["crm.view_activity"] },
  {
    key: "crm-additional",
    label: "CRM Settings",
    icon: Settings,
    perms: ["crm.view_leadsource", "crm.view_activitytype", "crm.view_bank"],
  },

  // Inventory
  { section: "Inventory" },
  { key: "stock", label: "Stock Overview", icon: Boxes, perms: ["inventory.view_vehicleunit"] },
  { key: "china-transport", label: "China Shipments", icon: Container, perms: ["inventory.view_importbatch"] },
  { key: "units", label: "Vehicles & Units", icon: Car, perms: ["inventory.view_vehicleunit"] },
  { key: "vehicles", label: "Vehicle Models", icon: Truck, perms: ["vehicles.view_vehicle"] },
  {
    key: "variants",
    label: "Variants",
    icon: Layers,
    perms: ["inventory.view_vehiclevariant", "inventory.manage_vehiclevariant"],
  },
  {
    key: "checklist-templates",
    label: "Checklist Templates",
    icon: ClipboardCheck,
    perms: ["inventory.manage_pditemplate", "inventory.view_pditemplate"],
  },
  {
    key: "inventory-additional",
    label: "Inventory Settings",
    icon: Settings,
    perms: [
      "inventory.view_transportstatusoption",
      "inventory.view_bordercrossing",
      "inventory.view_destinationwarehouse",
      "inventory.view_importbatch",
    ],
  },
  {
    key: "historical-import",
    label: "Historical Import",
    icon: Database,
    perms: ["inventory.run_historical_import"],
  },

  // Servicing
  { section: "Servicing" },
  { key: "servicing", label: "Servicing", icon: Wrench, perms: ["servicing.view_servicerecord"] },
  { key: "servicing-due", label: "Service Due", icon: Clock, perms: ["servicing.view_servicerecord"] },

  // Dealers
  { section: "Dealers" },
  { key: "dealers", label: "Dealers", icon: Store, perms: ["dealers.view_dealer"] },

  // Human resources
  { section: "HR" },
  { key: "hr-employees", label: "Employees", icon: UserRound, perms: ["hrm.view_employee"] },
  { key: "hr-departments", label: "Departments", icon: Building2, perms: ["hrm.view_employee", "hrm.manage_department"] },
  { key: "hr-employment-types", label: "Employment Types", icon: Tag, perms: ["hrm.manage_employment_type"] },

  // Reports
  { section: "Reports" },
  { key: "team-performance", label: "Team Performance", icon: BarChart3, allowAll: true },
  { key: "audit-logs", label: "Audit Trail", icon: History, superAdminOnly: true },
  { key: "events", label: "Events", icon: CalendarDays, perms: ["events.view_event"] },
  {
    key: "attendance",
    label: "Attendance",
    icon: Clock,
    perms: ["attendance.manage_attendance"],
  },

  // Library / Document Vault
  { section: "Library" },
  { key: "library", label: "Media & Documents", icon: FolderArchive, perms: ["crm.view_document"] },

  // Settings
  { section: "Settings" },
  { key: "users", label: "Users", icon: ShieldCheck, superAdminOnly: true },
  { key: "roles", label: "Roles", icon: KeyRound, superAdminOnly: true },
  { key: "cms-home", label: "CMS Content", icon: Layers, perms: ["cms.view_cmspage"] },
  { key: "stories", label: "Blog & Stories", icon: Newspaper, perms: ["stories.view_story"] },
  { key: "interest-levels", label: "Interest Levels", icon: Tag, perms: ["events.view_interestlevel"] },
];

const CRM_PAGES = [
  "crm",
  "crm-leads",
  "crm-customers",
  "crm-testdrives",
  "crm-quotations",
  "crm-activities",
  "crm-additional",
];

const CMS_PAGES = [
  "home",
  "vehicles",
  "industries",
  "calculator",
  "roi",
  "about",
  "stories",
  "contact",
  "global",
] as const;

const MOBILE_NAV_KEYS = ["dashboard", "enquiries", "events", "stories", "crm"];

export const ADMIN_BASE = "/dashboard";
export const LOGIN_PATH = "/auth/login";

function isAdminPath() {
  return (
    window.location.pathname.startsWith(ADMIN_BASE) ||
    window.location.pathname.startsWith(LOGIN_PATH)
  );
}

function currentRoute() {
  if (typeof window === "undefined") return "dashboard";
  let path = window.location.pathname;
  if (path.startsWith(ADMIN_BASE)) {
    path = path.slice(ADMIN_BASE.length);
  } else if (path.startsWith(LOGIN_PATH)) {
    path = path.slice(LOGIN_PATH.length);
  }
  path = path.replace(/^\//, "");
  const search = window.location.search;
  return (path || "dashboard") + search;
}

function isCrmPage(page: string) {
  const pathOnly = page.split("?")[0];
  const base = pathOnly.split("/")[0];
  return CRM_PAGES.includes(base);
}

function canSeeNav(
  item: Extract<NavItem, { key: string }>,
  isSuperAdmin: boolean,
  hasAnyPerm: (perms: string[]) => boolean,
): boolean {
  if (item.allowAll) return true;
  if (item.superAdminOnly) return isSuperAdmin;
  if (item.perms) return isSuperAdmin || hasAnyPerm(item.perms);
  return false;
}

/** Route-level gate (covers sub-routes like crm-leads/123, stories/1, cms-*). */
function canAccessPage(
  page: string,
  isSuperAdmin: boolean,
  hasAnyPerm: (perms: string[]) => boolean,
): boolean {
  const pathOnly = page.split("?")[0];
  const base = pathOnly.split("/")[0];
  if (base === "dashboard" || base === "" || base === "profile") return true;
  if (base === "users" || base === "roles") return isSuperAdmin;
  if (base.startsWith("cms-")) return isSuperAdmin || hasAnyPerm(["cms.view_cmspage"]);
  const navMatch = NAV.find(
    (n): n is Extract<NavItem, { key: string }> => "key" in n && n.key === base,
  );
  if (navMatch) return canSeeNav(navMatch, isSuperAdmin, hasAnyPerm);
  // Stories editor / event detail inherit their parent permission.
  if (base === "stories") return isSuperAdmin || hasAnyPerm(["stories.view_story"]);
  if (base === "servicing-stories") return isSuperAdmin || hasAnyPerm(["stories.view_story"]);
  if (base === "events") return isSuperAdmin || hasAnyPerm(["events.view_event"]);
  if (base === "batches") return isSuperAdmin || hasAnyPerm(["inventory.view_importbatch"]);
  // Unknown route -> fall back to dashboard check (dashboard handles it).
  return true;
}

function Shell() {
  const { token, me, meLoading, meError, logout, refreshMe, isSuperAdmin, hasAnyPerm } = useAuth();
  const [page, setPage] = useState(currentRoute);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isOnLoginPath =
    window.location.pathname === LOGIN_PATH ||
    window.location.pathname.startsWith(LOGIN_PATH + "/");

  useEffect(() => {
    if (!token) return;
    api
      .get<{ months: Record<string, number[]> }>("/api/hrm/calendar-data/")
      .then((data) => installManualYears(data.months))
      .catch(() => undefined);
  }, [token]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    const onPop = () => {
      if (isAdminPath()) setPage(currentRoute());
      else window.location.replace(ADMIN_BASE);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Once authenticated, redirect from /auth/login → /dashboard (preserving subpath if any)
  useEffect(() => {
    if (token && isOnLoginPath) {
      const subpath = window.location.pathname.slice(LOGIN_PATH.length).replace(/^\//, "");
      const target = subpath ? `${ADMIN_BASE}/${subpath}${window.location.search}` : ADMIN_BASE;
      window.history.replaceState({}, "", target);
      setPage(subpath ? `${subpath}${window.location.search}` : "dashboard");
    }
    // If on /dashboard/* but not authenticated, URL stays. Login component renders below
  }, [token, isOnLoginPath]);

  const navigate = (p: string) => {
    const clean = p.startsWith("/") ? p.slice(1) : p;
    const target = clean === "dashboard" ? ADMIN_BASE : `${ADMIN_BASE}/${clean}`;
    window.history.pushState({}, "", target);
    setPage(clean);
    setMobileMenuOpen(false);
  };

  const [routePath] = page.split("?");

  const visibleNav = useMemo(() => {
    const raw = NAV.filter((item) => {
      if ("section" in item) return true;
      if (!me) return item.allowAll === true;
      return canSeeNav(item, isSuperAdmin, hasAnyPerm);
    });

    const result: NavItem[] = [];
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      if ("section" in item) {
        let hasChildren = false;
        for (let j = i + 1; j < raw.length; j++) {
          if ("section" in raw[j]) break;
          hasChildren = true;
          break;
        }
        if (hasChildren) {
          result.push(item);
        }
      } else {
        result.push(item);
      }
    }
    return result;
  }, [me, isSuperAdmin, hasAnyPerm]);

  const firstAllowed = useMemo(() => {
    for (const item of visibleNav) {
      if ("key" in item) return item.key;
    }
    return "dashboard";
  }, [visibleNav]);

  if (!token) return <Login />;

  if (meLoading && !me) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F7F7F5] text-[13px] font-semibold text-[#737373]">
        Loading permissions...
      </div>
    );
  }

  if (meError && !me) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F7F7F5] p-6">
        <div className="max-w-md w-full bg-white border border-[#E8E8E5] rounded-2xl p-8 text-center shadow-sm">
          <ShieldAlert size={28} className="mx-auto mb-4 text-[#10B981]" />
          <h1 className="text-[20px] font-black text-[#0B3D2B]">Unable to load account</h1>
          <p className="text-[13px] text-[#737373] mt-2 leading-relaxed">
            {meError}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => refreshMe()}
              className="px-5 py-2.5 rounded-full bg-[#0B3D2B] text-white text-[12px] font-semibold tracking-[0.06em] uppercase hover:bg-[#10B981] transition-colors"
            >
              Retry
            </button>
            <button
              onClick={logout}
              className="px-5 py-2.5 rounded-full border border-[#E8E8E5] text-[#0B3D2B] text-[12px] font-semibold tracking-[0.06em] uppercase hover:bg-[#F7F7F5] transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F7F7F5] text-[13px] font-semibold text-[#737373]">
        Loading permissions...
      </div>
    );
  }

  const allowed = canAccessPage(routePath, isSuperAdmin, hasAnyPerm);
  const crmActive = isCrmPage(routePath);
  const cmsPageKey = routePath.startsWith("cms-")
    ? (routePath.split("/")[0].slice(4) as (typeof CMS_PAGES)[number])
    : null;
  const cmsConfig = cmsPageKey && CMS_PAGES.includes(cmsPageKey) ? { pageKey: cmsPageKey } : null;

  const accessDenied = (
    <div className="max-w-md mx-auto mt-16 bg-white border border-[#E8E8E5] rounded-2xl p-8 text-center">
      <ShieldAlert size={28} className="mx-auto mb-4 text-[#10B981]" />
      <h1 className="text-[20px] font-black text-[#0B3D2B]">Access denied.</h1>
      <p className="text-[13px] text-[#737373] mt-2 leading-relaxed">
        Your role{me.role_names.length ? ` (${me.role_names.join(", ")})` : ""} doesn&apos;t include
        access to this section. Contact an administrator if you need it.
      </p>
      <button
        onClick={() => navigate(firstAllowed)}
        className="mt-6 px-6 py-3 rounded-full bg-[#0B3D2B] text-white text-[12px] font-semibold tracking-[0.06em] uppercase hover:bg-[#10B981] transition-colors"
      >
        Go to {firstAllowed}
      </button>
    </div>
  );

  return (
    <div className="h-screen bg-[#F7F7F5] flex overflow-hidden print:h-auto print:overflow-visible print:bg-white print:block">
      {/* Sidebar - fixed pane; only the nav list can scroll internally if needed */}
      <aside className="hidden md:flex w-[230px] flex-col bg-[#0B3D2B] flex-shrink-0 h-full">
        <div className="px-6 py-7 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#10B981] text-[13px] font-black text-white">
              EV
            </span>
            <span className="text-[14px] font-bold tracking-tight text-white">
              EV OS
            </span>
          </div>
          <span className="text-[9px] font-semibold tracking-[0.22em] uppercase text-white/40">
            Admin Console
          </span>
        </div>

        <nav className="admin-sidebar-nav flex-1 overflow-y-auto overscroll-contain px-3 py-4 flex flex-col gap-0.5">
          {visibleNav.map((item, i) =>
            "section" in item ? (
              <span
                key={`section-${i}`}
                className="px-4 pt-4 pb-0.5 text-[9px] font-bold tracking-[0.22em] uppercase text-white/30"
              >
                {item.section}
              </span>
            ) : (
              <button
                key={item.key}
                onClick={() => navigate(item.key)}
                className={`flex items-center gap-3 px-4 py-2 text-left text-[13px] font-semibold tracking-[0.02em] rounded-lg transition-colors ${
                  item.key === "cms-home"
                    ? routePath.startsWith("cms-")
                      ? "bg-[#10B981] text-white"
                      : "text-white/55 hover:text-white hover:bg-white/10"
                    : routePath === item.key ||
                      (item.key !== "dashboard" && routePath.startsWith(item.key + "/"))
                    ? "bg-[#10B981] text-white"
                    : "text-white/55 hover:text-white hover:bg-white/10"
                }`}
              >
                <item.icon size={16} />
                {item.label}
              </button>
            ),
          )}
        </nav>

        <div className="px-3 py-4 border-t border-white/10 flex-shrink-0">
          <button
            onClick={() => navigate("profile")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-[12px] font-semibold transition-colors ${
              routePath === "profile" ? "text-white" : "text-white/55 hover:text-white"
            }`}
          >
            <UserRound size={14} />
            View Profile
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] font-semibold text-white/55 hover:text-white transition-colors"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile collapsible drawer */}
      {mobileMenuOpen && (
        <div
          id="admin-mobile-drawer"
          className="md:hidden fixed inset-0 z-50 flex no-print"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation drawer"
        >
          <div
            className="fixed inset-0 bg-[#0B3D2B]/60 transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          <div className="relative w-72 max-w-[85vw] bg-[#0B3D2B] flex flex-col h-full z-10 shadow-2xl">
            <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#10B981] text-[11px] font-black text-white">
                  EV
                </span>
                <span className="text-[12px] font-bold text-white">EV OS</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close navigation menu"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 flex flex-col gap-0.5">
              {visibleNav.map((item, i) =>
                "section" in item ? (
                  <span
                    key={`mob-section-${i}`}
                    className="px-3 pt-3.5 pb-1 text-[9px] font-bold tracking-[0.22em] uppercase text-white/35"
                  >
                    {item.section}
                  </span>
                ) : (
                  <button
                    key={`mob-${item.key}`}
                    onClick={() => navigate(item.key)}
                    className={`flex items-center gap-3 px-3 py-2 text-left text-[12px] font-semibold tracking-[0.02em] rounded-lg transition-colors ${
                      item.key === "cms-home"
                        ? routePath.startsWith("cms-")
                          ? "bg-[#10B981] text-white"
                          : "text-white/60 hover:text-white hover:bg-white/10"
                        : routePath === item.key ||
                          (item.key !== "dashboard" && routePath.startsWith(item.key + "/"))
                        ? "bg-[#10B981] text-white"
                        : "text-white/60 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <item.icon size={16} />
                    {item.label}
                  </button>
                )
              )}
            </nav>

            <div className="px-3 py-4 border-t border-white/10 flex-shrink-0">
              <button
                onClick={() => navigate("profile")}
                className="w-full flex items-center gap-3 px-3 py-2 text-[12px] font-semibold text-white/60 hover:text-white transition-colors"
              >
                <UserRound size={14} />
                View Profile
              </button>
              <button
                onClick={logout}
                className="w-full flex items-center gap-3 px-3 py-2 text-[12px] font-semibold text-white/60 hover:text-white transition-colors"
              >
                <LogOut size={14} />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0B3D2B] flex no-print">
        {visibleNav
          .filter(
            (item): item is Extract<NavItem, { key: string }> =>
              "key" in item && MOBILE_NAV_KEYS.includes(item.key),
          )
          .map((item) => (
            <button
              key={item.key}
              onClick={() => navigate(item.key)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-[9px] font-bold tracking-[0.08em] uppercase ${
                (crmActive && item.key === "crm") ||
                routePath === item.key ||
                (item.key !== "dashboard" && routePath.startsWith(item.key))
                  ? "text-[#10B981]"
                  : "text-white/50"
              }`}
            >
              <item.icon size={17} />
              {item.key === "enquiries" ? "Enquiries" : item.key === "crm" ? "CRM" : item.label}
            </button>
          ))}
      </div>

      {/* Right Column: Top Bar + Content View */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden print:h-auto print:overflow-visible print:block">
        {/* Top Header Bar */}
        <header className="h-14 bg-white border-b border-[#E8E8E5] px-4 sm:px-6 lg:px-8 flex items-center justify-between flex-shrink-0 z-30">
          <div className="flex items-center gap-2 flex-1 max-w-lg mr-4">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-lg text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]"
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="admin-mobile-drawer"
            >
              <Menu size={20} />
            </button>
            <div className="flex-1">
              <GlobalSearch onNavigate={navigate} />
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <NotificationBell onNavigate={navigate} />
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-[12px] font-bold text-[#0B3D2B] leading-tight">
                {me.username || me.email}
              </span>
              <span className="text-[10px] text-[#737373] leading-tight">
                {me.role_names && me.role_names.length
                  ? me.role_names.join(", ")
                  : isSuperAdmin
                  ? "Super Admin"
                  : "Staff"}
              </span>
            </div>
            <button
              onClick={() => navigate("profile")}
              className="w-8 h-8 rounded-full bg-[#0B3D2B] text-white flex items-center justify-center text-[12px] font-bold hover:bg-[#10B981] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]"
              title="My Profile"
              aria-label="View Profile"
            >
              {(me.username || me.email || "U")[0].toUpperCase()}
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 h-full overflow-y-auto overscroll-contain px-5 sm:px-8 lg:px-10 py-8 pb-24 md:pb-8 print:p-0 print:m-0 print:h-auto print:overflow-visible print:block">
          {!allowed ? (
            accessDenied
          ) : (
            <>
              {routePath === "vehicles" && <VehiclesManager />}
              {routePath === "variants" && <VariantsManager onNavigate={navigate} />}
              {routePath === "checklist-templates" && (
                <ChecklistTemplateManager onNavigate={navigate} />
              )}
              {routePath === "stock" && <StockDashboard onNavigate={navigate} />}
              {(routePath === "china-transport" || routePath === "batches") && (
                <ChinaTransportManager onNavigate={navigate} />
              )}
              {routePath === "units" && <UnitsManager onNavigate={navigate} />}
              {routePath.startsWith("units/") && (
                <UnitRoutes page={routePath} onNavigate={navigate} />
              )}
              {(routePath.startsWith("batches/") || routePath.startsWith("china-transport/")) && (
                <BatchDetail batchId={routePath.split("/")[1]} onNavigate={navigate} />
              )}
              {routePath === "library" && <LibraryPage onNavigate={navigate} />}
              {routePath === "historical-import" && <HistoricalImportPage />}
              {(routePath === "hr-employees" || routePath.startsWith("hr-employees/")) && (
                <EmployeesPage route={routePath} onNavigate={navigate} />
              )}
              {routePath === "hr-departments" && <DepartmentsPage />}
              {routePath === "hr-employment-types" && <EmploymentTypesPage />}
              {routePath === "stories" && (
                <StoriesManager
                  onNavigate={navigate}
                  title="Blog."
                  subtitle="Field reports, news and customer stories."
                />
              )}
              {routePath.startsWith("stories/") && (
                <StoriesEditor storyId={routePath.split("/")[1]} onNavigate={navigate} />
              )}
              {routePath === "servicing-stories" && (
                <StoriesManager
                  onNavigate={navigate}
                  initialCategory="Servicing"
                  lockedCategory
                  basePath="servicing-stories"
                  title="Stories."
                  subtitle="Workshop reports, maintenance wins and after-sales field notes."
                />
              )}
              {routePath.startsWith("servicing-stories/") && (
                <StoriesEditor
                  storyId={routePath.split("/")[1]}
                  onNavigate={navigate}
                  defaultCategory="Servicing"
                  basePath="servicing-stories"
                />
              )}
              {routePath === "enquiries" && <EnquiriesManager onNavigate={navigate} />}
              {routePath === "quote-requests" && <QuoteRequestsManager onNavigate={navigate} />}
              {routePath === "events" && <EventsManager onNavigate={navigate} />}
              {routePath.startsWith("events/") && (
                <EventDetail eventId={routePath.split("/")[1]} onNavigate={navigate} />
              )}
              {routePath === "interest-levels" && <InterestLevelsManager />}
              {routePath === "users" && <UsersManager />}
              {routePath === "roles" && <RolesManager />}
              {routePath === "team-performance" && <TeamPerformancePage onNavigate={navigate} />}
              {routePath === "audit-logs" && <AuditLogPage onNavigate={navigate} />}
              {routePath === "dealers" && <DealersManager />}
              {routePath === "servicing" && <ServicingManager page={page} onNavigate={navigate} />}
              {routePath === "servicing-due" && <ServiceDuePage onNavigate={navigate} />}
              {routePath === "attendance" && <AttendanceManager />}
              {routePath === "profile" && <ProfilePage />}
              {routePath === "crm" && <CrmOverview onNavigate={navigate} />}
              {routePath === "crm-leads" && <LeadsPage onNavigate={navigate} />}
              {routePath.startsWith("crm-leads/") && (
                <LeadDetail leadId={routePath.split("/")[1]} onNavigate={navigate} />
              )}
              {routePath === "crm-customers" && <CustomersPage onNavigate={navigate} />}
              {routePath.startsWith("crm-customers/") && (
                <CustomerDetail customerId={routePath.split("/")[1]} onNavigate={navigate} />
              )}
              {routePath === "crm-testdrives" && <TestDrivesPage onNavigate={navigate} />}
              {routePath === "crm-quotations" && <QuotationsPage onNavigate={navigate} />}
              {(routePath.startsWith("crm-quotations/") || routePath.startsWith("crm-quotation-detail/")) && (
                <QuotationDetail quotationId={routePath.split("/")[1]} onNavigate={navigate} />
              )}
              {routePath === "crm-additional" && <LeadSourcesPage />}
              {routePath === "inventory-additional" && <InventoryAdditionalsPage />}
              {routePath === "crm-activities" && <ActivitiesPage onNavigate={navigate} />}
              {cmsConfig && (
                <CmsEditor
                  key={cmsConfig.pageKey}
                  pageKey={cmsConfig.pageKey}
                  schema={CMS_SCHEMAS[cmsConfig.pageKey]}
                  onNavigate={(pk) => navigate(`cms-${pk}`)}
                  sitePath={
                    cmsConfig.pageKey === "home"
                      ? "/"
                      : cmsConfig.pageKey === "global"
                      ? "/about"
                      : cmsConfig.pageKey === "calculator"
                      ? "/calculator"
                      : cmsConfig.pageKey === "roi"
                      ? "/roi-calculator"
                      : `/${cmsConfig.pageKey}`
                  }
                />
              )}
              {![
                "vehicles",
                "variants",
                "checklist-templates",
                "stock",
                "units",
                "batches",
                "china-transport",
                "inventory-additional",
                "historical-import",
                "library",
                "servicing",
                "servicing-due",
                "dealers",
                "attendance",
                "profile",
                "stories",
                "servicing-stories",
                "enquiries",
                "quote-requests",
                "events",
                "interest-levels",
                "users",
                "roles",
                "team-performance",
                "audit-logs",
                "hr-employees",
                "hr-departments",
                "hr-employment-types",
                ...CRM_PAGES,
              ].includes(routePath.split("/")[0]) &&
                !routePath.startsWith("cms-") && <Dashboard onNavigate={navigate} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default function AdminApp() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </AuthProvider>
  );
}
