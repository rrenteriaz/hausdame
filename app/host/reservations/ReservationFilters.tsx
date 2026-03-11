"use client";

import { useRouter, useSearchParams } from "next/navigation";
import PropertyPicker from "@/lib/ui/PropertyPicker";
import MobileReservationFilters from "./MobileReservationFilters";

export default function ReservationFilters({
  properties,
  currentPropertyId,
  currentStatus,
  currentDateBucket,
  availableYears,
  currentYear,
}: {
  properties: Array<{ id: string; name: string; shortName: string | null }>;
  currentPropertyId?: string;
  currentStatus?: string;
  currentDateBucket?: "PAST" | "CURRENT_FUTURE" | "ALL" | null;
  availableYears: number[];
  currentYear?: number | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    router.push(`/host/reservations${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const handlePropertyChange = (propertyId: string | "") => {
    updateParams({ propertyId: propertyId || null });
  };

  const handleStatusChange = (value: string) => {
    updateParams({ status: value === "CONFIRMED" ? null : value });
  };

  const handleDateBucketChange = (value: string) => {
    updateParams({ dateBucket: value === "CURRENT_FUTURE" ? null : value, year: null });
  };

  const handleYearChange = (year: number | null) => {
    updateParams({ year: year ? String(year) : null });
  };

  const activeDateBucket = currentDateBucket || "CURRENT_FUTURE";
  const activeStatus = currentStatus || "CONFIRMED";

  return (
    <>
      {/* Móvil: botones circulares */}
      <div className="sm:hidden">
        <MobileReservationFilters
          properties={properties}
          currentPropertyId={currentPropertyId}
          currentStatus={currentStatus}
          currentDateBucket={currentDateBucket}
          availableYears={availableYears}
          currentYear={currentYear}
        />
      </div>

      {/* Desktop: card con dropdowns */}
      <div className="hidden sm:block rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="flex flex-row gap-3">
          {/* Propiedad */}
          <div className="flex-1">
            <PropertyPicker
              properties={properties}
              selectedPropertyId={currentPropertyId || ""}
              onSelect={handlePropertyChange}
              label="Propiedad"
              showLabel={true}
            />
          </div>

          {/* Estado */}
          <div className="flex-1">
            <label className="block text-xs font-medium text-neutral-700 mb-1">Estado</label>
            <select
              value={activeStatus === "all" ? "all" : activeStatus}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500 bg-white min-h-[42px]"
            >
              <option value="CONFIRMED">Confirmada</option>
              <option value="CANCELLED">Cancelada</option>
              <option value="all">Todos los estados</option>
            </select>
          </div>

          {/* Período */}
          <div className="flex-1">
            <label className="block text-xs font-medium text-neutral-700 mb-1">Período</label>
            <select
              value={activeDateBucket}
              onChange={(e) => handleDateBucketChange(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-500 bg-white min-h-[42px]"
            >
              <option value="CURRENT_FUTURE">Próximas</option>
              <option value="PAST">Pasadas</option>
              <option value="ALL">Todas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Year chips — desktop, debajo de la tarjeta */}
      {availableYears.length > 1 && (
        <div className="hidden sm:flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => handleYearChange(null)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              !currentYear
                ? "bg-neutral-900 text-white border-neutral-900"
                : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-500"
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
                  : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-500"
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
