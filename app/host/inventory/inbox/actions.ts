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
} from "@prisma/client";

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
export async function getInventoryInboxItems(filters: InboxFilters = {}) {
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
              select: { area: true },
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
              select: { area: true },
            },
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
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
      area: change.inventoryLine?.area || null,
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
      createdAt: change.createdAt,
    })),
    ...reports.map((report) => ({
      type: "REPORT" as const,
      id: report.id,
      itemId: report.itemId,
      itemName: report.item.name,
      itemThumbnail: report.item.inventoryItemAssets[0]?.asset?.publicUrl || null,
      property:
        report.review?.property?.shortName ||
        report.review?.property?.name ||
        report.cleaning?.property?.shortName ||
        report.cleaning?.property?.name ||
        "N/A",
      propertyId:
        report.review?.propertyId || report.cleaning?.propertyId || null,
      cleaningId: report.cleaningId || report.review?.cleaningId || null,
      area: report.inventoryLine?.area || null,
      reportType: report.type,
      severity: report.severity,
      description: report.description,
      status: report.status,
      managerResolution: report.managerResolution,
      createdBy:
        report.createdBy?.name || report.createdBy?.email || "Cleaner",
      createdAt: report.createdAt,
      resolvedAt: report.resolvedAt,
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
      select: { itemId: true, propertyId: true, area: true },
      orderBy: { area: "asc" },
    });
    const areaByKey = new Map<string, string>();
    for (const line of fallbackLines) {
      const key = `${line.itemId}-${line.propertyId}`;
      if (!areaByKey.has(key)) areaByKey.set(key, line.area);
    }
    for (const item of items) {
      if (!item.area && item.propertyId) {
        item.area = areaByKey.get(`${item.itemId}-${item.propertyId}`) || null;
      }
    }
  }

  return items;
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
    },
  });

  if (!report) {
    throw new Error("Reporte no encontrado");
  }

  if (report.status !== InventoryReportStatus.PENDING) {
    throw new Error("Este reporte ya fue procesado");
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

  revalidatePath("/host/inventory/inbox");
  revalidatePath("/host/dashboard");

  return { success: true };
}

