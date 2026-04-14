"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import DailyCleaningsViewWithModal from "./DailyCleaningsViewWithModal";
// Formas locales — no dependen de Prisma
interface CleaningWithProperty {
  id: string;
  propertyId: string;
  scheduledDate: Date;
  status: string;
  notes: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  needsAttention?: boolean;
  attentionReason?: string | null;
  property: {
    id: string;
    name: string;
    shortName: string | null;
  };
  viewsCount?: number;
  [key: string]: unknown;
}

type PropertyListItem = {
  id: string;
  name: string;
  shortName: string | null;
  isActive: boolean;
};

interface CleaningsViewShellProps {
  cleanings: CleaningWithProperty[];
  properties: PropertyListItem[];
  referenceDate: Date;
  monthDate: Date;
  monthParamForLinks: string;
  dateParamForLinks: string;
  initialView: "day" | "week" | "month";
  MonthlyCleaningsCalendar: React.ReactNode;
  WeeklyCleaningsView: React.ReactNode;
}

/**
 * Shell cliente que maneja el viewMode localmente para cambios instantáneos
 * sin navegación ni refetch del servidor.
 */
export default function CleaningsViewShell({
  cleanings,
  properties,
  referenceDate,
  monthDate,
  monthParamForLinks,
  dateParamForLinks,
  initialView,
  MonthlyCleaningsCalendar,
  WeeklyCleaningsView,
}: CleaningsViewShellProps) {
  const searchParams = useSearchParams();
  const viewFromUrl = searchParams.get("view");
  const syncedView: "day" | "week" | "month" =
    viewFromUrl === "day" || viewFromUrl === "week" || viewFromUrl === "month"
      ? viewFromUrl
      : initialView;

  const [viewMode, setViewMode] = useState<"day" | "week" | "month">(syncedView);

  // Sincronizar viewMode cuando la URL cambia (ej: click en un día del calendario)
  useEffect(() => {
    setViewMode(syncedView);
  }, [syncedView]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-800">
          Calendario de limpiezas
        </h2>
        {/* Tabs de vista: Día / Semana / Mes (botones locales, no Links) */}
        <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 p-1 text-xs">
          <button
            type="button"
            onClick={() => setViewMode("day")}
            className={`px-3 py-1 rounded-full transition ${
              viewMode === "day"
                ? "bg-black text-white"
                : "text-neutral-700 hover:bg-white"
            }`}
          >
            Día
          </button>
          <button
            type="button"
            onClick={() => setViewMode("week")}
            className={`px-3 py-1 rounded-full transition ${
              viewMode === "week"
                ? "bg-black text-white"
                : "text-neutral-700 hover:bg-white"
            }`}
          >
            Semana
          </button>
          <button
            type="button"
            onClick={() => setViewMode("month")}
            className={`px-3 py-1 rounded-full transition ${
              viewMode === "month"
                ? "bg-black text-white"
                : "text-neutral-700 hover:bg-white"
            }`}
          >
            Mes
          </button>
        </div>
      </div>

      {/* Contenido según vista (renderizado local, sin refetch) */}
      {viewMode === "month" && MonthlyCleaningsCalendar}

      {viewMode === "week" && WeeklyCleaningsView}

      {viewMode === "day" && (
        <DailyCleaningsViewWithModal
          cleanings={cleanings as any}
          properties={properties}
          referenceDate={referenceDate}
          view={viewMode}
          monthParamForLinks={monthParamForLinks}
          dateParamForLinks={dateParamForLinks}
        />
      )}
    </section>
  );
}

