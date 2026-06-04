// app/host/workgroups/actions-executors.ts
"use server";

import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toggleExecutorStatus } from "@/lib/workgroups/toggleExecutorStatus";
import { assertNoConflictingExecutor } from "@/lib/workgroups/assertNoConflictingExecutor";
import { reconcileOpenCleanings } from "@/lib/cleanings/reconcileOpenCleanings";

function redirectBack(formData: FormData) {
  const returnTo = formData.get("returnTo")?.toString();
  if (returnTo && returnTo.startsWith("/host/workgroups")) {
    redirect(returnTo);
  }
  redirect("/host/workgroups");
}

/**
 * Agrega un ejecutor existente (Team) a un WorkGroup.
 * Reutiliza un teamId que ya está conectado a otros WorkGroups del mismo Host.
 */
export async function addExecutorToWorkGroup(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) {
    redirectBack(formData);
    return;
  }

  const workGroupId = String(formData.get("workGroupId") || "");
  const teamId = String(formData.get("teamId") || "");

  if (!workGroupId || !teamId) {
    redirectBack(formData);
    return;
  }

  // Verificar que el WorkGroup existe
  const workGroup = await prisma.hostWorkGroup.findFirst({
    where: {
      id: workGroupId,
      tenantId: tenantId,
    },
    select: { id: true },
  });

  if (!workGroup) {
    throw new Error("Grupo de trabajo no encontrado.");
  }

  // Buscar un WorkGroupExecutor existente para este teamId en el mismo hostTenantId
  // para obtener el servicesTenantId
  const existingExecutor = await prisma.workGroupExecutor.findFirst({
    where: {
      hostTenantId: tenantId,
      teamId,
      status: "ACTIVE",
    },
    select: {
      servicesTenantId: true,
    },
  });

  if (!existingExecutor) {
    throw new Error("No se encontró información del equipo ejecutor. El equipo debe estar conectado a otro grupo de trabajo primero.");
  }

  // VALIDACIÓN MULTI-TEAM: delega en helper centralizado.
  await assertNoConflictingExecutor(prisma, {
    hostTenantId: tenantId,
    workGroupId,
    servicesTenantId: existingExecutor.servicesTenantId,
    teamId,
  });

  // Crear/activar WorkGroupExecutor para este WorkGroup
  await prisma.workGroupExecutor.upsert({
    where: {
      hostTenantId_workGroupId_teamId: {
        hostTenantId: tenantId,
        workGroupId,
        teamId,
      },
    },
    create: {
      hostTenantId: tenantId,
      workGroupId,
      servicesTenantId: existingExecutor.servicesTenantId,
      teamId,
      status: "ACTIVE",
    },
    update: {
      status: "ACTIVE",
    },
  });

  // Reconciliar limpiezas OPEN del WG ahora que tiene un ejecutor activo (non-blocking)
  try {
    await reconcileOpenCleanings({
      type: "workgroup",
      hostTenantId: tenantId,
      workGroupId,
    });
  } catch (err) {
    console.error("[addExecutorToWorkGroup] reconcile non-blocking error:", err);
  }

  revalidatePath("/host/workgroups");
  revalidatePath(`/host/workgroups/${workGroupId}`);

  const skipRedirect = formData.get("skipRedirect")?.toString() === "true";
  if (skipRedirect) return;
  redirectBack(formData);
}

/**
 * Cambia el status de un WorkGroupExecutor (ACTIVE ↔ INACTIVE).
 * Reutiliza la lógica backend existente en toggleExecutorStatus.
 */
export async function toggleExecutorStatusAction(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const workGroupId = String(formData.get("workGroupId") || "");
  const teamId = String(formData.get("teamId") || "");
  const newStatus = String(formData.get("newStatus") || "");

  if (!workGroupId || !teamId || (newStatus !== "ACTIVE" && newStatus !== "INACTIVE")) {
    throw new Error("Parámetros inválidos");
  }

  // Verificar que el WorkGroup existe y pertenece al tenant
  const workGroup = await prisma.hostWorkGroup.findFirst({
    where: {
      id: workGroupId,
      tenantId: tenantId,
    },
    select: { id: true },
  });

  if (!workGroup) {
    throw new Error("Grupo de trabajo no encontrado.");
  }

  // Invocar la función backend existente
  const result = await toggleExecutorStatus({
    hostTenantId: tenantId,
    workGroupId,
    teamId,
    newStatus: newStatus as "ACTIVE" | "INACTIVE",
  });

  // Al reactivar un ejecutor, reconciliar limpiezas OPEN del WG (non-blocking)
  // Al desactivar, toggleExecutorStatus ya abre las limpiezas afectadas.
  if (newStatus === "ACTIVE") {
    try {
      await reconcileOpenCleanings({
        type: "workgroup",
        hostTenantId: tenantId,
        workGroupId,
      });
    } catch (err) {
      console.error("[toggleExecutorStatusAction] reconcile non-blocking error:", err);
    }
  }

  // Revalidar rutas relevantes
  revalidatePath("/host/workgroups");
  revalidatePath(`/host/workgroups/${workGroupId}`);
  revalidatePath(`/host/workgroups/${workGroupId}/teams/${teamId}`);

  return result;
}

