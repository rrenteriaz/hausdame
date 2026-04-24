// app/host/hoy/data.ts
"use server";

import prisma from "@/lib/prisma";
import { getCleaningsNeedingAttention } from "@/lib/cleaning-needs-attention";
import { InventoryReportStatus } from "@/lib/generated/prisma";
import { BlockData, HoyData, ProximasData, BlockItem } from "./types";
import {
  getCdmxDate,
  getStartOfCdmxToday,
  getEndOfCdmxToday,
  getStartOfCdmxTomorrow,
  getEndOfCdmxNext7Days,
} from "@/lib/datetime/cdmxToday";

/**
 * Aliases locales — usados para reservas y para las ventanas de limpiezas sin confirmar.
 * Para getTodayCleanings() se usa fecha exacta CDMX (ver Fix 1), no rango horario.
 */
const getStartOfToday = getStartOfCdmxToday;
const getEndOfToday = getEndOfCdmxToday;
const getStartOfTomorrow = getStartOfCdmxTomorrow;
const getEndOfNext7Days = getEndOfCdmxNext7Days;

/**
 * Helpers UTC — para reservas (startDate = UTC midnight desde iCal VALUE=DATE)
 */
function getStartOfUTCToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function getEndOfUTCToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)
  );
}

function getStartOfUTCTomorrow(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
}

function getEndOfUTCNext7Days(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7, 23, 59, 59, 999)
  );
}

/**
 * Obtiene datos para el tab "Hoy"
 */
export async function getHoyData(
  tenantId: string,
  propertyId?: string
): Promise<HoyData> {
  const startOfToday = getStartOfToday();
  const endOfToday = getEndOfToday();

  // Construir filtro base para propertyId
  const propertyFilter = propertyId ? { propertyId } : {};

  // 1. Limpiezas sin confirmar (solo las de hoy)
  const allUnconfirmedCleanings = await getCleaningsNeedingAttention(
    tenantId,
    false // incluir todas, luego filtrar por fecha
  );
  const todayUnconfirmedCleanings = allUnconfirmedCleanings.filter((c) => {
    const scheduledDate = new Date(c.scheduledDate);
    return (
      scheduledDate >= startOfToday &&
      scheduledDate <= endOfToday &&
      (!propertyId || c.propertyId === propertyId)
    );
  });

  // 2. Incidencias abiertas
  const openIncidentsData = await getOpenIncidents(tenantId, propertyId);

  // 3. Limpiezas de hoy — comparación exacta por fecha CDMX (scheduledDate = @db.Date)
  const todayCleaningsData = await getTodayCleanings(tenantId, propertyId);

  // 4. Reservas para hoy (UTC midnight — startDate de reserva es UTC midnight iCal)
  const todayReservationsData = await getTodayReservations(
    tenantId,
    getStartOfUTCToday(),
    getEndOfUTCToday(),
    propertyId
  );

  // Para unconfirmedCleanings, necesitamos mapear todos los items
  const allUnconfirmedItems = todayUnconfirmedCleanings.map((c) => ({
    id: c.id,
    title: `Limpieza sin confirmar`,
    propertyName: c.property.shortName || c.property.name,
    date: c.scheduledDate.toISOString(),
    status: c.status,
    href: `/host/cleanings/${c.id}${propertyId ? `?propertyId=${propertyId}` : ""}`,
  }));

  return {
    unconfirmedCleanings: {
      count: todayUnconfirmedCleanings.length,
      items: allUnconfirmedItems.slice(0, 5), // Solo mostrar 5 en la tarjeta
      allItems: allUnconfirmedItems, // Todos los items para el bottom sheet
    },
    openIncidents: openIncidentsData,
    todayCleanings: todayCleaningsData,
    todayReservations: todayReservationsData,
  };
}

/**
 * Obtiene datos para el tab "Próximas"
 */
export async function getProximasData(
  tenantId: string,
  propertyId?: string
): Promise<ProximasData> {
  const startOfTomorrow = getStartOfTomorrow();
  const endOfNext7Days = getEndOfNext7Days();

  // 1. Incidencias abiertas (todas, no solo próximas)
  const openIncidentsData = await getOpenIncidents(tenantId, propertyId);

  // 2. Limpiezas sin confirmar (próximos 7 días)
  const allUnconfirmedCleanings = await getCleaningsNeedingAttention(
    tenantId,
    true // solo futuras
  );
  const upcomingUnconfirmedCleanings = allUnconfirmedCleanings.filter((c) => {
    const scheduledDate = new Date(c.scheduledDate);
    return (
      scheduledDate >= startOfTomorrow &&
      scheduledDate <= endOfNext7Days &&
      (!propertyId || c.propertyId === propertyId)
    );
  });

  // 3. Próximas limpiezas (hora local — scheduledDate es hora local)
  const upcomingCleaningsData = await getUpcomingCleanings(
    tenantId,
    startOfTomorrow,
    endOfNext7Days,
    propertyId
  );

  // 4. Próximas reservas (UTC midnight — startDate de reserva es UTC midnight iCal)
  const upcomingReservationsData = await getUpcomingReservations(
    tenantId,
    getStartOfUTCTomorrow(),
    getEndOfUTCNext7Days(),
    propertyId
  );

  // Para unconfirmedCleanings, necesitamos mapear todos los items
  const allUpcomingUnconfirmedItems = upcomingUnconfirmedCleanings.map((c) => ({
    id: c.id,
    title: `Limpieza sin confirmar`,
    propertyName: c.property.shortName || c.property.name,
    date: c.scheduledDate.toISOString(),
    status: c.status,
    href: `/host/cleanings/${c.id}${propertyId ? `?propertyId=${propertyId}` : ""}`,
  }));

  return {
    openIncidents: openIncidentsData,
    unconfirmedCleanings: {
      count: upcomingUnconfirmedCleanings.length,
      items: allUpcomingUnconfirmedItems.slice(0, 5), // Solo mostrar 5 en la tarjeta
      allItems: allUpcomingUnconfirmedItems, // Todos los items para el bottom sheet
    },
    upcomingCleanings: upcomingCleaningsData,
    upcomingReservations: upcomingReservationsData,
  };
}

/**
 * Funciones para obtener listas completas (sin límite) para vistas dedicadas
 */

export async function getAllTodayCleanings(
  tenantId: string,
  propertyId?: string
): Promise<BlockItem[]> {
  const data = await getTodayCleanings(tenantId, propertyId);
  return data.allItems || data.items;
}

export async function getAllUpcomingCleanings(
  tenantId: string,
  propertyId?: string
): Promise<BlockItem[]> {
  const startOfTomorrow = getStartOfTomorrow();
  const endOfNext7Days = getEndOfNext7Days();
  const data = await getUpcomingCleanings(tenantId, startOfTomorrow, endOfNext7Days, propertyId);
  return data.allItems || data.items;
}

export async function getAllUnconfirmedCleanings(
  tenantId: string,
  propertyId?: string,
  isUpcoming: boolean = false
): Promise<BlockItem[]> {
  const allUnconfirmed = await getCleaningsNeedingAttention(tenantId, isUpcoming);
  const startOfToday = getStartOfToday();
  const endOfToday = getEndOfToday();
  const startOfTomorrow = getStartOfTomorrow();
  const endOfNext7Days = getEndOfNext7Days();

  const filtered = allUnconfirmed.filter((c) => {
    const scheduledDate = new Date(c.scheduledDate);
    if (isUpcoming) {
      return (
        scheduledDate >= startOfTomorrow &&
        scheduledDate <= endOfNext7Days &&
        (!propertyId || c.propertyId === propertyId)
      );
    } else {
      return (
        scheduledDate >= startOfToday &&
        scheduledDate <= endOfToday &&
        (!propertyId || c.propertyId === propertyId)
      );
    }
  });

  return filtered.map((c) => ({
    id: c.id,
    title: `Limpieza sin confirmar`,
    propertyName: c.property.shortName || c.property.name,
    date: c.scheduledDate.toISOString(),
    status: c.status,
    href: `/host/cleanings/${c.id}${propertyId ? `?propertyId=${propertyId}` : ""}`,
  }));
}

export async function getAllTodayReservations(
  tenantId: string,
  propertyId?: string
): Promise<BlockItem[]> {
  const data = await getTodayReservations(
    tenantId,
    getStartOfUTCToday(),
    getEndOfUTCToday(),
    propertyId
  );
  return data.allItems || data.items;
}

export async function getAllUpcomingReservations(
  tenantId: string,
  propertyId?: string
): Promise<BlockItem[]> {
  const data = await getUpcomingReservations(
    tenantId,
    getStartOfUTCTomorrow(),
    getEndOfUTCNext7Days(),
    propertyId
  );
  return data.allItems || data.items;
}

export async function getAllOpenIncidents(
  tenantId: string,
  propertyId?: string
): Promise<BlockItem[]> {
  const data = await getOpenIncidents(tenantId, propertyId);
  return data.allItems || data.items;
}

/**
 * Helper: Obtiene incidencias abiertas (InventoryReport con status PENDING)
 */
async function getOpenIncidents(
  tenantId: string,
  propertyId?: string
): Promise<BlockData> {
  // Si hay filtro por propiedad, necesitamos filtrar vía cleaning.propertyId
  const whereClause: any = {
    tenantId,
    status: InventoryReportStatus.PENDING,
  };

  if (propertyId) {
    // Filtrar por propiedad vía cleaning o review
    whereClause.OR = [
      { cleaning: { propertyId } },
      { review: { propertyId } },
    ];
  }

  const reports = await (prisma as any).inventoryReport.findMany({
    where: whereClause,
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
        },
      },
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
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 5,
  });

  const totalCount = await (prisma as any).inventoryReport.count({
    where: whereClause,
  });

  return {
    count: totalCount,
    items: reports.map((report: any) => {
      // Obtener propiedad desde cleaning o review
      const property =
        report.cleaning?.property ||
        report.review?.property ||
        null;
      
      return {
        id: report.id,
        title: `Incidencia de inventario`,
        propertyName: property?.shortName || property?.name || "Sin propiedad",
        date: report.createdAt.toISOString(),
        status: report.severity,
        href: `/host/inventory/inbox${propertyId ? `?propertyId=${propertyId}` : ""}`,
      };
    }),
  };
}

/**
 * Helper: Obtiene limpiezas de hoy.
 *
 * scheduledDate es DateTime @db.Date — Prisma serializa cualquier Date a DATE (sin hora).
 * Si se usara un rango gte/lte con límites horarios CDMX, el extremo superior
 * (ej. 2026-04-23T05:59:59Z) se trunca a DATE '2026-04-23' y arrastra las limpiezas
 * del día siguiente. Por eso se compara por igualdad exacta a la fecha CDMX.
 */
async function getTodayCleanings(
  tenantId: string,
  propertyId?: string
): Promise<BlockData> {
  // Fecha calendario de hoy en CDMX → medianoche UTC de ese día
  // Prisma serializa este Date como DATE '2026-04-22' al comparar contra @db.Date.
  const { year, month, day } = getCdmxDate();
  const exactTodayUTC = new Date(Date.UTC(year, month, day));

  const whereClause: any = {
    tenantId,
    scheduledDate: { equals: exactTodayUTC },
    status: { not: "CANCELLED" },
  };

  if (propertyId) {
    whereClause.propertyId = propertyId;
  }

  const allCleanings = await (prisma as any).cleaning.findMany({
    where: whereClause,
    include: {
      property: {
        select: {
          id: true,
          name: true,
          shortName: true,
        },
      },
    },
    orderBy: {
      scheduledDate: "asc",
    },
    // Sin take: devolver todos para bottom sheet
  });

  const totalCount = await (prisma as any).cleaning.count({
    where: whereClause,
  });

  const allItems = allCleanings.map((c: any) => ({
    id: c.id,
    title: `Limpieza programada`,
    propertyName: c.property.shortName || c.property.name,
    date: c.scheduledDate.toISOString(),
    status: c.status,
    href: `/host/cleanings/${c.id}${propertyId ? `?propertyId=${propertyId}` : ""}`,
  }));

  return {
    count: totalCount,
    items: allItems.slice(0, 5), // Primeros 5 para tarjeta
    allItems, // Todos para bottom sheet
  };
}

/**
 * Helper: Obtiene próximas limpiezas (mañana hasta +7 días)
 */
async function getUpcomingCleanings(
  tenantId: string,
  startOfTomorrow: Date,
  endOfNext7Days: Date,
  propertyId?: string
): Promise<BlockData> {
  const whereClause: any = {
    tenantId,
    scheduledDate: {
      gte: startOfTomorrow,
      lte: endOfNext7Days,
    },
    status: { not: "CANCELLED" },
  };

  if (propertyId) {
    whereClause.propertyId = propertyId;
  }

  const allCleanings = await (prisma as any).cleaning.findMany({
    where: whereClause,
    include: {
      property: {
        select: {
          id: true,
          name: true,
          shortName: true,
        },
      },
    },
    orderBy: {
      scheduledDate: "asc",
    },
    // Sin take: devolver todos para bottom sheet
  });

  const totalCount = await (prisma as any).cleaning.count({
    where: whereClause,
  });

  const allItems = allCleanings.map((c: any) => ({
    id: c.id,
    title: `Limpieza programada`,
    propertyName: c.property.shortName || c.property.name,
    date: c.scheduledDate.toISOString(),
    status: c.status,
    href: `/host/cleanings/${c.id}${propertyId ? `?propertyId=${propertyId}` : ""}`,
  }));

  return {
    count: totalCount,
    items: allItems.slice(0, 5), // Primeros 5 para tarjeta
    allItems, // Todos para bottom sheet
  };
}

/**
 * Helper: Obtiene reservas para hoy
 * "Reservas para hoy" = SOLO check-ins de hoy (startDate cae hoy)
 * - startDate >= startOfToday && startDate <= endOfToday
 * - Excluir CANCELLED
 * - NO incluir BLOCKED (no es check-in real)
 */
async function getTodayReservations(
  tenantId: string,
  startOfToday: Date,
  endOfToday: Date,
  propertyId?: string
): Promise<BlockData> {
  const whereClause: any = {
    tenantId,
    status: { notIn: ["CANCELLED", "BLOCKED"] },
    // Solo check-ins de hoy: startDate cae hoy
    startDate: {
      gte: startOfToday,
      lte: endOfToday,
    },
  };

  if (propertyId) {
    whereClause.propertyId = propertyId;
  }

  const allReservations = await (prisma as any).reservation.findMany({
    where: whereClause,
    include: {
      property: {
        select: {
          id: true,
          name: true,
          shortName: true,
        },
      },
    },
    orderBy: {
      startDate: "asc",
    },
    // Sin take: devolver todos para bottom sheet
  });

  const totalCount = await (prisma as any).reservation.count({
    where: whereClause,
  });

  const allItems = allReservations.map((r: any) => ({
    id: r.id,
    title: `Reserva activa`,
    propertyName: r.property.shortName || r.property.name,
    date: r.startDate.toISOString(),
    status: r.status,
    href: `/host/reservations/${r.id}${propertyId ? `?propertyId=${propertyId}` : ""}`,
  }));

  return {
    count: totalCount,
    items: allItems.slice(0, 5), // Primeros 5 para tarjeta
    allItems, // Todos para bottom sheet
  };
}

/**
 * Helper: Obtiene próximas reservas (mañana hasta +7 días)
 */
async function getUpcomingReservations(
  tenantId: string,
  startOfTomorrow: Date,
  endOfNext7Days: Date,
  propertyId?: string
): Promise<BlockData> {
  const whereClause: any = {
    tenantId,
    status: { not: "CANCELLED" },
    startDate: {
      gte: startOfTomorrow,
      lte: endOfNext7Days,
    },
  };

  if (propertyId) {
    whereClause.propertyId = propertyId;
  }

  const allReservations = await (prisma as any).reservation.findMany({
    where: whereClause,
    include: {
      property: {
        select: {
          id: true,
          name: true,
          shortName: true,
        },
      },
    },
    orderBy: {
      startDate: "asc",
    },
    // Sin take: devolver todos para bottom sheet
  });

  const totalCount = await (prisma as any).reservation.count({
    where: whereClause,
  });

  const allItems = allReservations.map((r: any) => ({
    id: r.id,
    title: `Reserva próxima`,
    propertyName: r.property.shortName || r.property.name,
    date: r.startDate.toISOString(),
    status: r.status,
    href: `/host/reservations/${r.id}${propertyId ? `?propertyId=${propertyId}` : ""}`,
  }));

  return {
    count: totalCount,
    items: allItems.slice(0, 5), // Primeros 5 para tarjeta
    allItems, // Todos para bottom sheet
  };
}

