// app/host/inventory/inbox/actions.ts
"use server";

import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { revalidatePath } from "next/cache";
import {
  InventoryChangeStatus,
  InventoryReportStatus,
  InventoryReportResolution,
  InventoryReportSeverity,
  InventoryCondition,
  InventoryChangeReason,
  InventoryReportType,
} from "@/lib/generated/prisma";
import { fetchInventoryHistoryStats, getInventoryLineHistory } from "@/lib/inventory-history-queries";

import { InboxItem } from "./types";

/**
 * Obtiene el resumen de pendientes y resueltos del inbox de inventario.
 */
export async function getInventoryInboxSummary() {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) return { totalPendings: 0, urgentReports: 0, totalResolved: 0 };

  const [pendingChanges, pendingReports, resolvedChanges, resolvedReports] = await Promise.all([
    prisma.inventoryReviewItemChange.count({
      where: {
        tenantId,
        status: InventoryChangeStatus.PENDING,
      },
    }),
    prisma.inventoryReport.count({
      where: {
        tenantId,
        status: InventoryReportStatus.PENDING,
      },
    }),
    prisma.inventoryReviewItemChange.count({
      where: {
        tenantId,
        status: {
          in: [InventoryChangeStatus.ACCEPTED, InventoryChangeStatus.REJECTED, InventoryChangeStatus.APPLIED],
        },
      },
    }),
    prisma.inventoryReport.count({
      where: {
        tenantId,
        status: InventoryReportStatus.RESOLVED,
      },
    }),
  ]);

  const urgentReports = await prisma.inventoryReport.count({
    where: {
      tenantId,
      status: InventoryReportStatus.PENDING,
      severity: InventoryReportSeverity.URGENT,
    },
  });

  return {
    totalPendings: pendingChanges + pendingReports,
    urgentReports,
    totalResolved: resolvedChanges + resolvedReports,
  };
}

interface InboxFilters {
  propertyId?: string;
  type?: "CHANGE" | "REPORT";
  severity?: InventoryReportSeverity;
  status?: "PENDING" | "RESOLVED";
  dateRange?: "7d" | "30d" | "all";
}

/**
 * Obtiene los items del inbox (cambios y reportes) con filtros.
 */
export async function getInventoryInboxItems(filters: InboxFilters = {}): Promise<InboxItem[]> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) return [];

  const { propertyId, type, severity, status = "PENDING", dateRange = "all" } = filters;

  // Calcular fecha límite si aplica
  let dateFrom: Date | undefined;
  if (dateRange === "7d") {
    dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 7);
  } else if (dateRange === "30d") {
    dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 30);
  }

  // Obtener cambios
  const changes =
    type !== "REPORT"
      ? await prisma.inventoryReviewItemChange.findMany({
          where: {
            tenantId,
            status:
              status === "PENDING"
                ? InventoryChangeStatus.PENDING
                : {
                    in: [
                      InventoryChangeStatus.ACCEPTED,
                      InventoryChangeStatus.APPLIED,
                      InventoryChangeStatus.REJECTED,
                    ],
                  },
            ...(dateFrom ? { createdAt: { gte: dateFrom } } : {}),
            ...(propertyId
              ? {
                  review: {
                    propertyId,
                  },
                }
              : {}),
          },
          include: {
            review: {
              include: {
                cleaning: {
                  include: {
                    property: {
                      select: {
                        id: true,
                        name: true,
                        shortName: true,
                      },
                    },
                    TeamMembership: {
                      select: { User: { select: { name: true, email: true } } },
                    },
                    assignedMember: {
                      select: {
                        name: true,
                        user: { select: { name: true, email: true } },
                      },
                    },
                    assignedTo: { select: { name: true, email: true } },
                    assignees: {
                      take: 1,
                      include: {
                        member: {
                          select: {
                            name: true,
                            user: { select: { name: true, email: true } },
                          },
                        },
                      },
                    },
                  },
                },
                reviewedBy: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
            item: {
              include: {
                inventoryItemAssets: {
                  where: { position: 1 },
                  include: {
                    asset: true,
                  },
                  take: 1,
                },
              },
            },
            inventoryLine: {
              select: {
                area: true,
                // Fase 5: zona física como source of truth
                propertyZone: {
                  select: { id: true, name: true, sortOrder: true, zoneType: true },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

  // Obtener reportes
  const reports =
    type !== "CHANGE"
      ? await prisma.inventoryReport.findMany({
          where: {
            tenantId,
            status:
              status === "PENDING"
                ? InventoryReportStatus.PENDING
                : {
                    in: [
                      InventoryReportStatus.RESOLVED,
                      InventoryReportStatus.ACKNOWLEDGED,
                      InventoryReportStatus.REJECTED,
                    ],
                  },
            ...(severity ? { severity } : {}),
            ...(propertyId
              ? {
                  OR: [
                    { review: { propertyId } },
                    { cleaning: { propertyId } },
                  ],
                }
              : {}),
            ...(dateFrom ? { createdAt: { gte: dateFrom } } : {}),
          },
          include: {
            review: {
              include: {
                property: {
                  select: {
                    id: true,
                    name: true,
                    shortName: true,
                  },
                },
              },
            },
            cleaning: {
              include: {
                property: {
                  select: {
                    id: true,
                    name: true,
                    shortName: true,
                  },
                },
              },
            },
            item: {
              include: {
                inventoryItemAssets: {
                  where: { position: 1 },
                  include: {
                    asset: true,
                  },
                  take: 1,
                },
              },
            },
            inventoryLine: {
              select: {
                area: true,
                // Fase 5: zona física como source of truth
                propertyZone: {
                  select: { id: true, name: true, sortOrder: true, zoneType: true },
                },
              },
            },
            resolvedBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            evidence: {
              select: {
                id: true,
                asset: {
                  select: {
                    id: true,
                    publicUrl: true,
                    variant: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

  // Combinar y formatear resultados
  const items = [
    ...changes.map((change) => ({
      type: "CHANGE" as const,
      id: change.id,
      itemId: change.itemId,
      itemName: change.item.name,
      itemThumbnail: change.item.inventoryItemAssets[0]?.asset?.publicUrl || null,
      property:
        change.review?.cleaning?.property?.shortName ||
        change.review?.cleaning?.property?.name ||
        "N/A",
      propertyId: change.review?.cleaning?.propertyId || null,
      cleaningId: change.review?.cleaningId || null,
      area: change.inventoryLine?.propertyZone?.name ?? change.inventoryLine?.area ?? null, // Fase 5
      quantityBefore: change.quantityBefore,
      quantityAfter: change.quantityAfter,
      reason: change.reason,
      reasonOtherText: change.reasonOtherText,
      note: change.note,
      status: change.status,
      createdBy: (() => {
        if (change.review?.reviewedBy?.name) return change.review.reviewedBy!.name!;
        if (change.review?.reviewedBy?.email) return change.review.reviewedBy!.email!;
        const c = change.review?.cleaning;
        if (c?.TeamMembership?.User?.name) return c.TeamMembership.User.name;
        if (c?.TeamMembership?.User?.email) return c.TeamMembership.User.email;
        if (c?.assignedMember?.user?.name) return c.assignedMember.user.name;
        if (c?.assignedMember?.user?.email) return c.assignedMember.user.email;
        if (c?.assignedMember?.name) return c.assignedMember.name;
        if (c?.assignedTo?.name) return c.assignedTo.name;
        if (c?.assignedTo?.email) return c.assignedTo.email;
        const assignee = c?.assignees?.[0]?.member;
        if (assignee?.user?.name) return assignee.user.name;
        if (assignee?.user?.email) return assignee.user.email;
        if (assignee?.name) return assignee.name;
        return "Cleaner";
      })(),
      inventoryLineId: change.inventoryLineId || null,
      createdAt: change.createdAt,
    })),
    ...reports.map((report) => ({
      type: "REPORT" as const,
      id: report.id,
      itemId: report.itemId,
      itemName: report.item.name,
      itemThumbnail: 
        report.evidence[0]?.asset?.publicUrl || 
        report.item.inventoryItemAssets[0]?.asset?.publicUrl || 
        null,
      property:
        report.review?.property?.shortName ||
        report.review?.property?.name ||
        report.cleaning?.property?.shortName ||
        report.cleaning?.property?.name ||
        "N/A",
      propertyId:
        report.review?.propertyId || report.cleaning?.propertyId || null,
      cleaningId: report.cleaningId || report.review?.cleaningId || null,
      area: report.inventoryLine?.propertyZone?.name ?? report.inventoryLine?.area ?? null, // Fase 5
      reportType: report.type,
      severity: report.severity,
      description: report.description,
      status: report.status,
      managerResolution: report.managerResolution,
      createdBy:
        report.createdBy?.name || report.createdBy?.email || "Cleaner",
      inventoryLineId: report.inventoryLineId || null,
      createdAt: report.createdAt,
      resolvedAt: report.resolvedAt,
      resolvedBy: report.resolvedBy?.name || report.resolvedBy?.email || null,
      evidence: report.evidence
        .map((ev) => ({
          id: ev.id,
          url: ev.asset.publicUrl!,
          variant: ev.asset.variant as string | null,
        })),
    })),
  ];

  // Ordenar por fecha (más recientes primero)
  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Fallback: si area es null (p. ej. legacy sin inventoryLineId), buscar en InventoryLine por itemId+propertyId
  const needArea = items.filter((i) => !i.area && i.propertyId);
  if (needArea.length > 0) {
    const uniquePairs = Array.from(
      new Map(needArea.map((i) => [`${i.itemId}-${i.propertyId}`, { itemId: i.itemId, propertyId: i.propertyId! }])).values()
    );
    const fallbackLines = await prisma.inventoryLine.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: uniquePairs.map((p) => ({ itemId: p.itemId, propertyId: p.propertyId })),
      },
      select: {
        itemId: true,
        propertyId: true,
        area: true,
        // Fase 5: zona física como source of truth
        propertyZone: {
          select: { id: true, name: true, sortOrder: true },
        },
      },
      orderBy: { propertyZone: { sortOrder: "asc" } }, // Fase 5
    });
    const areaByKey = new Map<string, string>();
    for (const line of fallbackLines) {
      const key = `${line.itemId}-${line.propertyId}`;
      // Fase 5: usar propertyZone.name como source of truth; fallback a area
      if (!areaByKey.has(key)) areaByKey.set(key, line.propertyZone?.name ?? line.area);
    }
    for (const item of items) {
      if (!item.area && item.propertyId) {
        const key = `${item.itemId}-${item.propertyId}`;
        const fallbackArea = areaByKey.get(key);
        if (fallbackArea) item.area = fallbackArea;
      }
    }
  }

  // Enriquecer con historyStats
  const lineIds = Array.from(new Set(items.map((i) => i.inventoryLineId).filter(Boolean))) as string[];
  const historyStatsMap = await fetchInventoryHistoryStats(lineIds, tenantId);

  return items.map((item) => ({
    ...item,
    inventoryLineId: item.inventoryLineId || null,
    historyStats: item.inventoryLineId ? historyStatsMap.get(item.inventoryLineId) || null : null,
  }));
}

/**
 * Aplica un cambio de cantidad (acepta y actualiza el inventario).
 */
export async function applyInventoryChange(changeId: string) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const change = await prisma.inventoryReviewItemChange.findFirst({
    where: { id: changeId, tenantId },
    include: {
      review: {
        include: {
          cleaning: true,
        },
      },
    },
  });

  if (!change) {
    throw new Error("Cambio no encontrado");
  }

  if (change.tenantId !== tenantId) {
    throw new Error("No tienes permiso para este cambio");
  }

  if (change.status !== InventoryChangeStatus.PENDING) {
    throw new Error("Este cambio ya fue procesado");
  }

  const propertyId = change.review?.cleaning?.propertyId;
  if (!propertyId) {
    throw new Error("No se pudo determinar la propiedad");
  }

  // Usar inventoryLineId si existe (cambio por línea); si no, fallback por itemId (legacy)
  let targetLineId: string | null = null;
  if (change.inventoryLineId) {
    const line = await prisma.inventoryLine.findFirst({
      where: {
        id: change.inventoryLineId,
        tenantId,
        propertyId,
        itemId: change.itemId,
        isActive: true,
      },
      select: { id: true },
    });
    targetLineId = line?.id ?? null;
  }
  if (!targetLineId) {
    const fallbackLine = await prisma.inventoryLine.findFirst({
      where: {
        tenantId,
        propertyId,
        itemId: change.itemId,
        isActive: true,
      },
      select: { id: true },
    });
    targetLineId = fallbackLine?.id ?? null;
  }

  if (targetLineId) {
    await prisma.inventoryLine.update({
      where: { id: targetLineId },
      data: { expectedQty: change.quantityAfter },
    });
  }

  // Marcar el cambio como aplicado
  await prisma.inventoryReviewItemChange.update({
    where: { id: changeId },
    data: {
      status: InventoryChangeStatus.APPLIED,
      updatedAt: new Date(),
    },
  });

  revalidatePath("/host/inventory/inbox");
  revalidatePath("/host/dashboard");

  return { success: true };
}

/**
 * Rechaza un cambio de cantidad.
 */
export async function rejectInventoryChange(changeId: string) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const change = await prisma.inventoryReviewItemChange.findFirst({
    where: { id: changeId, tenantId },
  });

  if (!change) {
    throw new Error("Cambio no encontrado");
  }

  if (change.status !== InventoryChangeStatus.PENDING) {
    throw new Error("Este cambio ya fue procesado");
  }

  await prisma.inventoryReviewItemChange.update({
    where: { id: changeId },
    data: {
      status: InventoryChangeStatus.REJECTED,
      updatedAt: new Date(),
    },
  });

  revalidatePath("/host/inventory/inbox");
  revalidatePath("/host/dashboard");

  return { success: true };
}

/**
 * Resuelve un reporte de inventario con una resolución específica.
 */
export async function resolveInventoryReport(
  reportId: string,
  resolution: InventoryReportResolution
) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const report = await prisma.inventoryReport.findFirst({
    where: { id: reportId, tenantId },
    include: {
      item: true,
      cleaning: { select: { propertyId: true } },
      review: { select: { propertyId: true } },
    },
  });

  if (!report) {
    throw new Error("Reporte no encontrado");
  }

  if (
    report.status !== InventoryReportStatus.PENDING &&
    report.status !== InventoryReportStatus.RESOLVED
  ) {
    throw new Error("Este reporte no se puede procesar en su estado actual");
  }

  // Actualizar el reporte
  await prisma.inventoryReport.update({
    where: { id: reportId },
    data: {
      status: InventoryReportStatus.RESOLVED,
      managerResolution: resolution,
      resolvedByUserId: user.id,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  // Si la resolución implica sacar el item del inventario, actualizar las líneas activas
  if (
    resolution === InventoryReportResolution.DISCARD ||
    resolution === InventoryReportResolution.MARK_LOST ||
    resolution === InventoryReportResolution.STORE
  ) {
    // Desactivar todas las líneas activas del item
    await prisma.inventoryLine.updateMany({
          where: {
            tenantId,
        itemId: report.itemId,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    // Archivar el item si no tiene líneas activas
    const activeLinesCount = await prisma.inventoryLine.count({
          where: {
            tenantId,
        itemId: report.itemId,
        isActive: true,
      },
    });

    if (activeLinesCount === 0) {
      await prisma.inventoryItem.updateMany({
        where: { id: report.itemId, tenantId },
        data: { archivedAt: new Date() },
      });
    }
  }

  // NUEVA LÓGICA: Reemplazo de item (REPLACE_AND_DISCARD)
  if (resolution === InventoryReportResolution.REPLACE_AND_DISCARD) {
    // Si el reporte está anclado a una línea específica, la reemplazamos
    if (report.inventoryLineId) {
      const currentLine = await prisma.inventoryLine.findUnique({
        where: { id: report.inventoryLineId },
      });

      if (currentLine && currentLine.isActive) {
        // 1. Desactivar la línea vieja
        await prisma.inventoryLine.update({
          where: { id: currentLine.id },
          data: {
            isActive: false,
            updatedAt: new Date(),
          },
        });

        // 2. Crear la nueva instancia (incrementará la versión automáticamente en lib/inventory.ts)
        const { createInventoryLine } = await import("@/lib/inventory");
        await createInventoryLine(tenantId, currentLine.propertyId, {
          propertyZoneId: currentLine.propertyZoneId ?? undefined,
          itemId: currentLine.itemId,
          category: report.item.category,
          expectedQty: currentLine.expectedQty,
          condition: InventoryCondition.NEW, // Al ser reemplazo, nace como nuevo
          priority: currentLine.priority,
          brand: currentLine.brand,
          model: currentLine.model,
          serialNumber: null, // El serial anterior ya no aplica
          color: currentLine.color,
          size: currentLine.size,
          notes: currentLine.notes,
          variantKey: currentLine.variantKey,
          variantValue: currentLine.variantValue,
        });

        console.log(
          `[resolveInventoryReport] Item reemplazado: se desactivó línea ${currentLine.id} y se creó nueva instancia.`
        );
      }
    } else {
      // Fallback para reportes legacy sin inventoryLineId: 
      // Desactivamos todas las líneas del item y creamos una nueva en la propiedad asociada
      const propertyId = report.cleaning?.propertyId || report.review?.propertyId;
      if (propertyId) {
        await prisma.inventoryLine.updateMany({
          where: { tenantId, itemId: report.itemId, propertyId, isActive: true },
          data: { isActive: false },
        });

        // No podemos saber el área exacta si no hay lineId, pero intentamos crear una nueva
        // NOTA: En un flujo ideal, report.inventoryLineId siempre debería estar presente.
      }
    }
  }

  revalidatePath("/host/inventory/inbox");
  revalidatePath("/host/dashboard");

  return { success: true };
}

/**
 * Actualiza los datos base de un reporte (descripción, severidad, tipo) y sus evidencias.
 * Reutiliza las acciones canónicas de inventory-review con contexto de host.
 */
export async function updateInventoryReport(
  reportId: string,
  data: { description?: string; severity?: InventoryReportSeverity; type?: InventoryReportType },
  imageFiles: File[] = [],
  removedEvidenceIds: string[] = []
) {
  const { createInventoryReport, uploadInventoryReportEvidence, deleteInventoryReportEvidence } = await import("../../inventory-review/actions");

  // 1. Obtener detalles del reporte para saber itemId y lineId
  const report = await prisma.inventoryReport.findUnique({
    where: { id: reportId },
    select: { itemId: true, inventoryLineId: true, reviewId: true, cleaningId: true, type: true, severity: true }
  });

  if (!report) throw new Error("Reporte no encontrado");

  // 2. Subir nuevas imágenes si las hay
  for (const file of imageFiles) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("reportId", reportId);
    formData.append("callerContext", "host");
    await uploadInventoryReportEvidence(formData);
  }

  // 3. Eliminar evidencias marcadas
  for (const evidenceId of removedEvidenceIds) {
    await deleteInventoryReportEvidence(evidenceId, { callerContext: "host" });
  }

  // 4. Actualizar campos base y OBTENER REPORTE FINAL HIDRATADO
  const reportFormData = new FormData();
  reportFormData.append("callerContext", "host");
  reportFormData.append("itemId", report.itemId);
  if (report.inventoryLineId) reportFormData.append("inventoryLineId", report.inventoryLineId);
  if (report.reviewId) reportFormData.append("reviewId", report.reviewId);
  if (report.cleaningId) reportFormData.append("cleaningId", report.cleaningId);
  reportFormData.append("type", data.type ?? report.type);
  reportFormData.append("severity", data.severity ?? report.severity);
  if (data.description) reportFormData.append("description", data.description);
  reportFormData.append("reportId", reportId);
  const finalReport = await createInventoryReport(reportFormData);

  revalidatePath("/host/inventory/inbox");
  return { success: true, report: finalReport };
}

/**
 * Obtiene el historial de incidencias para una línea de inventario (Server Action).
 */
export async function getInventoryLineHistoryAction(lineId: string, tenantId: string) {
  await requireHostUser(); // Protección adicional
  return await getInventoryLineHistory(lineId, tenantId);
}

