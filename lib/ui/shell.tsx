// lib/ui/shell.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { DesktopNav } from "./HostNavigation";

const NotificationBell = dynamic(
  () => import("@/components/notifications/NotificationBell"),
  { ssr: false }
);

export function AppShell({
  children,
  menuUser,
}: {
  children: React.ReactNode;
  menuUser: { email: string; nickname: string | null };
}) {
  const pathname = usePathname();
  const isMessagesPage = pathname?.includes("/host/messages/") || pathname?.includes("/cleaner/messages/");

  return (
    <div className={`${isMessagesPage ? "h-[100dvh] flex flex-col overflow-hidden" : "min-h-screen flex flex-col"}`}>

      {/* Barra superior móvil — siempre visible en mobile, oculta cuando aparece el header desktop.
          En páginas de mensajes el header desktop aparece desde sm (640px), en el resto desde lg (1024px). */}
      <header
        className={`sticky top-0 z-50 bg-white border-b border-neutral-200 ${isMessagesPage ? "sm:hidden" : "lg:hidden"}`}
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex items-center justify-end h-12 px-4">
          <NotificationBell />
        </div>
      </header>

      {/* Header desktop — oculto en móvil */}
      {/* GUARDRAIL: Header oculto en mobile Host (ver LAYOUT_BREAKPOINT_GUARDRAILS_V1.md) */}
      <header className={`border-b bg-white sticky top-0 z-50 ${isMessagesPage ? "hidden sm:block" : "hidden lg:block"}`}>
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
          <Link href="/host/hoy" className="flex items-center shrink-0">
            <Image
              src="/icons/HausdameHorizontal_sinfondo.png"
              alt="Hausdame logo"
              width={220}
              height={60}
              className="object-contain"
              priority
              style={{ height: "40px", width: "auto" }}
            />
          </Link>
          <DesktopNav menuUser={menuUser} />
        </div>
      </header>

      {/* Contenido principal */}
      <main
        className={`${isMessagesPage ? "p-0 flex flex-col min-h-0 flex-1" : "flex-1 px-4 py-4 sm:px-6 sm:py-6 pb-20 sm:pb-6"}`}
      >
        {children}
      </main>
    </div>
  );
}
