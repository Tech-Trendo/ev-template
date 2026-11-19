"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Wrench,
  AlertTriangle,
  ShieldAlert,
  Clock,
  CalendarX,
  CheckCheck,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";

export interface InAppNotification {
  id: number;
  notification_type:
    | "SERVICE_DUE_SOON"
    | "SERVICE_OVERDUE"
    | "WARRANTY_EXPIRING"
    | "RESERVATION_EXPIRING"
    | "RESERVATION_EXPIRED";
  title: string;
  message: string;
  link: string;
  is_read: boolean;
  created_at: string;
  dedup_key: string | null;
  target_type: string | null;
  object_id: string;
}

function formatTimeAgo(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    const diffWeeks = Math.floor(diffDays / 7);
    return `${diffWeeks}w ago`;
  } catch {
    return "";
  }
}

function getNotificationIcon(type: InAppNotification["notification_type"]) {
  switch (type) {
    case "SERVICE_OVERDUE":
      return <AlertTriangle size={15} className="text-[#DC2626]" />;
    case "SERVICE_DUE_SOON":
      return <Wrench size={15} className="text-[#D97706]" />;
    case "WARRANTY_EXPIRING":
      return <ShieldAlert size={15} className="text-[#10B981]" />;
    case "RESERVATION_EXPIRED":
      return <CalendarX size={15} className="text-[#DC2626]" />;
    case "RESERVATION_EXPIRING":
    default:
      return <Clock size={15} className="text-[#D97706]" />;
  }
}

export default function NotificationBell({
  onNavigate,
}: {
  onNavigate: (target: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = async () => {
    try {
      const data = await api<{ unread_count: number }>("/api/notifications/unread-count/");
      setUnreadCount(data.unread_count || 0);
    } catch {
      // Ignore background fetch error
    }
  };

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const data = await api<InAppNotification[] | { results: InAppNotification[] }>(
        "/api/notifications/"
      );
      const list = Array.isArray(data) ? data : data.results || [];
      setNotifications(list);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  // Poll unread count periodically
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch full list when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  // Click outside and Escape key listeners
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleMarkAllRead = async () => {
    try {
      await api("/api/notifications/mark-all-read/", { method: "POST" });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // Ignore
    }
  };

  const handleItemClick = async (notif: InAppNotification) => {
    if (!notif.is_read) {
      try {
        await api(`/api/notifications/${notif.id}/read/`, { method: "POST" });
        setUnreadCount((c) => Math.max(0, c - 1));
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        );
      } catch {
        // Ignore
      }
    }

    setIsOpen(false);
    if (notif.link) {
      onNavigate(notif.link);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]"
        aria-label="Notifications"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-[#DC2626] text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white border border-[#E8E8E5] rounded-xl shadow-xl z-50 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 bg-[#FAFAF8] border-b border-[#E8E8E5] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[#0B3D2B]">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#DC2626] text-white">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] font-semibold text-[#10B981] hover:text-[#0B3D2B] flex items-center gap-1 transition-colors"
              >
                <CheckCheck size={13} />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-[#F0F0ED]">
            {loading && notifications.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-[#737373] flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin text-[#10B981]" />
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center px-4">
                <p className="text-[13px] font-semibold text-[#0B3D2B]">All caught up</p>
                <p className="text-[11px] text-[#737373] mt-0.5">
                  No active service, warranty, or reservation alerts.
                </p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`w-full px-4 py-3 text-left transition-colors flex items-start gap-3 ${
                    n.is_read
                      ? "bg-white hover:bg-[#FAFAF8]"
                      : "bg-[#F8FAFC] hover:bg-[#F1F5F9]"
                  }`}
                >
                  <div className="w-7 h-7 rounded-md bg-[#F0F0ED] flex items-center justify-center flex-shrink-0 mt-0.5">
                    {getNotificationIcon(n.notification_type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[12px] truncate ${
                          n.is_read ? "font-semibold text-[#0B3D2B]" : "font-bold text-[#0B3D2B]"
                        }`}
                      >
                        {n.title}
                      </span>
                      <span className="text-[10px] text-[#737373] flex-shrink-0">
                        {formatTimeAgo(n.created_at)}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#737373] mt-0.5 line-clamp-2 leading-relaxed">
                      {n.message}
                    </p>
                  </div>
                  {!n.is_read && (
                    <span className="w-2 h-2 rounded-full bg-[#10B981] flex-shrink-0 mt-2" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
