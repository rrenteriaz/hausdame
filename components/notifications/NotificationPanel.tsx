// components/notifications/NotificationPanel.tsx
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import type { NotificationItem } from "@/lib/notifications/getNotifications";

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

interface NotificationPanelProps {
  notifications: NotificationItem[];
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  /** Si true, el panel se abre hacia arriba (para bottom nav fijo) */
  openUp?: boolean;
}

export default function NotificationPanel({
  notifications,
  onClose,
  onMarkRead,
  onMarkAllRead,
  openUp = false,
}: NotificationPanelProps) {
  const router = useRouter();
  const { state: pushState, subscribe } = usePushNotifications();
  const panelRef = useRef<HTMLDivElement>(null);

  // Cerrar al hacer click fuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  function handleNotificationClick(n: NotificationItem) {
    if (!n.readAt) onMarkRead(n.id);
    if (n.href) {
      router.push(n.href);
      onClose();
    }
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div
      ref={panelRef}
      className={`absolute right-0 w-80 sm:w-96 bg-white border border-neutral-200 rounded-xl shadow-lg z-50 flex flex-col max-h-[70vh] overflow-hidden ${
        openUp ? "bottom-full mb-2" : "top-full mt-2"
      }`}
      role="dialog"
      aria-label="Notificaciones"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
        <span className="font-semibold text-neutral-900">Notificaciones</span>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            Marcar todas como leídas
          </button>
        )}
      </div>

      {/* Lista */}
      <div className="overflow-y-auto flex-1">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-neutral-400 text-sm">
            Sin notificaciones
          </div>
        ) : (
          <ul>
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleNotificationClick(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-neutral-50 transition-colors border-b border-neutral-100 last:border-0 ${
                    !n.readAt ? "bg-blue-50/40" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Indicador no leída */}
                    <div className="mt-1.5 shrink-0">
                      {!n.readAt ? (
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-transparent" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${!n.readAt ? "font-medium text-neutral-900" : "text-neutral-700"}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{n.body}</p>
                      <p className="text-[10px] text-neutral-400 mt-1">
                        {formatRelativeTime(n.createdAt)}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Push opt-in */}
      {(pushState === "default" || pushState === "error") && (
        <div className="border-t border-neutral-100 px-4 py-3">
          <button
            type="button"
            onClick={subscribe}
            className="w-full text-sm text-center text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            Activar notificaciones
          </button>
        </div>
      )}
      {pushState === "unsupported" && (
        <div className="border-t border-neutral-100 px-4 py-3">
          <p className="text-xs text-center text-neutral-400">
            Las notificaciones no están disponibles en este navegador
          </p>
        </div>
      )}
      {pushState === "denied" && (
        <div className="border-t border-neutral-100 px-4 py-3">
          <p className="text-xs text-center text-neutral-400">
            Permiso denegado. Puedes activarlo desde la configuración del navegador.
          </p>
        </div>
      )}
    </div>
  );
}
