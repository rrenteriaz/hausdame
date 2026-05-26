"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { NotificationItem } from "@/lib/notifications/getNotifications";
import SwipeableRow from "./SwipeableRow";

const PAGE_SIZE = 30;

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes}m`;
  if (hours < 24) return `hace ${hours}h`;
  if (days < 7) return `hace ${days}d`;
  return new Date(date).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export default function NotificationsPageContent() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (offset: number, replace: boolean) => {
    try {
      const res = await fetch(`/api/notifications?limit=${PAGE_SIZE}&offset=${offset}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: NotificationItem[]; total: number };
      setTotal(data.total);
      if (replace) {
        setNotifications(data.notifications);
      } else {
        setNotifications((prev) => [...prev, ...data.notifications]);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(0, true);
  }, [fetchPage]);

  async function handleToggleRead(id: string) {
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { ok: boolean; readAt: string | null };
      const newReadAt = data.readAt ? new Date(data.readAt) : null;
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: newReadAt } : n))
      );
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
    } catch {
      // silencioso
    }
  }

  async function handleDelete(id: string) {
    const target = notifications.find((n) => n.id === id);
    try {
      await fetch("/api/notifications/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (target) setTotal((prev) => Math.max(0, prev - 1));
    } catch {
      // silencioso
    }
  }

  function handleLoadMore() {
    setLoadingMore(true);
    fetchPage(notifications.length, false);
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length;
  const hasMore = notifications.length < total;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-neutral-400 text-sm">
        Cargando…
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <svg className="w-10 h-10 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <p className="text-sm text-neutral-400">Sin notificaciones</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header with mark-all action */}
      {unreadCount > 0 && (
        <div className="flex items-center justify-end px-4 py-2 border-b border-neutral-100">
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            Marcar todas como leídas
          </button>
        </div>
      )}

      <ul>
        {notifications.map((n) => (
          <li key={n.id} className="border-b border-neutral-100 last:border-0">
            <SwipeableRow
              onSwipeRight={() => handleToggleRead(n.id)}
              rightLabel={n.readAt ? "No leída" : "Leída"}
              onSwipeLeft={() => handleDelete(n.id)}
            >
              <div className={`relative flex items-stretch ${!n.readAt ? "bg-blue-50/40" : "bg-white"}`}>
                <button
                  type="button"
                  onClick={() => {
                    if (!n.readAt) handleToggleRead(n.id);
                    if (n.href) router.push(n.href);
                  }}
                  className="flex-1 text-left px-4 py-4 pr-16 hover:bg-neutral-50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1.5 shrink-0">
                      {!n.readAt ? (
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-transparent" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${!n.readAt ? "font-semibold text-neutral-900" : "text-neutral-700"}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5">{n.body}</p>
                      <p className="text-[10px] text-neutral-400 mt-1">
                        {formatRelativeTime(n.createdAt)}
                      </p>
                    </div>
                  </div>
                </button>
                {/* Action buttons — always visible */}
                <div className="absolute right-2 inset-y-0 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleToggleRead(n.id); }}
                    title={n.readAt ? "Marcar como no leída" : "Marcar como leída"}
                    className="p-1.5 rounded-full text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    {n.readAt ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDelete(n.id); }}
                    title="Eliminar"
                    className="p-1.5 rounded-full text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </SwipeableRow>
          </li>
        ))}
      </ul>

      {hasMore && (
        <div className="flex justify-center py-4">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="text-sm text-neutral-500 hover:text-neutral-900 disabled:opacity-50 transition-colors"
          >
            {loadingMore ? "Cargando…" : `Cargar más (${total - notifications.length} restantes)`}
          </button>
        </div>
      )}
    </div>
  );
}
