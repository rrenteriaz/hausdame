// app/cleaner/layout-client.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { OfflineInit } from "@/components/offline/OfflineInit";
import LogoutSyncListener from "@/lib/auth/LogoutSyncListener";
import CleanerMenu from "@/lib/ui/CleanerMenu";

export default function CleanerLayoutClient({
  children,
  menuUser,
  inProgressCleanings = [],
}: {
  children: React.ReactNode;
  menuUser: { email: string; nickname: string | null; fullName: string | null };
  inProgressCleanings?: { id: string }[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Cuando ya estamos en /cleaner, preservar view/date/month para evitar que tap en Hoy pierda la vista día
  const hoyHref =
    pathname === "/cleaner" && searchParams.toString()
      ? `/cleaner?${searchParams.toString()}`
      : "/cleaner";

  const hasInProgress = inProgressCleanings.length > 0;
  const inProgressHref =
    inProgressCleanings.length === 1
      ? `/cleaner/cleanings/${inProgressCleanings[0].id}?returnTo=/cleaner`
      : `/cleaner/cleanings/all?scope=all&status=IN_PROGRESS&returnTo=/cleaner`;

  const navItems = [
    { href: hoyHref, label: "Hoy", icon: "📅" },
    ...(hasInProgress
      ? [{ href: inProgressHref, label: "En progreso", icon: "⚡" }]
      : []),
    { href: "/cleaner/history", label: "Historial", icon: "📋" },
    { href: "/cleaner/marketplace", label: "Marketplace", icon: "🔍" },
    { href: "/cleaner/messages", label: "Mensajes", icon: "💬" },
    { href: "#", label: "Menú", icon: null, isMenu: true },
  ];

  const isActive = (href: string) => {
    if (href === "/cleaner") {
      return pathname === "/cleaner";
    }
    if (href === "/cleaner/messages") {
      return pathname?.startsWith("/cleaner/messages");
    }
    if (href === "/cleaner/marketplace") {
      return pathname?.startsWith("/cleaner/marketplace");
    }
    // Para links con query params (ej: inProgressHref), comparar solo el pathname
    const hrefPath = href.split("?")[0];
    return pathname?.startsWith(hrefPath);
  };
  
  // Ocultar bottom nav solo en thread pages (no en inbox /cleaner/messages)
  const isThreadPage = pathname?.match(/^\/cleaner\/messages\/[^/]+$/);

  return (
    <div className={`${isThreadPage ? "h-[100dvh] flex flex-col overflow-hidden bg-neutral-50" : "min-h-screen flex flex-col bg-neutral-50"}`}>
      <LogoutSyncListener />
      <OfflineInit />

      {/* Header desktop (patrón Host) */}
      <header className="hidden sm:block border-b bg-white sticky top-0 z-50">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
          <Link href="/cleaner" className="flex items-center shrink-0">
            <Image
              src="/hausdame_SinFondo2.png"
              alt="Hausdame logo"
              width={180}
              height={160}
              className="object-contain"
            />
          </Link>

          <nav className="flex items-center gap-4 text-base" aria-label="Navegación principal">
            {navItems
              .filter((i) => !i.isMenu)
              .map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative px-3 py-2 text-neutral-700 hover:text-neutral-900 transition-colors ${
                      active ? "text-neutral-900 font-medium" : ""
                    }`}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                    {active && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-900" />
                    )}
                  </Link>
                );
              })}
            <button
              type="button"
              onClick={() => setIsMenuOpen(true)}
              className={`px-3 py-2 text-neutral-700 hover:text-neutral-900 transition-colors ${
                isMenuOpen ? "text-neutral-900 font-medium" : ""
              }`}
              aria-label="Menú"
              aria-expanded={isMenuOpen}
            >
              Menú
            </button>
          </nav>
        </div>
      </header>

      {/* Contenido principal */}
      <main
        className={`${isThreadPage ? "p-0 flex flex-col overflow-hidden min-h-0 sm:flex-1 sm:h-auto sm:overflow-visible" : "flex-1 px-4 py-4 sm:px-6 sm:py-6 pb-28 sm:pb-6"}`}
        style={isThreadPage ? {
          height: "calc(var(--app-vh, 1dvh) * 100)",
          minHeight: "calc(var(--app-vh, 1dvh) * 100)",
        } : undefined}
      >
        {children}
      </main>

      {/* Bottom nav móvil (patrón Host) - oculto en desktop y en thread pages */}
      {!isThreadPage && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-neutral-200 pb-[env(safe-area-inset-bottom)] sm:hidden"
          aria-label="Navegación principal"
        >
          <div className={`grid h-16 ${hasInProgress ? "grid-cols-6" : "grid-cols-5"}`}>
            {navItems.map((item) => {
              if (item.isMenu) {
                return (
                  <button
                    key="menu"
                    type="button"
                    onClick={() => setIsMenuOpen(true)}
                    className="flex flex-col items-center justify-center gap-1 min-w-[44px] min-h-[44px] px-3 py-2 transition-colors text-neutral-500 hover:text-neutral-700"
                    aria-label="Menú"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </button>
                );
              }
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex flex-col items-center justify-center gap-1 min-w-[44px] min-h-[44px] px-3 py-2 transition-colors ${
                    active ? "text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className={`text-[10px] font-medium ${active ? "text-neutral-900" : "text-neutral-500"}`}>
                    {item.label}
                  </span>
                  {active && (
                    <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-neutral-900 rounded-full" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* Menú */}
      <CleanerMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        user={menuUser}
      />
    </div>
  );
}

