// components/notifications/NotificationBellFloat.tsx
// Campana flotante fija arriba a la derecha — solo visible en móvil.
// Se coloca directamente en los layout-client de Host y Cleaner.
// El punto de corte (hideAt) varía según el layout:
//   - Host:    hideAt="lg" (el header desktop aparece en ≥ 1024px)
//   - Cleaner: hideAt="sm" (el header desktop aparece en ≥ 640px)
"use client";

import dynamic from "next/dynamic";

const NotificationBell = dynamic(
  () => import("./NotificationBell"),
  { ssr: false }
);

interface NotificationBellFloatProps {
  /**
   * Breakpoint a partir del cual el botón flotante se oculta
   * (porque el header de desktop ya muestra la campana).
   * "sm" = oculto en ≥ 640px · "lg" = oculto en ≥ 1024px
   */
  hideAt?: "sm" | "lg";
}

export default function NotificationBellFloat({
  hideAt = "sm",
}: NotificationBellFloatProps) {
  const hiddenClass = hideAt === "lg" ? "lg:hidden" : "sm:hidden";

  return (
    <div
      className={`fixed right-3 z-[60] ${hiddenClass}`}
      // safe-area-inset-top para respetar el notch/status bar en iOS PWA
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
    >
      <NotificationBell />
    </div>
  );
}
