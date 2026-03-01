"use client";

// lib/ui/ListRow.tsx
import { ReactNode } from "react";

interface ListRowProps {
  href: string;
  children: ReactNode;
  isLast?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Fila clickeable para listas row.
 * Layout: flex items-center gap-3
 * Padding: py-3 px-3 sm:px-4
 * Separador: border-b (excepto último item)
 *
 * Usa <a> nativo para máxima compatibilidad en móviles: el click/touch
 * dispara navegación nativa del navegador sin depender de client-side routing.
 */
export default function ListRow({
  href,
  children,
  isLast = false,
  className = "",
  ariaLabel,
}: ListRowProps) {
  return (
    <a
      href={href}
      className={`
        flex items-center gap-3
        py-3 px-3 sm:px-4 min-h-[44px]
        ${!isLast ? "border-b border-neutral-200" : ""}
        hover:bg-neutral-50
        active:opacity-95
        focus-visible:ring-2 focus-visible:ring-neutral-300 focus-visible:ring-inset
        transition-colors
        cursor-pointer
        touch-manipulation
        block text-inherit no-underline
        ${className}
      `.trim()}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  );
}

