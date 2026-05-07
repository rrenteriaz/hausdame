// app/cleaner/layout-client.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { OfflineInit } from "@/components/offline/OfflineInit";
import LogoutSyncListener from "@/lib/auth/LogoutSyncListener";
import CleanerMenu from "@/lib/ui/CleanerMenu";

/**
 * Aislamos useSearchParams en su propio componente para cumplir el requisito
 * de Next.js: cualquier componente que llame useSearchParams() debe estar
 * dentro de un <Suspense>. Esto evita inconsistencias de hidratación.
 */
function HoyLink({ className, activeClassName }: { className: string; activeClassName: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Preservar view/date/month si ya estamos en /cleaner
  const href =
    pathname === "/cleaner" && searchParams.toString()
      ? `/cleaner?${searchParams.toString()}`
      : "/cleaner";

  const isActive = pathname === "/cleaner";

  return (
    <Link
      href={href}
      className={`${className} ${isActive ? activeClassName : ""}`}
      aria-current={isActive ? "page" : undefined}
    >
      Hoy
      {isActive && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-900" />
      )}
    </Link>
  );
}

function HoyLinkMobile({
  className,
  activeClassName,
}: {
  className: string;
  activeClassName: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const href =
    pathname === "/cleaner" && searchParams.toString()
      ? `/cleaner?${searchParams.toString()}`
      : "/cleaner";

  const isActive = pathname === "/cleaner";

  return (
    <Link
      href={href}
      className={`${className} ${isActive ? activeClassName : "text-neutral-500 hover:text-neutral-700"}`}
      aria-current={isActive ? "page" : undefined}
    >
      <span className="text-xl">📅</span>
      <span className={`text-[10px] font-medium ${isActive ? "text-neutral-900" : "text-neutral-500"}`}>
        Hoy
      </span>
      {isActive && (
        <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-neutral-900 rounded-full" />
      )}
    </Link>
  );
}

export default function CleanerLayoutClient({
  children,
  menuUser,
  inProgressCleanings = [],
  isTeamLeader = false,
}: {
  children: React.ReactNode;
  menuUser: { email: string; nickname: string | null; fullName: string | null };
  inProgressCleanings?: { id: string }[];
  isTeamLeader?: boolean;
}) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const hasInProgress = inProgressCleanings.length > 0;
  const inProgressHref =
    inProgressCleanings.length === 1
      ? `/cleaner/cleanings/${inProgressCleanings[0].id}?returnTo=/cleaner`
      : `/cleaner/cleanings/all?scope=all&status=IN_PROGRESS&returnTo=/cleaner`;

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

  const otherNavItems = [
    ...(hasInProgress
      ? [{ href: inProgressHref, label: "En progreso", icon: "⚡" }]
      : []),
    { href: "/cleaner/history", label: "Historial", icon: "📋" },
    { href: "/cleaner/marketplace", label: "Marketplace", icon: "🔍" },
    { href: "/cleaner/messages", label: "Mensajes", icon: "💬" },
  ];

  return (
    <div className={`${isThreadPage ? "h-[100dvh] flex flex-col overflow-hidden bg-neutral-50" : "min-h-screen flex flex-col bg-neutral-50"}`}>
      <LogoutSyncListener />
      <OfflineInit />

      {/* Header desktop (patrón Host) */}
      <header className="hidden sm:block border-b bg-white sticky top-0 z-50">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
          <Link href="/cleaner" className="flex items-center shrink-0">
            <Image
              src="/icons/hausdame_Sin fondo.png"
              alt="Hausdame logo"
              width={180}
              height={160}
              className="object-contain"
            />
          </Link>

          <nav className="flex items-center gap-4 text-base" aria-label="Navegación principal">
            {/* Hoy: aislado en Suspense porque usa useSearchParams */}
            <Suspense
              fallback={
                <Link href="/cleaner" className="relative px-3 py-2 text-neutral-700 hover:text-neutral-900 transition-colors">
                  Hoy
                </Link>
              }
            >
              <HoyLink
                className="relative px-3 py-2 text-neutral-700 hover:text-neutral-900 transition-colors"
                activeClassName="text-neutral-900 font-medium"
              />
            </Suspense>

            {otherNavItems.map((item) => {
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
        className={`${isThreadPage ? "p-0 flex flex-col overflow-hidden min-h-0 sm:flex-1 sm:h-auto sm:overflow-visible" : "flex-1 px-4 py-4 sm:px-6 sm:py-6 pb-28 sm:pb-16"}`}
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
            {/* Hoy: aislado en Suspense */}
            <Suspense
              fallback={
                <Link
                  href="/cleaner"
                  className="relative flex flex-col items-center justify-center gap-1 min-w-[44px] min-h-[44px] px-3 py-2 transition-colors text-neutral-500 hover:text-neutral-700"
                >
                  <span className="text-xl">📅</span>
                  <span className="text-[10px] font-medium text-neutral-500">Hoy</span>
                </Link>
              }
            >
              <HoyLinkMobile
                className="relative flex flex-col items-center justify-center gap-1 min-w-[44px] min-h-[44px] px-3 py-2 transition-colors"
                activeClassName="text-neutral-900"
              />
            </Suspense>

            {otherNavItems.map((item) => {
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

            {/* Menú */}
            <button
              type="button"
              onClick={() => setIsMenuOpen(true)}
              className="flex flex-col items-center justify-center gap-1 min-w-[44px] min-h-[44px] px-3 py-2 transition-colors text-neutral-500 hover:text-neutral-700"
              aria-label="Menú"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span className="text-[10px] font-medium">Menú</span>
            </button>
          </div>
        </nav>
      )}

      {/* Menú */}
      <CleanerMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        user={menuUser}
        isTeamLeader={isTeamLeader}
      />
    </div>
  );
}
