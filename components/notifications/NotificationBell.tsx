// components/notifications/NotificationBell.tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import type { NotificationItem } from "@/lib/notifications/getNotifications";

const NotificationPanel = dynamic(() => import("./NotificationPanel"), {
  ssr: false,
});

const POLL_INTERVAL_MS = 60_000; // Refrescar contador cada 60s

export default function NotificationBell({ openUp = false }: { openUp?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?count=1", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { count: number };
      setUnreadCount(data.count);
    } catch {
      // silencioso
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=30", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: NotificationItem[]; total: number };
      setNotifications(data.notifications);
      setUnreadCount(data.notifications.filter((n) => !n.readAt).length);
      setLoaded(true);
    } catch {
      // silencioso
    }
  }, []);

  // Poll del contador cada minuto
  useEffect(() => {
    fetchCount();
    intervalRef.current = setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchCount]);

  function handleOpen() {
    setIsOpen((prev) => {
      if (!prev) {
        // Cargar lista al abrir
        fetchNotifications();
      }
      return !prev;
    });
  }

  async function handleMarkRead(id: string) {
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // silencioso
    }
  }

  async function handleMarkAllRead() {
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date() })));
      setUnreadCount(0);
    } catch {
      // silencioso
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleOpen}
        aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ""}`}
        aria-expanded={isOpen}
        className="relative flex items-center justify-center min-w-[44px] min-h-[44px] text-neutral-500 hover:text-neutral-900 transition-colors"
      >
        {/* Ícono campana */}
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>

        {/* Badge contador */}
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <NotificationPanel
          notifications={notifications}
          onClose={() => setIsOpen(false)}
          onMarkRead={handleMarkRead}
          onMarkAllRead={handleMarkAllRead}
          openUp={openUp}
        />
      )}
    </div>
  );
}
