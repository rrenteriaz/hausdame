// app/host/properties/actions.ts
"use server";

import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { getOrCreateDefaultOwner } from "@/lib/users";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import storageProvider from "@/lib/storage";
import { generateThumbnail, getOutputMimeType } from "@/lib/media/thumbnail";
import { randomUUID } from "crypto";
// FASE 5: property-id-helper eliminado, propertyId ahora es el PK directamente

function redirectBack(formData: FormData) {
  const returnTo = formData.get("returnTo")?.toString();
  if (returnTo && returnTo.startsWith("/host/properties")) {
    redirect(returnTo);
  }
  redirect("/host/properties");
}

export async function updateProperty(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    redirectBack(formData);
    return;
  }

  const id = String(formData.get("propertyId") || "");
  if (!id) redirectBack(formData);

  const name = formData.get("name")?.toString().trim();
  const shortName = formData.get("shortName")?.toString().trim() || null;
  const address = formData.get("address")?.toString().trim() || null;
  const notes = formData.get("notes")?.toString().trim() || null;
  const icalUrl = formData.get("icalUrl")?.toString().trim() || null;
  const timeZone = formData.get("timeZone")?.toString().trim() || null;
  const checkInTime = formData.get("checkInTime")?.toString().trim() || null;
  const checkOutTime = formData.get("checkOutTime")?.toString().trim() || null;
  const groupName = formData.get("groupName")?.toString().trim() || null;
  const notificationEmail = formData.get("notificationEmail")?.toString().trim() || null;

  // Campos operativos (Host-only)
  const latitudeRaw = formData.get("latitude");
  const longitudeRaw = formData.get("longitude");
  const wifiSsidRaw = formData.get("wifiSsid");
  const wifiPasswordRaw = formData.get("wifiPassword");
  const accessCodeRaw = formData.get("accessCode");

  const parseOptionalFloat = (raw: FormDataEntryValue | null): number | null | undefined => {
    if (raw === null) return undefined;
    const s = raw.toString().trim();
    if (!s) return null;
    const n = Number(s);
    if (Number.isNaN(n)) return undefined;
    return n;
  };

  const parseOptionalString = (raw: FormDataEntryValue | null): string | null | undefined => {
    if (raw === null) return undefined;
    const s = raw.toString();
    const trimmed = s.trim();
    return trimmed ? trimmed : null;
  };

  // Manejar latitude/longitude: 
  // - Si viene string vacío, establecer null explícitamente (limpiar ubicación)
  // - Si viene número válido, usar ese valor
  // - Si no viene (null), no actualizar el campo (mantener valor existente)
  const latitude = latitudeRaw === null 
    ? undefined 
    : (latitudeRaw.toString().trim() === "" ? null : parseOptionalFloat(latitudeRaw));
  const longitude = longitudeRaw === null 
    ? undefined 
    : (longitudeRaw.toString().trim() === "" ? null : parseOptionalFloat(longitudeRaw));
  const wifiSsid = parseOptionalString(wifiSsidRaw);
  // wifiPassword: NO trim para permitir espacios si el host los pega tal cual
  const wifiPassword =
    wifiPasswordRaw === null ? undefined : (wifiPasswordRaw.toString().length ? wifiPasswordRaw.toString() : null);
  const accessCode = parseOptionalString(accessCodeRaw);

  if (!name) {
    redirectBack(formData);
    return;
  }

  await prisma.property.updateMany({
    where: {
      id,
      tenantId,
    },
    data: {
      name,
      shortName: shortName ?? undefined,
      address: address ?? undefined,
      notes: notes ?? undefined,
      icalUrl: icalUrl ?? undefined,
      timeZone: timeZone ?? undefined,
      checkInTime: checkInTime ?? undefined,
      checkOutTime: checkOutTime ?? undefined,
      groupName: groupName ?? undefined,
      notificationEmail: notificationEmail ?? undefined,
      latitude,
      longitude,
      wifiSsid,
      wifiPassword,
      accessCode,
    },
  });

  revalidatePath("/host/properties");
  revalidatePath(`/host/properties/${id}`);

  // Después de guardar, volver SIEMPRE al detalle de la propiedad.
  // Preservar returnTo para que el botón "Regresar" siga llevando al origen.
  const returnTo = formData.get("returnTo")?.toString();
  const safeReturnTo =
    returnTo && returnTo.startsWith("/host/properties") ? returnTo : "/host/properties";
  redirect(`/host/properties/${id}?returnTo=${encodeURIComponent(safeReturnTo)}`);
}

export async function deleteProperty(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    redirectBack(formData);
    return;
  }

  const id = String(formData.get("propertyId") || "");
  if (!id) redirectBack(formData);

  // Eliminar completamente: elimina la propiedad y todos sus datos relacionados
  // (reservas, limpiezas, cerraduras, etc. se eliminan por cascade)
  await prisma.property.deleteMany({
    where: {
      id,
      tenantId,
    },
  });

  revalidatePath("/host/properties");
  redirect("/host/properties");
}

export async function deactivateProperty(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    redirectBack(formData);
    return;
  }

  const id = String(formData.get("propertyId") || "");
  if (!id) redirectBack(formData);

  // Inactivar: solo marca isActive = false, no elimina datos
  await prisma.property.updateMany({
    where: {
      id,
      tenantId,
    },
    data: {
      isActive: false,
    },
  });

  revalidatePath("/host/properties");
  revalidatePath(`/host/properties/${id}`);
  redirectBack(formData);
}

export async function activateProperty(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    redirectBack(formData);
    return;
  }

  const id = String(formData.get("propertyId") || "");
  if (!id) redirectBack(formData);

  // Reactivar: marca isActive = true
  await prisma.property.updateMany({
    where: {
      id,
      tenantId,
    },
    data: {
      isActive: true,
    },
  });

  revalidatePath("/host/properties");
  revalidatePath(`/host/properties/${id}`);
  redirectBack(formData);
}

export async function assignTeamToProperty(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    redirectBack(formData);
    return;
  }

  const propertyId = String(formData.get("propertyId") || "");
  const teamId = String(formData.get("teamId") || "");

  if (!propertyId || !teamId) {
    redirectBack(formData);
    return;
  }

  // Verificar que la propiedad existe y pertenece al tenant del host
  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId },
    select: { id: true },
  });
  
  if (!property) {
    console.error("[assignTeamToProperty] Property not found for propertyId:", propertyId);
    redirectBack(formData);
    return;
  }

  const useWorkGroupReads = process.env.WORKGROUP_READS_ENABLED === "1";

  if (useWorkGroupReads) {
    // Ruta WGE: añadir property al workGroup canónico del team
    const executor = await prisma.workGroupExecutor.findFirst({
      where: { hostTenantId: tenantId, teamId, status: "ACTIVE" },
      select: { workGroupId: true },
      orderBy: { createdAt: "asc" },
    });
    if (!executor) {
      console.error("[assignTeamToProperty] No WGE executor found for team:", teamId);
      redirectBack(formData);
      return;
    }
    const existingLink = await prisma.hostWorkGroupProperty.findFirst({
      where: { tenantId, workGroupId: executor.workGroupId, propertyId: property.id },
      select: { id: true },
    });
    if (!existingLink) {
      await prisma.hostWorkGroupProperty.create({
        data: { tenantId, workGroupId: executor.workGroupId, propertyId: property.id },
      });
    }
  } else {
    await (prisma as any).propertyTeam.upsert({
      where: {
        propertyId_teamId: {
          propertyId: property.id,
          teamId,
        },
      },
      create: {
        tenantId,
        propertyId: property.id,
        teamId,
      },
      update: {},
    });
  }

  revalidatePath("/host/properties");
  revalidatePath(`/host/properties/${propertyId}`);
  // Siempre redirigir a la página de detalle de la propiedad
  redirect(`/host/properties/${propertyId}`);
}

export async function removeTeamFromProperty(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    redirectBack(formData);
    return;
  }

  const propertyId = String(formData.get("propertyId") || "");
  const teamId = String(formData.get("teamId") || "");

  if (!propertyId || !teamId) {
    redirectBack(formData);
    return;
  }

  // Verificar que la propiedad existe y pertenece al tenant del host
  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId },
    select: { id: true },
  });
  
  if (!property) {
    console.error("[removeTeamFromProperty] Property not found for propertyId:", propertyId);
    redirectBack(formData);
    return;
  }

  const useWorkGroupReads = process.env.WORKGROUP_READS_ENABLED === "1";

  if (useWorkGroupReads) {
    // Ruta WGE: eliminar links propiedad↔workGroup para todos los WGs del team
    const executors = await prisma.workGroupExecutor.findMany({
      where: { hostTenantId: tenantId, teamId },
      select: { workGroupId: true },
    });
    const workGroupIds = executors.map((e) => e.workGroupId);
    if (workGroupIds.length > 0) {
      await prisma.hostWorkGroupProperty.deleteMany({
        where: { tenantId, workGroupId: { in: workGroupIds }, propertyId: property.id },
      });
    }
  } else {
    await (prisma as any).propertyTeam.deleteMany({
      where: {
        propertyId: property.id,
        teamId,
        tenantId,
      },
    });
  }

  revalidatePath("/host/properties");
  revalidatePath(`/host/properties/${propertyId}`);
  // Siempre redirigir a la página de detalle de la propiedad
  redirect(`/host/properties/${propertyId}`);
}

export async function createProperty(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    revalidatePath("/host/properties");
    return;
  }

  const name = formData.get("name")?.toString().trim();
  const shortName = formData.get("shortName")?.toString().trim() || null;
  const address = formData.get("address")?.toString().trim() || null;
  const icalUrl = formData.get("icalUrl")?.toString().trim() || null;

  if (!name) {
    revalidatePath("/host/properties");
    return;
  }

  if (!shortName) {
    revalidatePath("/host/properties");
    return;
  }

  // Aseguramos un OWNER para usarlo como userId de la propiedad
  const owner = await getOrCreateDefaultOwner(tenantId);

  try {
    // Usar relaciones anidadas que Prisma acepta en runtime
    await prisma.property.create({
      data: {
        tenant: {
          connect: { id: tenantId },
        },
        user: {
          connect: { id: owner.id },
        },
        name,
        shortName, // Ahora es obligatorio
        address: address ?? undefined,
        icalUrl: icalUrl ?? undefined,
      },
    });
  } catch (error: any) {
    console.error('Error creando propiedad:', error);
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack,
    });
    throw error;
  }

  // Refresca la página de propiedades para ver la nueva en la lista
  revalidatePath("/host/properties");
}

