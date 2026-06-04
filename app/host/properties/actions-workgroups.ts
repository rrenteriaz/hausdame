// app/host/properties/actions-workgroups.ts
// Nuevas acciones para asignar WorkGroups a propiedades (reemplazo de assignTeamToProperty/removeTeamFromProperty)
"use server";

import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { reconcileOpenCleanings } from "@/lib/cleanings/reconcileOpenCleanings";

function redirectBack(formData: FormData) {
  const returnTo = formData.get("returnTo")?.toString();
  if (returnTo && returnTo.startsWith("/host/properties")) {
    redirect(returnTo);
  }
  redirect("/host/properties");
}

export async function assignWorkGroupToProperty(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    const skipRedirect = formData.get("skipRedirect")?.toString() === "true";
    if (!skipRedirect) {
      redirectBack(formData);
    }
    throw new Error("Tenant no encontrado");
  }

  const propertyId = String(formData.get("propertyId") || "");
  const workGroupId = String(formData.get("workGroupId") || "");
  const returnTo = formData.get("returnTo")?.toString();
  const skipRedirect = formData.get("skipRedirect")?.toString() === "true";

  if (!propertyId || !workGroupId) {
    if (!skipRedirect) {
      redirectBack(formData);
    }
    throw new Error("propertyId y workGroupId son requeridos");
  }

  // Verificar que la propiedad existe y pertenece al tenant
  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId },
    select: { id: true },
  });
  
  if (!property) {
    console.error("[assignWorkGroupToProperty] Property not found for propertyId:", propertyId);
    if (!skipRedirect) {
      redirectBack(formData);
    }
    throw new Error("Propiedad no encontrada");
  }

  // Verificar que el WorkGroup existe
  const workGroup = await prisma.hostWorkGroup.findFirst({
    where: { id: workGroupId, tenantId },
    select: { id: true },
  });

  if (!workGroup) {
    console.error("[assignWorkGroupToProperty] WorkGroup not found for workGroupId:", workGroupId);
    if (!skipRedirect) {
      redirectBack(formData);
    }
    throw new Error("Grupo de trabajo no encontrado");
  }

  // Verificar si la relación ya existe (idempotencia sin depender de P2002)
  const existingRelation = await prisma.hostWorkGroupProperty.findFirst({
    where: {
      tenantId,
      workGroupId,
      propertyId: property.id,
    },
    select: { id: true },
  });

  if (existingRelation) {
    // Ya existe la relación, retornar éxito sin crear
    revalidatePath("/host/properties");
    revalidatePath(`/host/properties/${propertyId}`);
    revalidatePath("/host/workgroups");
    revalidatePath(`/host/workgroups/${workGroupId}`);

    if (skipRedirect) {
      return { success: true, propertyId, workGroupId, alreadyAssigned: true };
    }
    redirect(returnTo || `/host/properties/${propertyId}`);
    return;
  }

  // Crear la relación (no existe, crear nueva)
  try {
    await prisma.hostWorkGroupProperty.create({
      data: {
        tenantId,
        workGroupId,
        propertyId: property.id,
      },
    });
  } catch (error: any) {
    console.error("[assignWorkGroupToProperty] Error al crear relación:", error);
    if (!skipRedirect) {
      redirectBack(formData);
      return;
    }
    throw new Error(`Error al asignar grupo de trabajo: ${error?.message || "Error desconocido"}`);
  }

  // Reconciliar limpiezas OPEN de la propiedad recién asignada (non-blocking)
  try {
    await reconcileOpenCleanings({
      type: "property",
      hostTenantId: tenantId,
      propertyId: property.id,
    });
  } catch (err) {
    console.error("[assignWorkGroupToProperty] reconcile non-blocking error:", err);
  }

  revalidatePath("/host/properties");
  revalidatePath(`/host/properties/${propertyId}`);
  revalidatePath("/host/workgroups");
  revalidatePath(`/host/workgroups/${workGroupId}`);

  // Si skipRedirect está activado, retornar éxito sin redirigir
  if (skipRedirect) {
    return { success: true, propertyId, workGroupId };
  }

  // Comportamiento original: redirigir
  redirect(returnTo || `/host/properties/${propertyId}`);
}

export async function removeWorkGroupFromProperty(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    const skipRedirect = formData.get("skipRedirect")?.toString() === "true";
    if (!skipRedirect) {
      redirectBack(formData);
    }
    throw new Error("Usuario sin tenant asociado");
  }

  const propertyId = String(formData.get("propertyId") || "");
  const workGroupId = String(formData.get("workGroupId") || "");
  const skipRedirect = formData.get("skipRedirect")?.toString() === "true";

  if (!propertyId || !workGroupId) {
    if (!skipRedirect) {
      redirectBack(formData);
      return;
    }
    throw new Error("propertyId y workGroupId son requeridos");
  }

  // Verificar que la propiedad existe y pertenece al tenant
  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId },
    select: { id: true },
  });
  
  if (!property) {
    console.error("[removeWorkGroupFromProperty] Property not found for propertyId:", propertyId);
    if (!skipRedirect) {
      redirectBack(formData);
      return;
    }
    throw new Error("Propiedad no encontrada");
  }

  await prisma.hostWorkGroupProperty.deleteMany({
    where: {
      propertyId: property.id,
      workGroupId,
      tenantId,
    },
  });

  revalidatePath("/host/properties");
  revalidatePath(`/host/properties/${propertyId}`);
  revalidatePath("/host/workgroups");
  revalidatePath(`/host/workgroups/${workGroupId}`);

  // Si skipRedirect está activado, retornar éxito sin redirigir
  if (skipRedirect) {
    return { success: true, propertyId, workGroupId };
  }

  // Comportamiento original: redirigir
  redirect(`/host/properties/${propertyId}`);
}

