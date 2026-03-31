"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";

interface AllCleaningsFiltersProps {
  monthParam: string;
  propertyId?: string;
  status?: string;
  scope: "upcoming" | "all" | "history";
  availableProperties: Array<{
    id: string;
    name: string;
    shortName?: string | null;
  }>;
  memberId?: string;
}

export default function AllCleaningsFilters({
  monthParam,
  propertyId,
  status,
  scope,
  availableProperties,
  memberId,
}: AllCleaningsFiltersProps) {
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState(monthParam);
  const [selectedProperty, setSelectedProperty] = useState(propertyId || "");
  const [selectedStatus, setSelectedStatus] = useState(status || "");
  const [selectedScope, setSelectedScope] = useState(scope);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const monthPickerRef = useRef<HTMLDivElement>(null);
  const monthListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedMonth(monthParam);
    setSelectedProperty(propertyId || "");
    setSelectedStatus(status || "");
  }, [monthParam, propertyId, status, scope]);

  // Cerrar el picker al hacer click fuera
  useEffect(() => {
    if (!monthPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (monthPickerRef.current && !monthPickerRef.current.contains(e.target as Node)) {
        setMonthPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [monthPickerOpen]);

  // Al abrir el picker, hacer scroll al mes seleccionado
  useEffect(() => {
    if (!monthPickerOpen || !monthListRef.current) return;
    const targetEl = monthListRef.current.querySelector(`[data-value="${selectedMonth}"]`) as HTMLElement | null;
    if (targetEl) {
      monthListRef.current.scrollTop = targetEl.offsetTop;
    }
  }, [monthPickerOpen]);

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = e.target.value;
    setSelectedMonth(newMonth);
    updateUrl(selectedScope, newMonth, selectedProperty, selectedStatus);
  };

  const handlePropertyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProperty = e.target.value;
    setSelectedProperty(newProperty);
    updateUrl(selectedScope, selectedMonth, newProperty, selectedStatus);
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value;
    setSelectedStatus(newStatus);
    updateUrl(selectedScope, selectedMonth, selectedProperty, newStatus);
  };

  const updateUrl = (nextScope: string, month: string, property: string, status: string) => {
    const params = new URLSearchParams();
    if (memberId) params.set("memberId", memberId);
    params.set("scope", nextScope);
    params.set("month", month);
    if (property) {
      params.set("propertyId", property);
    }
    if (status) {
      params.set("status", status);
    }
    router.push(`/cleaner/cleanings/all?${params.toString()}`);
  };

  // Generar opciones de mes (24 meses pasados + mes actual + 12 futuros)
  const today = new Date();
  const monthOptions: Array<{ value: string; label: string }> = [];

  for (let i = -24; i <= 12; i++) {
    const date = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("es-MX", {
      month: "long",
      year: "numeric",
    });
    monthOptions.push({
      value,
      label: label.charAt(0).toUpperCase() + label.slice(1),
    });
  }

  const selectedMonthLabel = monthOptions.find((o) => o.value === selectedMonth)?.label ?? selectedMonth;

  const statusOptions =
    selectedScope === "history"
      ? [
          { value: "", label: "Completadas" },
          { value: "COMPLETED", label: "Completada" },
          { value: "CANCELLED", label: "Cancelada" },
        ]
      : [
          { value: "", label: "Todos los estados" },
          { value: "PENDING", label: "Pendiente" },
          { value: "IN_PROGRESS", label: "En progreso" },
          { value: "COMPLETED", label: "Completada" },
          { value: "CANCELLED", label: "Cancelada" },
        ];

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {[
          { value: "upcoming", label: "Próximas" },
          { value: "all", label: "Todas" },
          { value: "history", label: "Historial" },
        ].map((option) => {
          const isSelected = selectedScope === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setSelectedScope(option.value as typeof selectedScope);
                updateUrl(option.value, selectedMonth, selectedProperty, selectedStatus);
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                isSelected
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Filtro por mes — picker personalizado con 5 meses visibles */}
        <div ref={monthPickerRef} className="relative">
          <label className="block text-xs font-medium text-neutral-700 mb-1.5">
            Mes
          </label>
          <button
            type="button"
            onClick={() => setMonthPickerOpen((v) => !v)}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
          >
            <span>{selectedMonthLabel}</span>
            <svg className="w-4 h-4 text-neutral-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={monthPickerOpen ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
            </svg>
          </button>
          {monthPickerOpen && (
            <div
              ref={monthListRef}
              className="absolute z-50 w-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg overflow-y-auto"
              style={{ maxHeight: "calc(5 * 2.5rem)" }}
            >
              {monthOptions.map((option) => {
                const isSelected = option.value === selectedMonth;
                const isCurrent = option.value === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
                return (
                  <button
                    key={option.value}
                    type="button"
                    data-value={option.value}
                    onClick={() => {
                      setSelectedMonth(option.value);
                      updateUrl(selectedScope, option.value, selectedProperty, selectedStatus);
                      setMonthPickerOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-base transition ${
                      isSelected
                        ? "bg-neutral-900 text-white"
                        : isCurrent
                        ? "font-medium text-neutral-900 hover:bg-neutral-100"
                        : "text-neutral-700 hover:bg-neutral-100"
                    }`}
                    style={{ height: "2.5rem" }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Filtro por propiedad */}
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1.5">
            Propiedad
          </label>
          <select
            value={selectedProperty}
            onChange={handlePropertyChange}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
          >
            <option value="">Todas las propiedades</option>
            {availableProperties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.shortName || property.name}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro por estado */}
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1.5">
            Estado
          </label>
          <select
            value={selectedStatus}
            onChange={handleStatusChange}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

