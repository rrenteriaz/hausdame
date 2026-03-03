// app/host/inventory/inbox/InventoryInboxClient.tsx
"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  applyInventoryChange,
  rejectInventoryChange,
  resolveInventoryReport,
} from "./actions";
import InventoryInboxItemCard from "./InventoryInboxItemCard";
import ResolveReportModal from "./ResolveReportModal";
import {
  InventoryReportResolution,
  InventoryReportSeverity,
} from "@prisma/client";
import IconFilterButton from "@/lib/ui/IconFilterButton";
import OptionPickerSheet from "@/lib/ui/OptionPickerSheet";
import PropertyPickerSheet from "@/lib/ui/PropertyPickerSheet";

export interface InboxItem {
  type: "CHANGE" | "REPORT";
  id: string;
  itemId: string;
  itemName: string;
  itemThumbnail: string | null;
  property: string;
  propertyId: string | null;
  cleaningId: string | null;
  area: string | null;
  createdAt: Date;
  createdBy: string;
  // Para cambios
  quantityBefore?: number;
  quantityAfter?: number;
  reason?: string;
  reasonOtherText?: string | null;
  note?: string | null;
  status?: string;
  // Para reportes
  reportType?: string;
  severity?: InventoryReportSeverity;
  description?: string | null;
  managerResolution?: InventoryReportResolution | null;
  resolvedAt?: Date | null;
}

interface InventoryInboxClientProps {
  initialItems: InboxItem[];
  summary: { totalPendings: number; urgentReports: number; totalResolved: number };
  properties: Array<{ id: string; name: string; shortName: string | null }>;
  initialTab: string;
  inboxReturnUrl: string;
  initialFilters: {
    propertyId?: string;
    type?: "CHANGE" | "REPORT";
    severity?: InventoryReportSeverity;
    dateRange?: "7d" | "30d" | "all";
  };
}

export default function InventoryInboxClient({
  initialItems,
  summary,
  properties,
  initialTab,
  inboxReturnUrl,
  initialFilters,
}: InventoryInboxClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState(initialTab);
  const [items, setItems] = useState(initialItems);
  const [filters, setFilters] = useState(initialFilters);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<InboxItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Estados para los selectores (bottom sheets)
  const [isPropertySheetOpen, setIsPropertySheetOpen] = useState(false);
  const [isTypeSheetOpen, setIsTypeSheetOpen] = useState(false);
  const [isDateSheetOpen, setIsDateSheetOpen] = useState(false);
  const [isSeveritySheetOpen, setIsSeveritySheetOpen] = useState(false);

  // Recargar items cuando cambien los filtros o el tab
  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const handleApplyChange = async (changeId: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await applyInventoryChange(changeId);
        router.refresh();
      } catch (err: any) {
        setError(err.message || "Error al aplicar el cambio");
      }
    });
  };

  const handleRejectChange = async (changeId: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await rejectInventoryChange(changeId);
        router.refresh();
      } catch (err: any) {
        setError(err.message || "Error al rechazar el cambio");
      }
    });
  };

  const handleResolveReport = async (
    reportId: string,
    resolution: InventoryReportResolution
  ) => {
    setError(null);
    startTransition(async () => {
      try {
        await resolveInventoryReport(reportId, resolution);
        setShowResolveModal(false);
        setSelectedReport(null);
        router.refresh();
      } catch (err: any) {
        setError(err.message || "Error al resolver el reporte");
      }
    });
  };

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
    const params = new URLSearchParams();
    if (newFilters.propertyId) params.set("propertyId", newFilters.propertyId);
    if (newFilters.type) params.set("type", newFilters.type);
    if (newFilters.severity) params.set("severity", newFilters.severity);
    if (newFilters.dateRange && newFilters.dateRange !== "all")
      params.set("dateRange", newFilters.dateRange);
    params.set("tab", tab);
    router.push(`/host/inventory/inbox?${params.toString()}`);
  };

  const handleTabChange = (newTab: string) => {
    setTab(newTab);
    const params = new URLSearchParams();
    if (filters.propertyId) params.set("propertyId", filters.propertyId);
    if (filters.type) params.set("type", filters.type);
    if (filters.severity) params.set("severity", filters.severity);
    if (filters.dateRange && filters.dateRange !== "all")
      params.set("dateRange", filters.dateRange);
    params.set("tab", newTab);
    router.push(`/host/inventory/inbox?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-neutral-200">
        <button
          onClick={() => handleTabChange("pending")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === "pending"
              ? "border-black text-black"
              : "border-transparent text-neutral-600 hover:text-black"
          }`}
        >
          Pendientes ({summary.totalPendings})
        </button>
        <button
          onClick={() => handleTabChange("resolved")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === "resolved"
              ? "border-black text-black"
              : "border-transparent text-neutral-600 hover:text-black"
          }`}
        >
          Resueltos ({summary.totalResolved})
        </button>
      </div>

      {/* Filtros */}
      {/* Móvil: Iconos en línea */}
      <div className="sm:hidden">
        <div className="flex items-center gap-6 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {/* Filtro Propiedad */}
          <IconFilterButton
            icon={
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
            }
            label="Propiedad"
            active={!!filters.propertyId}
            onClick={() => setIsPropertySheetOpen(true)}
          />

          {/* Filtro Tipo */}
          <IconFilterButton
            icon={
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
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                />
              </svg>
            }
            label="Tipo"
            active={!!filters.type}
            onClick={() => setIsTypeSheetOpen(true)}
          />

          {/* Filtro Fecha */}
          <IconFilterButton
            icon={
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
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            }
            label="Fecha"
            active={filters.dateRange !== "all"}
            onClick={() => setIsDateSheetOpen(true)}
          />

          {/* Filtro Severidad (solo si tipo es REPORT) */}
          {filters.type === "REPORT" && (
            <IconFilterButton
              icon={
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
              }
              label="Severidad"
              active={!!filters.severity}
              onClick={() => setIsSeveritySheetOpen(true)}
            />
          )}
        </div>
      </div>

      {/* Desktop: Dropdowns originales */}
      <div className="hidden sm:flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-neutral-700 mb-1">
            Propiedad
          </label>
          <select
            value={filters.propertyId || ""}
            onChange={(e) =>
              handleFilterChange({ ...filters, propertyId: e.target.value || undefined })
            }
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
          >
            <option value="">Todas</option>
            {properties.map((prop) => (
              <option key={prop.id} value={prop.id}>
                {prop.shortName || prop.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-neutral-700 mb-1">
            Tipo
          </label>
          <select
            value={filters.type || ""}
            onChange={(e) => {
              const newType = (e.target.value || undefined) as "CHANGE" | "REPORT" | undefined;
              handleFilterChange({
                ...filters,
                type: newType,
                // Si se cambia el tipo y ya no es REPORT, limpiar severity
                severity: newType === "REPORT" ? filters.severity : undefined,
              });
            }}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
          >
            <option value="">Todos</option>
            <option value="CHANGE">Cambios de cantidad</option>
            <option value="REPORT">Reportes</option>
          </select>
        </div>

        {filters.type === "REPORT" && (
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Severidad
            </label>
            <select
              value={filters.severity || ""}
              onChange={(e) =>
                handleFilterChange({
                  ...filters,
                  severity: (e.target.value ||
                    undefined) as InventoryReportSeverity | undefined,
                })
              }
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
            >
              <option value="">Todas</option>
              <option value="URGENT">Urgente</option>
              <option value="IMPORTANT">Importante</option>
              <option value="INFO">Informativo</option>
            </select>
          </div>
        )}

        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-neutral-700 mb-1">
            Fecha
          </label>
          <select
            value={filters.dateRange || "all"}
            onChange={(e) =>
              handleFilterChange({
                ...filters,
                dateRange: e.target.value as "7d" | "30d" | "all",
              })
            }
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
          >
            <option value="all">Todas</option>
            <option value="7d">Últimos 7 días</option>
            <option value="30d">Últimos 30 días</option>
          </select>
        </div>
      </div>

      {/* Bottom Sheets para móvil */}
      {/* Selector de Propiedad */}
      <PropertyPickerSheet
        isOpen={isPropertySheetOpen}
        onClose={() => setIsPropertySheetOpen(false)}
        properties={properties}
        selectedPropertyId={filters.propertyId || ""}
        onSelect={(propertyId) =>
          handleFilterChange({ ...filters, propertyId: propertyId || undefined })
        }
        title="Filtrar por propiedad"
      />

      {/* Selector de Tipo */}
      <OptionPickerSheet
        isOpen={isTypeSheetOpen}
        onClose={() => setIsTypeSheetOpen(false)}
        title="Filtrar por tipo"
        options={[
          { value: "CHANGE", label: "Cambios de cantidad" },
          { value: "REPORT", label: "Reportes" },
        ]}
        selectedValue={filters.type || ""}
        onSelect={(value) =>
          handleFilterChange({
            ...filters,
            type: (value || undefined) as "CHANGE" | "REPORT" | undefined,
            // Si se cambia el tipo y ya no es REPORT, limpiar severity
            severity: value === "REPORT" ? filters.severity : undefined,
          })
        }
        includeAllOption={{ value: "", label: "Todos" }}
      />

      {/* Selector de Fecha */}
      <OptionPickerSheet
        isOpen={isDateSheetOpen}
        onClose={() => setIsDateSheetOpen(false)}
        title="Filtrar por fecha"
        options={[
          { value: "7d", label: "Últimos 7 días" },
          { value: "30d", label: "Últimos 30 días" },
        ]}
        selectedValue={filters.dateRange || "all"}
        onSelect={(value) =>
          handleFilterChange({
            ...filters,
            dateRange: (value || "all") as "7d" | "30d" | "all",
          })
        }
        includeAllOption={{ value: "all", label: "Todas" }}
      />

      {/* Selector de Severidad (solo si tipo es REPORT) */}
      {filters.type === "REPORT" && (
        <OptionPickerSheet
          isOpen={isSeveritySheetOpen}
          onClose={() => setIsSeveritySheetOpen(false)}
          title="Filtrar por severidad"
          options={[
            { value: "URGENT", label: "Urgente" },
            { value: "IMPORTANT", label: "Importante" },
            { value: "INFO", label: "Informativo" },
          ]}
          selectedValue={filters.severity || ""}
          onSelect={(value) =>
            handleFilterChange({
              ...filters,
              severity: (value || undefined) as InventoryReportSeverity | undefined,
            })
          }
          includeAllOption={{ value: "", label: "Todas" }}
        />
      )}

      {/* Lista de items */}
      {items.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center">
          <p className="text-base text-neutral-600">
            {tab === "pending"
              ? "No hay pendientes"
              : "No hay items resueltos"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <InventoryInboxItemCard
              key={`${item.type}-${item.id}`}
              item={item}
              inboxReturnUrl={inboxReturnUrl}
              onApplyChange={handleApplyChange}
              onRejectChange={handleRejectChange}
              onResolveReport={(report) => {
                setSelectedReport(report);
                setShowResolveModal(true);
              }}
              disabled={isPending || tab === "resolved"}
            />
          ))}
        </div>
      )}

      {/* Modal para resolver reporte */}
      {showResolveModal && selectedReport && selectedReport.type === "REPORT" && (
        <ResolveReportModal
          report={selectedReport}
          onResolve={handleResolveReport}
          onClose={() => {
            setShowResolveModal(false);
            setSelectedReport(null);
          }}
        />
      )}
    </div>
  );
}

