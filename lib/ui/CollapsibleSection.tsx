"use client";

import { useState, useEffect } from "react";

interface CollapsibleSectionProps {
  title?: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean; // Control externo
  onOpenChange?: (open: boolean) => void; // Callback para cambios
  headerActions?: React.ReactNode; // Acciones en el header (ej: botón eliminar)
}

export default function CollapsibleSection({
  title,
  count,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  headerActions,
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  
  // Si se proporciona open controlado, usarlo; si no, usar estado interno
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  
  const handleToggle = () => {
    const newOpen = !isOpen;
    if (controlledOpen === undefined) {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 py-2">
        <button
          type="button"
          onClick={handleToggle}
          className="flex-1 flex items-center justify-between min-w-0 group"
        >
          <h2 className="text-base font-semibold text-neutral-800 truncate">
            {title ? `${title}${count !== undefined ? ` (${count})` : ""}` : count !== undefined ? `(${count})` : ""}
          </h2>
          <svg
            className={`flex-shrink-0 w-5 h-5 text-neutral-400 transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
        {headerActions && (
          <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
            {headerActions}
          </div>
        )}
      </div>
      {isOpen && children}
    </div>
  );
}

