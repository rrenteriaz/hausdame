"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PropertyPickerSheet from "@/lib/ui/PropertyPickerSheet";
import StatusPickerSheet from "@/lib/ui/StatusPickerSheet";

interface Property {
  id: string;
  name: string;
  shortName?: string | null;
}

interface MobileReservationFiltersProps {
  properties: Property[];
  currentPropertyId?: string;
  currentStatus?: string;
  currentDateBucket?: "PAST" | "CURRENT_FUTURE" | "ALL" | null;
  availableYears?: number[];
  currentYear?: number | null;
}

export default function MobileReservationFilters({
  properties,
  currentPropertyId,
  currentStatus = "CONFIRMED",
  currentDateBucket,
  availableYears = [],
  currentYear,
}: MobileReservationFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPropertySheetOpen, setIsPropertySheetOpen] = useState(false);
  const [isStatusSheetOpen, setIsStatusSheetOpen] = useState(false);

  const statusOptions = [
    { value: "CONFIRMED", label: "Confirmada" },
    { value: "CANCELLED", label: "Cancelada" },
    { value: "all", label: "Todos los estados" },
  ];

  const handlePropertyChange = (propertyId: string | "") => {
    const params = new URLSearchParams(searchParams.toString());
    if (propertyId) {
      params.set("propertyId", propertyId);
    } else {
      params.delete("propertyId");
    }
    // Mantener status y dateBucket
    if (currentStatus && currentStatus !== "CONFIRMED") {
      params.set("status", currentStatus);
    }
    if (currentDateBucket) {
      params.set("dateBucket", currentDateBucket);
    }
    router.push(`/host/reservations${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const handleStatusChange = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    // Mantener propertyId y dateBucket
    if (currentPropertyId) {
      params.set("propertyId", currentPropertyId);
    }
    if (currentDateBucket) {
      params.set("dateBucket", currentDateBucket);
    }
    if (status && status !== "all" && status !== "CONFIRMED") {
      params.set("status", status);
    } else if (status === "all") {
      params.set("status", "all");
    } else {
      params.delete("status");
    }
    router.push(`/host/reservations${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const handleYearChange = (year: number | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (year) {
      params.set("year", String(year));
    } else {
      params.delete("year");
    }
    router.push(`/host/reservations${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const handleDateBucketToggle = (bucket: "PAST" | "CURRENT_FUTURE") => {
    const params = new URLSearchParams(searchParams.toString());
    // Mantener propertyId y status
    if (currentPropertyId) {
      params.set("propertyId", currentPropertyId);
    }
    if (currentStatus && currentStatus !== "CONFIRMED") {
      params.set("status", currentStatus);
    }
    // Toggle: si ya está activo, desactivar; si no, activar y desactivar el otro
    if (currentDateBucket === bucket) {
      params.delete("dateBucket");
    } else {
      params.set("dateBucket", bucket);
    }
    router.push(`/host/reservations${params.toString() ? `?${params.toString()}` : ""}`);
  };

  // Determinar si los botones están activos
  const isPropertyActive = !!currentPropertyId;
  const isStatusActive = currentStatus && currentStatus !== "CONFIRMED" && currentStatus !== "all";
  const isPastActive = currentDateBucket === "PAST";
  const isCurrentFutureActive = currentDateBucket === "CURRENT_FUTURE";

  return (
    <>
      {/* Fila de 4 botones circulares con labels */}
      <div className="flex items-center justify-around gap-2 py-2">
        {/* Botón Propiedad */}
        <button
          type="button"
          onClick={() => setIsPropertySheetOpen(true)}
          className={`flex flex-col items-center gap-1.5 transition ${
            isPropertyActive ? "text-neutral-900" : "text-neutral-700"
          }`}
          aria-label="Filtrar por propiedad"
        >
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center border transition ${
              isPropertyActive
                ? "bg-neutral-900 border-neutral-900 text-white"
                : "bg-neutral-100 border-neutral-200 text-neutral-700"
            }`}
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
                d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
              />
            </svg>
          </div>
          <span
            className={`text-xs ${
              isPropertyActive
                ? "text-neutral-900 font-medium"
                : "text-neutral-500"
            }`}
          >
            Propiedad
          </span>
        </button>

        {/* Botón Estado */}
        <button
          type="button"
          onClick={() => setIsStatusSheetOpen(true)}
          className={`flex flex-col items-center gap-1.5 transition ${
            isStatusActive ? "text-neutral-900" : "text-neutral-700"
          }`}
          aria-label="Filtrar por estado"
        >
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center border transition ${
              isStatusActive
                ? "bg-neutral-900 border-neutral-900 text-white"
                : "bg-neutral-100 border-neutral-200 text-neutral-700"
            }`}
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
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <span
            className={`text-xs ${
              isStatusActive
                ? "text-neutral-900 font-medium"
                : "text-neutral-500"
            }`}
          >
            Estado
          </span>
        </button>

        {/* Botón Anteriores (Pasadas) */}
        <button
          type="button"
          onClick={() => handleDateBucketToggle("PAST")}
          className={`flex flex-col items-center gap-1.5 transition ${
            isPastActive ? "text-neutral-900" : "text-neutral-700"
          }`}
          aria-label="Ver reservas anteriores"
        >
          <div
            className={`relative w-12 h-12 rounded-full flex items-center justify-center border transition ${
              isPastActive
                ? "bg-neutral-900 border-neutral-900 text-white"
                : "bg-neutral-100 border-neutral-200 text-neutral-700"
            }`}
          >
            {/* Icono reloj (base) */}
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6l4 2"
              />
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            </svg>
            {/* Flecha izquierda (alineada horizontalmente) */}
            <svg
              className="absolute left-1 top-1/2 -translate-y-1/2 w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </div>
          <span
            className={`text-xs ${
              isPastActive
                ? "text-neutral-900 font-medium"
                : "text-neutral-500"
            }`}
          >
            Anteriores
          </span>
        </button>

        {/* Botón Actuales (Hoy y futuras) */}
        <button
          type="button"
          onClick={() => handleDateBucketToggle("CURRENT_FUTURE")}
          className={`flex flex-col items-center gap-1.5 transition ${
            isCurrentFutureActive ? "text-neutral-900" : "text-neutral-700"
          }`}
          aria-label="Ver reservas actuales"
        >
          <div
            className={`relative w-12 h-12 rounded-full flex items-center justify-center border transition ${
              isCurrentFutureActive
                ? "bg-neutral-900 border-neutral-900 text-white"
                : "bg-neutral-100 border-neutral-200 text-neutral-700"
            }`}
          >
            {/* Icono reloj (base) */}
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6l4 2"
              />
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            </svg>
            {/* Flecha derecha (alineada horizontalmente) */}
            <svg
              className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </div>
          <span
            className={`text-xs ${
              isCurrentFutureActive
                ? "text-neutral-900 font-medium"
                : "text-neutral-500"
            }`}
          >
            Actuales
          </span>
        </button>
      </div>

      {/* Bottom Sheet de Propiedades */}
      <PropertyPickerSheet
        isOpen={isPropertySheetOpen}
        onClose={() => setIsPropertySheetOpen(false)}
        properties={properties}
        selectedPropertyId={currentPropertyId || ""}
        onSelect={handlePropertyChange}
        title="Seleccionar propiedad"
      />

      {/* Bottom Sheet de Estado */}
      <StatusPickerSheet
        isOpen={isStatusSheetOpen}
        onClose={() => setIsStatusSheetOpen(false)}
        options={statusOptions}
        selectedStatus={currentStatus || "CONFIRMED"}
        onSelect={handleStatusChange}
        title="Seleccionar estado"
      />

      {/* Year chips — móvil */}
      {availableYears.length > 1 && (
        <div className="flex flex-wrap gap-2 px-1 pt-2 pb-1">
          <button
            onClick={() => handleYearChange(null)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              !currentYear
                ? "bg-neutral-900 text-white border-neutral-900"
                : "bg-white text-neutral-700 border-neutral-300"
            }`}
          >
            Todos
          </button>
          {availableYears.map((year) => (
            <button
              key={year}
              onClick={() => handleYearChange(year)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                currentYear === year
                  ? "bg-neutral-900 text-white border-neutral-900"
                  : "bg-white text-neutral-700 border-neutral-300"
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

