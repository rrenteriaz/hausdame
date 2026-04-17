"use server";

import prisma from "@/lib/prisma";
import { resolveCleanerContext } from "@/lib/cleaner/resolveCleanerContext";
import { revalidatePath } from "next/cache";
import { isTeamLeader } from "@/lib/authz/cleanerTeamPermissions";
import { ensurePropertyMembershipAccess } from "@/lib/propertyAccess/ensurePropertyAccess";

function redirectBack(formData: FormData) {
  // En cleaner, normalmente refrescamos desde el cliente. Esto es fallback.
  const returnTo = formData.get("returnTo")?.toString();
  if (returnTo && returnTo.startsWith("/cleaner/teams")) {
    return;
  }
}

export async function createCleanerTeam(formData: FormData) {
  const ctx = await resolveCleanerContext();

  const name = formData.get("name")?.toString().trim();
  const notes = formData.get("notes")?.toString().trim() || null;

  if (!name) {
    redirectBack(formData);
    throw new Error("El nombre del equipo es requerido.");
  }

  const homeTenantId = ctx.homeTenantId;
  
  // Si no tiene tenant hogar, no puede crear equipo
  if (!homeTenantId) {
    throw new Error("No tienes un tenant asignado. Por favor, contacta al soporte.");
  }

  try {
    const team = await prisma.team.create({
      data: {
        tenantId: homeTenantId,
        name,
        notes: notes ?? undefined,
      },
      select: { id: true },
    });

    // Crear membership del creador como TL explícito
    await prisma.teamMembership.create({
      data: {
        teamId: team.id,
        userId: ctx.user.id,
        role: "TEAM_LEADER",
        status: "ACTIVE",
      },
      select: { id: true },
    });

    revalidatePath("/cleaner/teams");
    return { ok: true as const, teamId: team.id };
  } catch (error: any) {
    // constraint único @@unique([tenantId, name])
    if (error?.code === "P2002" && error?.meta?.target?.includes("tenantId") && error?.meta?.target?.includes("name")) {
      throw new Error("Ya existe un equipo con ese nombre en tu tenant.");
    }
    throw error;
  }
}

export async function setAssignedMembersForProperty(formData: FormData) {
  const ctx = await resolveCleanerContext();

  const propertyId = formData.get("propertyId")?.toString();
  const teamId = formData.get("teamId")?.toString();
  const selectedRaw = formData.get("selectedMembershipIds")?.toString() || "[]";

  if (!propertyId || !teamId) {
    throw new Error("Faltan datos para actualizar asignaciones.");
  }

  const selectedMembershipIds: string[] = (() => {
    try {
      const parsed = JSON.parse(selectedRaw);
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
    } catch {
      return [];
    }
  })();

  const isLeader = await isTeamLeader(ctx.user.id, teamId);
  if (!isLeader) {
    throw new Error("No tienes permisos para editar asignaciones.");
  }

  const propertyTeam = await (prisma as any).propertyTeam.findFirst({
    where: { teamId, propertyId },
    select: { id: true },
  });
  if (!propertyTeam) {
    throw new Error("La propiedad no pertenece a este equipo.");
  }

  const memberships = await prisma.teamMembership.findMany({
    where: { teamId, status: "ACTIVE" },
    select: { id: true, userId: true, role: true },
    orderBy: { createdAt: "asc" },
  });

  const leaderMembership = memberships.find((m) => m.role === "TEAM_LEADER") || null;
  if (!leaderMembership || leaderMembership.userId !== ctx.user.id) {
    throw new Error("No tienes permisos para editar asignaciones.");
  }

  const allowedMembershipIds = new Set(
    memberships.filter((m) => m.id !== leaderMembership.id).map((m) => m.id)
  );
  const filteredSelection = selectedMembershipIds.filter((id) =>
    allowedMembershipIds.has(id)
  );

  const pma = (prisma as any).propertyMemberAccess;
  if (!pma?.deleteMany || !pma?.findMany) {
    throw new Error("No se encontró PropertyMemberAccess en Prisma.");
  }

  await prisma.$transaction(async (tx) => {
    await (tx as any).propertyMemberAccess.deleteMany({
      where: {
        propertyId,
        teamMembershipId: { not: leaderMembership.id },
        TeamMembership: { teamId },
      },
    });

    await ensurePropertyMembershipAccess({
      propertyId,
      teamMembershipId: leaderMembership.id,
      status: "ACTIVE",
      db: tx,
    });

    for (const teamMembershipId of filteredSelection) {
      await ensurePropertyMembershipAccess({
        propertyId,
        teamMembershipId,
        status: "ACTIVE",
        db: tx,
      });
    }
  });

  const finalAssigned = await (prisma as any).propertyMemberAccess.findMany({
    where: {
      propertyId,
      TeamMembership: { teamId },
    },
    select: { teamMembershipId: true },
  });

  revalidatePath(`/cleaner/teams/${teamId}`);

  return {
    ok: true as const,
    assignedMembershipIds: finalAssigned.map((a: any) => a.teamMembershipId),
  };
}

export async function toggleTeamMemberStatus(formData: FormData) {
  const ctx = await resolveCleanerContext();

  const teamId = formData.get("teamId")?.toString();
  const membershipId = formData.get("membershipId")?.toString();
  const nextStatus = formData.get("nextStatus")?.toString();

  if (!teamId || !membershipId || !nextStatus) {
    throw new Error("Faltan datos para actualizar el miembro.");
  }

  const isLeader = await isTeamLeader(ctx.user.id, teamId);
  if (!isLeader) {
    throw new Error("No tienes permisos para editar miembros.");
  }

  const leaderMembership = await prisma.teamMembership.findFirst({
    where: { teamId, status: "ACTIVE", role: "TEAM_LEADER" },
    select: { id: true, userId: true },
  });

  if (!leaderMembership || leaderMembership.userId !== ctx.user.id) {
    throw new Error("No tienes permisos para editar miembros.");
  }

  if (leaderMembership.id === membershipId) {
    throw new Error("No puedes inactivar al líder del equipo.");
  }

  if (nextStatus !== "ACTIVE" && nextStatus !== "REMOVED") {
    throw new Error("Estado inválido.");
  }

  await prisma.teamMembership.updateMany({
    where: { id: membershipId, teamId },
    data: { status: nextStatus },
  });

  revalidatePath(`/cleaner/teams/${teamId}`);
  return { ok: true as const };
}

/**
 * El TL define el ejecutor preferido para una propiedad de su equipo.
 * Crea o actualiza PropertyAssignmentConfig.
 *
 * FormData: teamId, propertyId, preferredMembershipId
 */
export async function setPreferredExecutor(formData: FormData) {
  const ctx = await resolveCleanerContext();

  const teamId = formData.get("teamId")?.toString();
  const propertyId = formData.get("propertyId")?.toString();
  const preferredMembershipId = formData.get("preferredMembershipId")?.toString();

  if (!teamId || !propertyId || !preferredMembershipId) {
    throw new Error("Faltan datos para configurar el ejecutor preferido.");
  }

  const leaderMembership = await prisma.teamMembership.findFirst({
    where: { teamId, userId: ctx.user.id, role: "TEAM_LEADER", status: "ACTIVE" },
    select: { id: true },
  });
  if (!leaderMembership) {
    throw new Error("No tienes permisos para configurar ejecutor preferido.");
  }

  // Validar que el membership preferido es ACTIVE y pertenece al mismo team
  const targetMembership = await prisma.teamMembership.findFirst({
    where: { id: preferredMembershipId, teamId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!targetMembership) {
    throw new Error("El miembro seleccionado no es válido.");
  }

  // Obtener hostTenantId y servicesTenantId desde WorkGroupExecutor
  const wge = await prisma.workGroupExecutor.findFirst({
    where: { teamId, status: "ACTIVE" },
    select: { hostTenantId: true, servicesTenantId: true },
  });
  const hostTenantId = wge?.hostTenantId ?? "";
  const servicesTenantId = wge?.servicesTenantId ?? ctx.homeTenantId ?? "";

  await (prisma as any).propertyAssignmentConfig.upsert({
    where: { propertyId_teamId: { propertyId, teamId } },
    update: { preferredMembershipId, updatedAt: new Date() },
    create: {
      propertyId,
      teamId,
      preferredMembershipId,
      hostTenantId,
      servicesTenantId,
    },
  });

  revalidatePath(`/cleaner/teams/${teamId}`);
  return { ok: true as const };
}

/**
 * El TL elimina la preferencia de ejecutor para una propiedad de su equipo.
 *
 * FormData: teamId, propertyId
 */
export async function removePreferredExecutor(formData: FormData) {
  const ctx = await resolveCleanerContext();

  const teamId = formData.get("teamId")?.toString();
  const propertyId = formData.get("propertyId")?.toString();

  if (!teamId || !propertyId) {
    throw new Error("Faltan datos para eliminar el ejecutor preferido.");
  }

  const leaderMembership = await prisma.teamMembership.findFirst({
    where: { teamId, userId: ctx.user.id, role: "TEAM_LEADER", status: "ACTIVE" },
    select: { id: true },
  });
  if (!leaderMembership) {
    throw new Error("No tienes permisos para eliminar el ejecutor preferido.");
  }

  await (prisma as any).propertyAssignmentConfig.deleteMany({
    where: { propertyId, teamId },
  });

  revalidatePath(`/cleaner/teams/${teamId}`);
  return { ok: true as const };
}

export async function updateTeamStatus(formData: FormData) {
  const ctx = await resolveCleanerContext();

  const teamId = formData.get("teamId")?.toString();
  const nextStatus = formData.get("nextStatus")?.toString();

  if (!teamId || !nextStatus) {
    throw new Error("Faltan datos para actualizar el equipo.");
  }

  const isLeader = await isTeamLeader(ctx.user.id, teamId);
  if (!isLeader) {
    throw new Error("No tienes permisos para editar el equipo.");
  }

  const leaderMembership = await prisma.teamMembership.findFirst({
    where: { teamId, status: "ACTIVE", role: "TEAM_LEADER" },
    select: { id: true, userId: true },
  });

  if (!leaderMembership || leaderMembership.userId !== ctx.user.id) {
    throw new Error("No tienes permisos para editar el equipo.");
  }

  if (nextStatus !== "ACTIVE" && nextStatus !== "PAUSED") {
    throw new Error("Estado inválido.");
  }

  await prisma.team.updateMany({
    where: { id: teamId },
    data: { status: nextStatus },
  });

  revalidatePath(`/cleaner/teams/${teamId}`);
  return { ok: true as const };
}


