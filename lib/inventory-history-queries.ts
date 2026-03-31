import prisma from "@/lib/prisma";
import { InventoryReportStatus } from "@prisma/client";

if (typeof window !== "undefined") {
  throw new Error("Este archivo solo puede ser importado en el servidor.");
}

/**
 * Obtiene estadísticas de incidencias para un conjunto de líneas de inventario.
 * Filtra estrictamente por inventoryLineId para garantizar el aislamiento de historial.
 */
export async function fetchInventoryHistoryStats(lineIds: string[], tenantId: string) {
  if (lineIds.length === 0 || !tenantId) return new Map();

  const reports = await prisma.inventoryReport.findMany({
    where: {
      tenantId,
      inventoryLineId: { in: lineIds },
    },
    select: {
      inventoryLineId: true,
      status: true,
      createdAt: true,
      type: true,
      managerResolution: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const statsMap = new Map<string, {
    totalCount: number;
    activeCount: number;
    resolvedCount: number;
    latestReport: {
      type: string;
      createdAt: Date;
      status: string;
      managerResolution: string | null;
    } | null;
  }>();

  for (const report of reports) {
    const lineId = report.inventoryLineId!;
    if (!statsMap.has(lineId)) {
      statsMap.set(lineId, {
        totalCount: 0,
        activeCount: 0,
        resolvedCount: 0,
        latestReport: {
          type: report.type,
          createdAt: report.createdAt,
          status: report.status,
          managerResolution: report.managerResolution,
        },
      });
    }

    const stats = statsMap.get(lineId)!;
    stats.totalCount++;

    if (report.status === InventoryReportStatus.PENDING || report.status === InventoryReportStatus.ACKNOWLEDGED) {
      stats.activeCount++;
    } else if (report.status === InventoryReportStatus.RESOLVED) {
      stats.resolvedCount++;
    }
  }

  return statsMap;
}

/**
 * Obtiene el historial completo de incidencias para una línea de inventario específica.
 */
export async function getInventoryLineHistory(lineId: string, tenantId: string) {
  return await prisma.inventoryReport.findMany({
    where: {
      tenantId,
      inventoryLineId: lineId,
    },
    include: {
      createdBy: {
        select: { name: true, email: true },
      },
      evidence: {
        include: {
          asset: {
            select: { publicUrl: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
