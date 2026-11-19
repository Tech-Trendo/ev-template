"use client";

import { Link } from "@/lib/router";

export type EntityType =
  | "customer"
  | "unit"
  | "vro"
  | "lead"
  | "quotation"
  | "dealer"
  | "event"
  | "sale"
  | "batch";

export function EntityLink({
  type,
  id,
  label,
  sublabel,
  className = "",
  onClick,
  onNavigate,
}: {
  type: EntityType;
  id: string | number;
  label: string;
  sublabel?: string;
  className?: string;
  onClick?: (e?: React.MouseEvent<HTMLAnchorElement>) => void;
  onNavigate?: (path: string) => void;
}) {
  let targetRoute = "";
  if (type === "customer") {
    targetRoute = `crm-customers/${id}`;
  } else if (type === "unit") {
    targetRoute = `units/${id}`;
  } else if (type === "vro") {
    targetRoute = `servicing?vro=${encodeURIComponent(String(label || id))}`;
  } else if (type === "lead") {
    targetRoute = `crm-leads/${id}`;
  } else if (type === "quotation") {
    targetRoute = `crm-quotations/${id}`;
  } else if (type === "dealer") {
    targetRoute = "dealers";
  } else if (type === "event") {
    targetRoute = `events/${id}`;
  } else if (type === "sale") {
    targetRoute = `units/${id}`;
  } else if (type === "batch") {
    targetRoute = `batches/${id}`;
  }

  const href = `/dashboard/${targetRoute}`;

  const handleClick = (e?: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) onClick(e);
    if (
      onNavigate &&
      e &&
      !e.defaultPrevented &&
      e.button === 0 &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.shiftKey &&
      !e.altKey
    ) {
      e.preventDefault();
      onNavigate(targetRoute);
    }
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={`inline-flex flex-col group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00AAEB] rounded-sm ${className}`}
    >
      <span className="text-[12px] font-bold text-[#04314A] group-hover:text-[#00AAEB] transition-colors">
        {label}
      </span>
      {sublabel && (
        <span className="text-[11px] text-[#737373] group-hover:text-[#04314A] transition-colors">
          {sublabel}
        </span>
      )}
    </Link>
  );
}
