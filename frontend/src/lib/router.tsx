"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

export function navigate(path: string) {
  if (typeof window === "undefined") return;
  if (window.location.pathname === path) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  // Full navigation so the Next.js App Router actually renders the new
  // route. A manual pushState + popstate would change the URL without
  // triggering a route change under the App Router.
  window.location.assign(path);
}

export function usePath() {
  // usePathname() is SSR-aware: it returns the real pathname both in the
  // server render and during hydration, so server and client HTML match.
  // (Reading window.location in useState's initializer returns "/" on the
  // server but the real path on the client, which caused hydration
  // mismatches in Navbar / FloatingContactButton, e.g. on /contact.)
  const pathname = usePathname();
  const [spaPath, setSpaPath] = useState<string | null>(null);

  useEffect(() => {
    // Fallback for legacy pushState-based navigation (popstate): keep SPA
    // state in sync, and stay in sync when Next.js navigates client-side.
    const sync = () => setSpaPath(window.location.pathname);
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    if (pathname) setSpaPath(pathname);
  }, [pathname]);

  return spaPath ?? pathname ?? "/";
}

export function Link({
  href,
  className,
  children,
  onClick,
  target,
  rel,
  title,
  id,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  onClick?: (e?: MouseEvent<HTMLAnchorElement>) => void;
  target?: string;
  rel?: string;
  title?: string;
  id?: string;
}) {
  return (
    <NextLink
      href={href}
      className={className}
      onClick={onClick}
      target={target}
      rel={rel}
      title={title}
      id={id}
    >
      {children}
    </NextLink>
  );
}
