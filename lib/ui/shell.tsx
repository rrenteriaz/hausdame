// lib/ui/shell.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { DesktopNav } from "./HostNavigation";

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
      {/* Header tipo Airbnb: simple, limpio - oculto en móvil (Host usa bottom nav) y en páginas de mensajes */}
      {/* GUARDRAIL: Header oculto en mobile Host (ver LAYOUT_BREAKPOINT_GUARDRAILS_V1.md) */}
      <header className={`border-b bg-white sticky top-0 z-50 ${isMessagesPage ? "hidden sm:block" : "hidden lg:block"}`}>
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
          {/* Marca Hausdame */}
          <Link href="/host/hoy" className="flex items-center shrink-0">
            <Image
              src="/hausdame_SinFondo2.png"
              alt="Hausdame logo"
              width={180}
              height={160}
              className="object-contain"
            />
          </Link>

          {/* Navegación (TopNav) - solo desktop */}
          <DesktopNav menuUser={menuUser} />
        </div>
      </header>

      {/* Contenido principal */}
      {/* En páginas de mensajes: altura fija usando --app-vh si está disponible, sin scroll del main (solo el área de mensajes scrollea) */}
      <main
        className={`${isMessagesPage ? "p-0 flex flex-col min-h-0 flex-1 sm:flex-1 sm:h-auto" : "flex-1 px-4 py-4 sm:px-6 sm:py-6 pb-20 sm:pb-6"}`}
        style={isMessagesPage ? {
          height: "calc(var(--app-vh, 1dvh) * 100)",
          maxHeight: "calc(var(--app-vh, 1dvh) * 100)"
        } : undefined}
      >
        {children}
      </main>
    </div>
  );
}
