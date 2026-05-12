"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";

const NotificationBell = dynamic(
  () => import("@/components/notifications/NotificationBell"),
  { ssr: false }
);

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  ariaLabel: string;
}

interface DesktopTopNavProps {
  onMenuClick: () => void;
  isMenuOpen: boolean;
}

export default function DesktopTopNav({ onMenuClick, isMenuOpen }: DesktopTopNavProps) {
  const pathname = usePathname();

  const navItems: NavItem[] = [
    {
      href: "/host/hoy",
      label: "Hoy",
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </svg>
      ),
      ariaLabel: "Actividad de hoy",
    },
    {
      href: "/host/cleanings",
      label: "Limpiezas",
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      ),
      ariaLabel: "Limpiezas",
    },
    {
      href: "/host/reservations",
      label: "Reservas",
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
          />
        </svg>
      ),
      ariaLabel: "Reservas",
    },
    {
      href: "/host/inventory/inbox",
      label: "Incidencias",
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      ),
      ariaLabel: "Incidencias de inventario",
    },
  ];

  const isActive = (href: string) => {
    if (href === "/host/hoy") {
      return pathname === "/host/hoy" || pathname?.startsWith("/host/actividad");
    }
    if (href === "/host/reservations") {
      return pathname?.startsWith("/host/reservations");
    }
    return pathname?.startsWith(href);
  };

  return (
    <nav className="flex items-center gap-6 text-base" aria-label="Navegación principal">
      {/* Móvil: Iconos (reusar patrón de Reservas/HostBottomNav) */}
      <div className="flex items-center gap-4 sm:hidden">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center justify-center min-w-[44px] min-h-[44px] transition-colors ${
                active ? "text-neutral-900" : "text-neutral-500"
              }`}
              aria-label={item.ariaLabel}
              aria-current={active ? "page" : undefined}
            >
              {item.icon}
              {active && (
                <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-neutral-900 rounded-full" />
              )}
            </Link>
          );
        })}
        {/* Campana móvil */}
        <NotificationBell />
        {/* Botón Menú en móvil */}
        <button
          type="button"
          onClick={onMenuClick}
          className={`relative flex items-center justify-center min-w-[44px] min-h-[44px] transition-colors ${
            isMenuOpen ? "text-neutral-900" : "text-neutral-500"
          }`}
          aria-label="Menú"
          aria-expanded={isMenuOpen}
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
          {isMenuOpen && (
            <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-neutral-900 rounded-full" />
          )}
        </button>
      </div>

      {/* Desktop: Texto (mantener comportamiento original) */}
      <div className="hidden sm:flex items-center gap-6">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative px-3 py-2 text-neutral-700 hover:text-neutral-900 transition-colors ${
                active ? "text-neutral-900 font-medium" : ""
              }`}
              aria-label={item.ariaLabel}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-900" />
              )}
            </Link>
          );
        })}
        
        {/* Campana desktop */}
        <NotificationBell />
        {/* Botón Menú en desktop */}
        <button
          type="button"
          onClick={onMenuClick}
          className={`px-3 py-2 text-neutral-700 hover:text-neutral-900 transition-colors ${
            isMenuOpen ? "text-neutral-900 font-medium" : ""
          }`}
          aria-label="Menú"
          aria-expanded={isMenuOpen}
        >
          Menú
        </button>
      </div>
    </nav>
  );
}

