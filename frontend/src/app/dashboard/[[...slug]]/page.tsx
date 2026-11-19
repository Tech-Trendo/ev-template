"use client";

import dynamic from "next/dynamic";

const AdminApp = dynamic(() => import("@/admin/AdminApp"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F7F7F5]">
      <div className="w-10 h-10 border-3 border-[#00AAEB] border-t-transparent rounded-full animate-spin mb-4" />
      <div className="text-[12px] font-bold tracking-[0.12em] uppercase text-[#04314A]">
        Loading Vehicle Template...
      </div>
    </div>
  ),
});

export default function DashboardCatchAllPage() {
  return <AdminApp />;
}
