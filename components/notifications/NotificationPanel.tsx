// components/notifications/NotificationPanel.tsx
"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import type { NotificationItem } from "@/lib/notifications/getNotifications";
import SwipeableRow from "./SwipeableRow";

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
  total: number;
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDelete: (id: string) => void;
  /** Si true, el panel se abre hacia arriba (para bottom nav fijo) */
  openUp?: boolean;
}

export default function NotificationPanel({
  notifications,
  total,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onDelete,
  openUp = false,
}: NotificationPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const allNotificationsHref = pathname.startsWith("/cleaner")
    ? "/cleaner/notifications"
    : "/host/notifications";
  const { state: pushState, pushError, subscribe } = usePushNotifications();
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
      // w-80 con max-w para no salir de pantalla en teléfonos pequeños
      // right-0 alineado al borde derecho del padre (fixed top-right en móvil)
      className={`absolute right-0 w-80 max-w-[calc(100vw-1rem)] bg-white border border-neutral-200 rounded-xl shadow-lg z-50 flex flex-col max-h-[70vh] overflow-hidden ${
        openUp ? "bottom-full mb-2" : "top-full mt-2"
      }`}
      role="dialog"
      aria-label="Notificaciones"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 shrink-0">
        <span className="font-semibold text-neutral-900 text-sm">Notificaciones</span>
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
              <li key={n.id} className="border-b border-neutral-100 last:border-0">
                <SwipeableRow
                  onSwipeRight={!n.readAt ? () => onMarkRead(n.id) : undefined}
                  onSwipeLeft={() => onDelete(n.id)}
                >
                  <div className={`relative flex items-stretch ${!n.readAt ? "bg-blue-50/40" : "bg-white"}`}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(n)}
                      className="flex-1 text-left px-4 py-3 hover:bg-neutral-50 transition-colors pr-16"
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
                    {/* Desktop hover action buttons */}
                    <div className="absolute right-2 inset-y-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                      {!n.readAt && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onMarkRead(n.id); }}
                          title="Marcar como leída"
                          className="p-1.5 rounded-full text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
                        title="Eliminar"
                        className="p-1.5 rounded-full text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </SwipeableRow>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Ver todas */}
      {total > 0 && (
        <div className="border-t border-neutral-100 shrink-0">
          <button
            type="button"
            onClick={() => { router.push(allNotificationsHref); onClose(); }}
            className="w-full py-2.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 transition-colors"
          >
            Ver todas{total > notifications.length ? ` (${total})` : ""}
          </button>
        </div>
      )}

      {/* Footer: estado de push notifications */}
      <PushFooter state={pushState} pushError={pushError} onSubscribe={subscribe} />
    </div>
  );
}

// ── Footer de push según estado ───────────────────────────────────────────

function PushFooter({
  state,
  pushError,
  onSubscribe,
}: {
  state: ReturnType<typeof usePushNotifications>["state"];
  pushError: string | null;
  onSubscribe: () => Promise<void>;
}) {
  // Permiso concedido y suscripción activa — no mostrar nada
  if (state === "subscribed") return null;
  // Permiso concedido pero sin suscripción — ofrecer activar
  if (state === "granted") {
    return (
      <div className="border-t border-neutral-100 px-4 py-3 shrink-0">
        <button
          type="button"
          onClick={onSubscribe}
          className="w-full text-sm text-center text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          Activar notificaciones push
        </button>
      </div>
    );
  }

  // Solicitando permiso / suscribiendo
  if (state === "subscribing") {
    return (
      <div className="border-t border-neutral-100 px-4 py-3 shrink-0">
        <p className="text-xs text-center text-neutral-400">Activando notificaciones…</p>
      </div>
    );
  }

  // No solicitado aún → botón principal
  if (state === "default") {
    return (
      <div className="border-t border-neutral-100 px-4 py-3 shrink-0">
        <button
          type="button"
          onClick={onSubscribe}
          className="w-full text-sm text-center text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          Activar notificaciones
        </button>
      </div>
    );
  }

  // Error (VAPID missing, red error, etc.)
  if (state === "error") {
    return (
      <div className="border-t border-neutral-100 px-4 py-3 shrink-0 space-y-2">
        <p className="text-xs text-center text-red-500 leading-snug">
          {pushError ?? "Error al activar notificaciones."}
        </p>
        {/* Solo mostrar retry si no es error de configuración */}
        {pushError && !pushError.includes("VAPID") && (
          <button
            type="button"
            onClick={onSubscribe}
            className="w-full text-xs text-center text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            Intentar de nuevo
          </button>
        )}
      </div>
    );
  }

  // Permiso denegado
  if (state === "denied") {
    return (
      <div className="border-t border-neutral-100 px-4 py-3 shrink-0">
        <p className="text-xs text-center text-neutral-400 leading-snug">
          Permiso denegado. Puedes activarlo desde la configuración del navegador.
        </p>
      </div>
    );
  }

  // Sin soporte
  if (state === "unsupported") {
    return (
      <div className="border-t border-neutral-100 px-4 py-3 shrink-0">
        <p className="text-xs text-center text-neutral-400 leading-snug">
          Las notificaciones no están disponibles en este navegador.
        </p>
      </div>
    );
  }

  return null;
}
