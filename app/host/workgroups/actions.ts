// app/host/workgroups/actions.ts
"use server";

import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function redirectBack(formData: FormData) {
  const returnTo = formData.get("returnTo")?.toString();
  if (returnTo && returnTo.startsWith("/host/workgroups")) {
    redirect(returnTo);
  }
  redirect("/host/workgroups");
}

function isTenantNameUniqueError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const prismaError = error as {
    code?: unknown;
    meta?: { target?: unknown };
  };
  const target = prismaError.meta?.target;
  return (
    prismaError.code === "P2002" &&
    Array.isArray(target) &&
    target.includes("tenantId") &&
    target.includes("name")
  );
}

export async function createWorkGroup(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    const returnTo = formData.get("returnTo")?.toString();
    if (returnTo) {
      redirectBack(formData);
    }
    throw new Error("Tenant no encontrado");
  }

  const name = formData.get("name")?.toString().trim();
  const returnTo = formData.get("returnTo")?.toString();

  if (!name) {
    if (returnTo) {
      redirectBack(formData);
    }
    throw new Error("El nombre es requerido");
  }

  // Validar unicidad de nombre solo para WGs ACTIVE (ver contrato 7.8)
  const existingActive = await prisma.hostWorkGroup.findFirst({
    where: {
      tenantId: tenantId,
      name,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (existingActive) {
    throw new Error("Ya existe un grupo de trabajo ACTIVE con ese nombre en este tenant.");
  }

  try {
    const workGroup = await prisma.hostWorkGroup.create({
      data: {
        tenantId: tenantId,
        name,
        status: "ACTIVE", // Default según contrato
      },
      select: {
        id: true,
        name: true,
      },
    });

    // Si hay returnTo, redirigir (comportamiento original)
    if (returnTo) {
      revalidatePath("/host/workgroups");
      redirectBack(formData);
      return;
    }

    // Si no hay returnTo, retornar el ID y nombre para flujos client-side.
    // El componente decide cuándo refrescar para no desmontar modales guiados.
    return { id: workGroup.id, name: workGroup.name };
  } catch (error) {
    // Manejar error de constraint único (nombre duplicado)
    if (isTenantNameUniqueError(error)) {
      throw new Error("Ya existe un grupo de trabajo con ese nombre en este tenant.");
    }
    // Re-lanzar otros errores
    throw error;
  }
}

export async function updateWorkGroup(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    redirectBack(formData);
    return;
  }

  const id = String(formData.get("workGroupId") || "");
  const name = formData.get("name")?.toString().trim();

  if (!id || !name) {
    redirectBack(formData);
    return;
  }

  // Validar unicidad de nombre solo para WGs ACTIVE (ver contrato 7.8)
  // Si el WG actual está ACTIVE, verificar que no existe otro WG ACTIVE con el mismo nombre
  const currentWG = await prisma.hostWorkGroup.findFirst({
    where: {
      id,
      tenantId: tenantId,
    },
    select: { status: true },
  });

  if (currentWG?.status === "ACTIVE") {
    const existingActive = await prisma.hostWorkGroup.findFirst({
      where: {
        tenantId: tenantId,
        name,
        status: "ACTIVE",
        id: { not: id }, // Excluir el WG actual
      },
      select: { id: true },
    });

    if (existingActive) {
      throw new Error("Ya existe un grupo de trabajo ACTIVE con ese nombre en este tenant.");
    }
  }

  try {
    await prisma.hostWorkGroup.updateMany({
      where: {
        id,
        tenantId: tenantId,
      },
      data: {
        name,
      },
    });

    revalidatePath("/host/workgroups");
    revalidatePath(`/host/workgroups/${id}`);
    redirectBack(formData);
  } catch (error) {
    // Manejar error de constraint único (nombre duplicado)
    if (isTenantNameUniqueError(error)) {
      throw new Error("Ya existe un grupo de trabajo con ese nombre en este tenant.");
    }
    // Re-lanzar otros errores
    throw error;
  }
}

export async function updateWorkGroupProperties(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    redirectBack(formData);
    return;
  }

  const workGroupId = String(formData.get("workGroupId") || "");
  const rawPropertyIds = formData.get("propertyIds")?.toString() || "[]";
  const skipRevalidate = formData.get("skipRevalidate")?.toString() === "true";
  let propertyIds: string[] = [];
  try {
    propertyIds = JSON.parse(rawPropertyIds);
  } catch {
    propertyIds = [];
  }

  if (!workGroupId) {
    throw new Error("Grupo de trabajo inválido.");
  }

  const workGroup = await prisma.hostWorkGroup.findFirst({
    where: { id: workGroupId, tenantId: tenantId },
    select: { id: true },
  });

  if (!workGroup) {
    throw new Error("Grupo de trabajo no encontrado.");
  }

  // Validar que las propiedades existen y pertenecen al tenant del host
  const validProperties = await prisma.property.findMany({
    where: {
      tenantId: tenantId,
      isActive: true,
      id: { in: propertyIds },
    },
    select: { id: true },
  });
  const validPropertyIds = new Set(validProperties.map((p) => p.id));
  
  // Deduplicar propertyIds y filtrar solo válidos
  const finalPropertyIds = Array.from(new Set(propertyIds.filter((id) => validPropertyIds.has(id))));

  // HostWorkGroupProperty: replace semantics to ensure consistency.
  // Delete ALL existing rows for workGroupId (regardless of tenantId) to clean stale rows.
  // Then insert new ones with correct hostTenantId.
  const hostTenantId = tenantId; // Explicitly use host tenant, NOT servicesTenantId

  await prisma.$transaction(async (tx) => {
    // Eliminar TODAS las filas existentes para este workGroup (sin filtrar por tenantId)
    // Esto limpia filas "stale" con tenantId incorrecto (ej. servicesTenantId)
    await tx.hostWorkGroupProperty.deleteMany({
      where: {
        workGroupId,
      },
    });

    // Insertar las nuevas filas (deduplicadas) con tenantId correcto
    if (finalPropertyIds.length > 0) {
      await tx.hostWorkGroupProperty.createMany({
        data: finalPropertyIds.map((propertyId) => ({
          tenantId: hostTenantId, // Asegurar que siempre use hostTenantId
          workGroupId,
          propertyId,
        })),
        skipDuplicates: true, // Resiliencia adicional contra duplicados
      });
    }
  });

  // Log de desarrollo para debugging
  if (process.env.NODE_ENV === "development") {
    console.warn("[HostWorkGroup save properties]", {
      hostTenantId,
      workGroupId,
      propertyIdsCount: finalPropertyIds.length,
      propertyIdsPreview: finalPropertyIds.slice(0, 5),
    });
  }

  if (!skipRevalidate) {
    revalidatePath("/host/workgroups");
    revalidatePath(`/host/workgroups/${workGroupId}`);
  }
}

export async function deleteWorkGroup(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    redirectBack(formData);
    return;
  }

  const id = String(formData.get("workGroupId") || "");
  if (!id) redirectBack(formData);

  // Verificar si tiene propiedades asignadas o ejecutores
  const [propertiesCount, executorsCount] = await Promise.all([
    prisma.hostWorkGroupProperty.count({
      where: {
        workGroupId: id,
        tenantId: tenantId,
      },
    }),
    prisma.workGroupExecutor.count({
      where: {
        workGroupId: id,
        hostTenantId: tenantId,
        status: "ACTIVE",
      },
    }),
  ]);

  if (propertiesCount > 0 || executorsCount > 0) {
    throw new Error(
      `No se puede eliminar este grupo de trabajo porque tiene ${propertiesCount} propiedades asignadas y ${executorsCount} ejecutores activos.`
    );
  }

  await prisma.hostWorkGroup.deleteMany({
    where: {
      id,
      tenantId: tenantId,
    },
  });

  revalidatePath("/host/workgroups");
  redirect("/host/workgroups");
}

export async function toggleWorkGroupStatus(
  workGroupId: string,
  status: "ACTIVE" | "INACTIVE"
) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    throw new Error("Tenant no encontrado.");
  }

  // Validar permisos: solo OWNER, MANAGER o AUXILIAR pueden editar propiedades
  const canEditProperties = ["OWNER", "MANAGER", "AUXILIAR"].includes(user.role);
  if (!canEditProperties) {
    throw new Error("No tienes permisos para realizar esta acción.");
  }

  // Verificar que el workGroup existe y pertenece al tenant
  const workGroup = await prisma.hostWorkGroup.findFirst({
    where: {
      id: workGroupId,
      tenantId: tenantId,
    },
    select: {
      id: true,
      name: true,
      status: true,
    },
  });

  if (!workGroup) {
    throw new Error("Grupo de trabajo no encontrado.");
  }

  // Si el status es el mismo, no hacer nada
  if (workGroup.status === status) {
    return { ok: true };
  }

  // Validar unicidad de nombre solo si se está activando (según contrato 7.8)
  if (status === "ACTIVE") {
    const existingActive = await prisma.hostWorkGroup.findFirst({
      where: {
        tenantId: tenantId,
        name: workGroup.name,
        status: "ACTIVE",
        id: { not: workGroupId },
      },
      select: { id: true },
    });

    if (existingActive) {
      throw new Error("Ya existe un grupo de trabajo ACTIVE con ese nombre en este tenant.");
    }
  }

  // Actualizar status usando updateMany para hard tenant-scope
  await prisma.hostWorkGroup.updateMany({
    where: {
      id: workGroupId,
      tenantId: tenantId,
    },
    data: {
      status,
    },
  });

  // Revalidar rutas
  revalidatePath("/host/workgroups");
  revalidatePath(`/host/workgroups/${workGroupId}`);

  return { ok: true };
}

