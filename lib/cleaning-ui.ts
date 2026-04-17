// lib/cleaning-ui.ts
export type CleaningStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

type Ui = {
  pillClass: string;
  rowClass: string;
  statusText?: string;
  titleClass?: string;
  symbol?: string;
};

// Helper para obtener el color de una propiedad basado en su índice
const colorClasses = [
  "bg-emerald-500",
  "bg-sky-500",
  "bg-amber-500",
  "bg-fuchsia-500",
  "bg-rose-500",
  "bg-slate-500",
] as const;

export function getPropertyColor(propertyIndex: number): string {
  return colorClasses[propertyIndex % colorClasses.length];
}

export function getCleaningUi(status: CleaningStatus | string, propertyColorClass: string): Ui {
  // Base pill (ultra compacta)
  const pillBase =
    "truncate rounded-full text-white px-0.5 py-[3px] text-[7px] leading-none";

  // Base row (ajustado al layout actual)
  const rowBase =
    "rounded-2xl border border-neutral-200 bg-white p-3 flex flex-col gap-1";

  switch (status) {
    case "CANCELLED":
      return {
        pillClass: `${pillBase} bg-[#c9c9ca] text-black line-through`,
        rowClass: `${rowBase} bg-[#c9c9ca] opacity-80`,
        titleClass: "line-through text-black",
        statusText: "Cancelada",
        symbol: "✕ ",
      };

    case "COMPLETED":
      return {
        pillClass: `${pillBase} bg-neutral-200 text-neutral-600`,
        rowClass: `${rowBase}`,
        titleClass: "text-neutral-500",
        statusText: "Completada",
        symbol: "✓ ",
      };

    case "IN_PROGRESS":
      return {
        pillClass: `${pillBase} ${propertyColorClass} ring-1 ring-black/30`,
        rowClass: `${rowBase}`,
        titleClass: "text-neutral-900",
      };

    case "PENDING":
    default:
      return {
        pillClass: `${pillBase} ${propertyColorClass}`,
        rowClass: `${rowBase}`,
        titleClass: "text-neutral-900",
      };
  }
}

/**
 * Formatea el estado de una limpieza a texto en español
 */
export function formatCleaningStatus(status: CleaningStatus | string): string {
  switch (status) {
    case "PENDING":
      return "Pendiente";
    case "IN_PROGRESS":
      return "En progreso";
    case "COMPLETED":
      return "Completada";
    case "CANCELLED":
      return "Cancelada";
    default:
      return String(status);
  }
}

