/**
 * Servicio reutilizable para sincronización iCal.
 * Usado por: botones manual/bulk, cron endpoint.
 * NO llama revalidatePath (lo hacen los wrappers).
 */

import prisma from "@/lib/prisma";
import { parseIcalUrl } from "@/lib/ical-parser";
import { getEligibleMembersForCleaning } from "@/lib/cleaning-eligibility";
import { createChecklistSnapshotForCleaning } from "@/lib/checklist-snapshot";

export type SyncReason = "cron" | "bulk" | "manual";

const LOCK_DURATION_MS = 2 * 60 * 1000; // 2 minutes

function calculateCleaningDate(
  endDate: Date,
  checkOutTime: string | null | undefined
): Date {
  let hours = 11;
  let minutes = 0;
  if (checkOutTime) {
    const [h, m] = checkOutTime.split(":").map(Number);
    if (!isNaN(h)) hours = h;
    if (!isNaN(m)) minutes = m;
  }
  // endDate es UTC midnight (VALUE=DATE). Extraer el día en UTC para construir
  // la fecha de limpieza en hora local sobre ese día calendario correcto.
  return new Date(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate(),
    hours,
    minutes,
    0,
    0
  );
}

/**
 * Compara dos fechas por día UTC (año/mes/día).
 * Usado para fechas VALUE=DATE que pueden estar en T00:00Z (nuevo) o T06:00Z (histórico).
 */
function sameUTCDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function sanitizeError(msg: string): string {
  return msg
    .replace(/[\n\r\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

/**
 * Toma lock optimista. Retorna true si se tomó el lock.
 */
async function tryAcquireLock(
  propertyId: string,
  now: Date,
  lockUntil: Date
): Promise<boolean> {
  const result = await prisma.property.updateMany({
    where: {
      id: propertyId,
      OR: [
        { icalSyncInProgressUntil: null },
        { icalSyncInProgressUntil: { lt: now } },
      ],
    },
    data: {
      icalSyncInProgressUntil: lockUntil,
      icalLastSyncAttemptAt: now,
    },
  });
  return result.count > 0;
}

/**
 * Libera lock y actualiza estado según éxito/error.
 */
async function releaseLock(
  propertyId: string,
  success: boolean,
  errorMessage?: string | null
): Promise<void> {
  await prisma.property.update({
    where: { id: propertyId },
    data: {
      icalSyncInProgressUntil: null,
      ...(success
        ? {
            icalLastSyncedAt: new Date(),
            icalLastSyncError: null,
          }
        : {
            icalLastSyncError: errorMessage
              ? sanitizeError(errorMessage)
              : null,
          }),
    },
  });
}

/**
 * Lógica core de sync (sin lock ni revalidatePath).
 * Lanza en caso de error.
 */
async function executeSyncCore(
  tenantId: string,
  propertyId: string,
  property: {
    id: string;
    name: string;
    shortName: string | null;
    address: string | null;
    icalUrl: string;
    checkOutTime: string | null;
  }
): Promise<void> {
  const parsedReservations = await parseIcalUrl(property.icalUrl);
  const existingReservations = await (prisma as any).reservation.findMany({
    where: {
      propertyId,
      tenantId,
      calendarUid: { not: null },
    },
  });

  const existingByUid = new Map<string, any>(
    existingReservations.map((r: any) => [r.calendarUid, r])
  );
  const presentUids = new Set(parsedReservations.map((r) => r.calendarUid));

  const collectedErrors: string[] = [];

  for (const parsed of parsedReservations) {
    try {
      const existing: any = existingByUid.get(parsed.calendarUid);

      if (existing) {
        // Comparar fechas por día UTC para tolerar datos históricos en T06:00Z
        const needsUpdate =
          !sameUTCDay(existing.startDate, parsed.startDate) ||
          !sameUTCDay(existing.endDate, parsed.endDate) ||
          existing.status !== parsed.status ||
          existing.reservationCodeCalendar !== parsed.reservationCodeCalendar ||
          existing.guestPhoneLast4 !== parsed.guestPhoneLast4;

        if (needsUpdate) {
          await (prisma as any).reservation.update({
            where: { id: existing.id },
            data: {
              startDate: parsed.startDate,
              endDate: parsed.endDate,
              status: parsed.status,
              reservationCodeCalendar: parsed.reservationCodeCalendar,
              guestPhoneLast4: parsed.guestPhoneLast4,
              updatedAt: new Date(),
            },
          });

          if (
            !sameUTCDay(existing.endDate, parsed.endDate) &&
            parsed.status === "CONFIRMED"
          ) {
            const cleaning = await (prisma as any).cleaning.findFirst({
              where: {
                reservationId: existing.id,
                tenantId,
              },
            });

            if (
              cleaning &&
              cleaning.status !== "COMPLETED" &&
              cleaning.status !== "CANCELLED"
            ) {
              const newScheduledAtOriginal = calculateCleaningDate(
                parsed.endDate,
                property.checkOutTime
              );

              if (!cleaning.isScheduleOverridden) {
                await (prisma as any).cleaning.update({
                  where: { id: cleaning.id },
                  data: {
                    scheduledAtOriginal: newScheduledAtOriginal,
                    scheduledAtPlanned: newScheduledAtOriginal,
                    scheduledDate: newScheduledAtOriginal,
                  },
                });
              } else {
                await (prisma as any).cleaning.update({
                  where: { id: cleaning.id },
                  data: {
                    scheduledAtOriginal: newScheduledAtOriginal,
                    needsAttention: true,
                    attentionReason: "RESERVATION_DATE_CHANGED_WITH_OVERRIDE",
                  },
                });
              }
            }
          }
        }
      } else {
        const newReservation = await (prisma as any).reservation.create({
          data: {
            tenantId,
            propertyId,
            source: "ICAL",
            status: parsed.status,
            startDate: parsed.startDate,
            endDate: parsed.endDate,
            calendarUid: parsed.calendarUid,
            reservationCodeCalendar: parsed.reservationCodeCalendar,
            guestPhoneLast4: parsed.guestPhoneLast4,
          },
        });

        if (parsed.status === "CONFIRMED") {
          const scheduledAtOriginal = calculateCleaningDate(
            parsed.endDate,
            property.checkOutTime
          );
          const eligibleMembers = await getEligibleMembersForCleaning(
            tenantId,
            propertyId,
            scheduledAtOriginal
          );

          let assignedMemberId: string | null = null;
          let assignmentStatus: "OPEN" | "ASSIGNED" = "OPEN";
          let needsAttention = false;
          let attentionReason: string | null = null;

          if (eligibleMembers.length === 1) {
            assignedMemberId = eligibleMembers[0].id;
            assignmentStatus = "ASSIGNED";
          } else if (eligibleMembers.length === 0) {
            needsAttention = true;
            attentionReason = "NO_AVAILABLE_MEMBER";
          }

          const cleaningData = {
            tenantId,
            propertyId,
            reservationId: newReservation.id,
            scheduledAtOriginal,
            scheduledAtPlanned: scheduledAtOriginal,
            scheduledDate: scheduledAtOriginal,
            status: "PENDING" as const,
            assignmentStatus: assignmentStatus as "OPEN" | "ASSIGNED",
            assignedMemberId: assignedMemberId || null,
            needsAttention,
            attentionReason: attentionReason || null,
            propertyName: property.name,
            propertyShortName: property.shortName ?? null,
            propertyAddress: property.address ?? null,
          };

          const createdCleaning = await (prisma as any).cleaning.create({
            data: cleaningData,
          });

          await createChecklistSnapshotForCleaning(
            tenantId,
            propertyId,
            createdCleaning.id
          );
        }
      }
    } catch (err: any) {
      collectedErrors.push(
        `Reservation ${parsed.calendarUid}: ${err.message}`
      );
    }
  }

  if (collectedErrors.length > 0) {
    throw new Error(collectedErrors.join("; "));
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const existing of existingReservations) {
    if (existing.status !== "CONFIRMED") continue;
    // Si la reserva ya terminó (endDate < today), su ausencia del feed es normal:
    // los proveedores (Airbnb, Booking, etc.) eliminan eventos pasados del iCal.
    // No cancelar — solo cancelar reservas futuras o en curso que desaparezcan.
    const existingEnd = new Date(existing.endDate);
    existingEnd.setHours(0, 0, 0, 0);
    if (existingEnd < today) continue;
    if (!presentUids.has(existing.calendarUid)) {
      await (prisma as any).reservation.update({
        where: { id: existing.id },
        data: { status: "CANCELLED", updatedAt: new Date() },
      });

      const cleaning = await (prisma as any).cleaning.findFirst({
        where: {
          reservationId: existing.id,
          tenantId,
        },
      });

      if (cleaning && cleaning.status !== "COMPLETED") {
        const reservationStart = new Date(existing.startDate);
        reservationStart.setHours(0, 0, 0, 0);
        const reservationEnd = new Date(existing.endDate);
        reservationEnd.setHours(0, 0, 0, 0);

        if (reservationStart > today) {
          await (prisma as any).cleaning.update({
            where: { id: cleaning.id },
            data: { status: "CANCELLED" },
          });
        } else if (
          reservationStart <= today &&
          today < reservationEnd
        ) {
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const newScheduledAt = calculateCleaningDate(
            tomorrow,
            property.checkOutTime
          );
          await (prisma as any).cleaning.update({
            where: { id: cleaning.id },
            data: {
              scheduledAtPlanned: newScheduledAt,
              scheduledDate: newScheduledAt,
              needsAttention: true,
              attentionReason: "CANCELLED_DURING_STAY",
            },
          });
        }
      }
    }
  }
}

export async function syncIcalForProperty(params: {
  tenantId: string;
  propertyId: string;
  reason: SyncReason;
  requestedBy?: string;
}): Promise<{
  ok: boolean;
  skippedLock?: boolean;
  error?: string;
}> {
  const { tenantId, propertyId } = params;
  const now = new Date();
  const lockUntil = new Date(now.getTime() + LOCK_DURATION_MS);

  const acquired = await tryAcquireLock(propertyId, now, lockUntil);
  if (!acquired) {
    return { ok: false, skippedLock: true };
  }

  try {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, tenantId },
      select: {
        id: true,
        name: true,
        shortName: true,
        address: true,
        icalUrl: true,
        checkOutTime: true,
      },
    });

    if (!property) {
      await releaseLock(propertyId, false, "Property not found");
      return { ok: false, error: "Property not found" };
    }

    if (!property.icalUrl || property.icalUrl.trim() === "") {
      await releaseLock(propertyId, false, "No iCal URL configured");
      return { ok: false, error: "Property has no iCal URL configured" };
    }

    await executeSyncCore(tenantId, propertyId, {
      ...property,
      icalUrl: property.icalUrl,
      checkOutTime: property.checkOutTime,
    });

    await releaseLock(propertyId, true);
    return { ok: true };
  } catch (err: any) {
    const errMsg = err.message || "Unknown error";
    await releaseLock(propertyId, false, errMsg);
    return { ok: false, error: sanitizeError(errMsg) };
  }
}

export async function syncIcalForTenantBatch(params: {
  tenantId: string;
  reason: "cron" | "bulk";
  limit: number;
}): Promise<{
  synced: number;
  skippedLocked: number;
  skippedNotStale: number;
  errors: number;
  errorsDetails?: Array<{
    propertyId: string;
    propertyName: string;
    error: string;
  }>;
}> {
  const { tenantId, reason, limit } = params;
  const effectiveLimit = limit;

  const intervalMs =
    (parseInt(process.env.ICAL_SYNC_INTERVAL_MINUTES || "5", 10) || 5) *
    60 *
    1000;
  const staleThreshold = new Date(Date.now() - intervalMs);

  const baseWhere: any = {
    tenantId,
    icalUrl: { not: null, gt: "" },
  };

  const properties =
    reason === "cron"
      ? await prisma.property.findMany({
          where: {
            ...baseWhere,
            OR: [
              { icalLastSyncedAt: null },
              { icalLastSyncedAt: { lt: staleThreshold } },
            ],
          },
          select: {
            id: true,
            name: true,
          },
          orderBy: { name: "asc" },
          take: effectiveLimit,
        })
      : await prisma.property.findMany({
          where: baseWhere,
          select: {
            id: true,
            name: true,
          },
          orderBy: { name: "asc" },
          take: effectiveLimit,
        });

  let synced = 0;
  let skippedLocked = 0;
  let skippedNotStale = 0;
  let errors = 0;
  const errorsDetails: Array<{
    propertyId: string;
    propertyName: string;
    error: string;
  }> = [];

  for (const prop of properties) {
    const result = await syncIcalForProperty({
      tenantId,
      propertyId: prop.id,
      reason,
      requestedBy: reason === "cron" ? "cron" : undefined,
    });

    if (result.skippedLock) {
      skippedLocked++;
    } else if (result.ok) {
      synced++;
    } else {
      errors++;
      errorsDetails.push({
        propertyId: prop.id,
        propertyName: prop.name,
        error: result.error || "Unknown error",
      });
    }
  }

  return {
    synced,
    skippedLocked,
    skippedNotStale,
    errors,
    errorsDetails: errorsDetails.length > 0 ? errorsDetails : undefined,
  };
}
