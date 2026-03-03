// app/host/inventory/inbox/InventoryInboxItemCard.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import {
  InventoryChangeReason,
  InventoryReportType,
  InventoryReportSeverity,
} from "@prisma/client";
import { changeReasonLabel, reportTypeLabel, reportSeverityLabel } from "@/lib/inventory-i18n";

interface InboxItem {
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
  managerResolution?: any;
  resolvedAt?: Date | null;
}

interface InventoryInboxItemCardProps {
  item: InboxItem;
  inboxReturnUrl: string;
  onApplyChange: (changeId: string) => void;
  onRejectChange: (changeId: string) => void;
  onResolveReport: (report: InboxItem) => void;
  disabled?: boolean;
}

export default function InventoryInboxItemCard({
  item,
  inboxReturnUrl,
  onApplyChange,
  onRejectChange,
  onResolveReport,
  disabled = false,
}: InventoryInboxItemCardProps) {

  const getSeverityBadge = (severity: InventoryReportSeverity) => {
    switch (severity) {
      case "URGENT":
        return "bg-red-100 text-red-700";
      case "IMPORTANT":
        return "bg-amber-100 text-amber-700";
      case "INFO":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-neutral-100 text-neutral-700";
    }
  };


  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString("es-MX", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start gap-4">
        {/* Thumbnail */}
        <div className="w-16 h-16 rounded-lg bg-neutral-100 flex-shrink-0 overflow-hidden">
          {item.itemThumbnail ? (
            <Image
              src={item.itemThumbnail}
              alt={item.itemName}
              width={64}
              height={64}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-400 text-xs">
              Sin foto
            </div>
          )}
        </div>

        {/* Contenido */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-neutral-900 truncate">
                {item.itemName}
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5 space-x-1">
                {item.area && (
                  <span className="font-medium">Área: {item.area}</span>
                )}
                {item.area && <span>·</span>}
                <span>{item.property}</span>
                {item.cleaningId && (
                  <>
                    <span>·</span>
                    <Link
                      href={`/host/cleanings/${item.cleaningId}?returnTo=${encodeURIComponent(inboxReturnUrl)}`}
                      className="text-neutral-700 font-medium hover:underline"
                    >
                      Ver limpieza
                    </Link>
                  </>
                )}
              </p>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                item.type === "REPORT" && item.severity === "URGENT"
                  ? "bg-red-100 text-red-700"
                  : "bg-neutral-100 text-neutral-700"
              }`}
            >
              {item.type === "CHANGE" ? "Cambio" : "Reporte"}
            </span>
          </div>

          {/* Detalles según tipo */}
          {item.type === "CHANGE" ? (
            <div className="space-y-1 mb-3">
              <p className="text-sm text-neutral-700">
                <span className="font-medium">Cantidad:</span> {item.quantityBefore} →{" "}
                <span className="font-medium">{item.quantityAfter}</span>
              </p>
              {item.reason && (
                <p className="text-xs text-neutral-600">
                  <span className="font-medium">Razón:</span>{" "}
                  {changeReasonLabel(item.reason as InventoryChangeReason)}
                  {item.reasonOtherText && ` - ${item.reasonOtherText}`}
                </p>
              )}
              {item.note && (
                <p className="text-xs text-neutral-600">
                  <span className="font-medium">Nota:</span> {item.note}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1 mb-3">
              {item.reportType && (
                <p className="text-sm text-neutral-700">
                  <span className="font-medium">Tipo:</span>{" "}
                  {reportTypeLabel(item.reportType as InventoryReportType)}
                </p>
              )}
              {item.severity && (
                <span
                  className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${getSeverityBadge(
                    item.severity
                  )}`}
                >
                  {reportSeverityLabel(item.severity)}
                </span>
              )}
              {item.description && (
                <p className="text-xs text-neutral-600 mt-1">{item.description}</p>
              )}
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span>Por {item.createdBy}</span>
            <span>·</span>
            <span>{formatDate(item.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Acciones */}
      {!disabled && (
        <div className="mt-4 pt-4 border-t border-neutral-200 flex gap-2">
          {item.type === "CHANGE" ? (
            <>
              <button
                onClick={() => onApplyChange(item.id)}
                disabled={disabled}
                className="flex-1 px-4 py-2 rounded-lg bg-black text-sm font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Aceptar y aplicar
              </button>
              <button
                onClick={() => onRejectChange(item.id)}
                disabled={disabled}
                className="flex-1 px-4 py-2 rounded-lg border border-neutral-300 text-sm font-medium text-neutral-700 hover:bg-neutral-50 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Rechazar
              </button>
            </>
          ) : (
            <button
              onClick={() => onResolveReport(item)}
              disabled={disabled}
              className="w-full px-4 py-2 rounded-lg bg-black text-sm font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Resolver
            </button>
          )}
        </div>
      )}
    </div>
  );
}

