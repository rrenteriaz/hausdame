/**
 * Acciones de reasignación para el TL (Team Leader).
 *
 * El TL puede reasignar una limpieza PENDING a otro miembro activo de su equipo.
 * Reglas (contrato §FASE-E):
 * - cleaning.status debe ser PENDING
 * - El actor debe ser TL (TeamMembership.role === "TEAM_LEADER") del mismo team
 * - El miembro destino debe tener TeamMembership ACTIVE en el mismo team
 * - IN_PROGRESS → rechazar con error claro
 */

"use server";

import prisma from "@/lib/prisma";
import { resolveCleanerContext } from "@/lib/cleaner/resolveCleanerContext";
import { assertCleaningIsNotFrozen } from "@/lib/cleanings/assertCleaningIsNotFrozen";
import { assertAssignmentCoherence } from "@/lib/cleanings/assertCleaningInvariants";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * El TL reasigna una limpieza PENDING a otro miembro de su equipo.
 *
 * FormData:
 * - cleaningId: string
 * - targetMembershipId: string — la TeamMembership del miembro destino
 * - returnTo?: string
 */
export async function reassignCleaningByLeader(formData: FormData) {
  const cleaningId = String(formData.get("cleaningId") || "");
  const targetMembershipId = String(formData.get("targetMembershipId") || "");
  const returnTo = formData.get("returnTo")?.toString();

  if (!cleaningId || !targetMembershipId) {
    if (returnTo?.startsWith("/cleaner")) redirect(returnTo);
    redirect("/cleaner");
    return;
  }

  try {
    const ctx = await resolveCleanerContext();
    if (!ctx.memberships || ctx.memberships.length === 0) {
      redirect("/cleaner");
      return;
    }

    // Verificar que el actor es TL en alguno de sus teams
    const tlMembership = await prisma.teamMembership.findFirst({
      where: {
        userId: ctx.user.id,
        role: "TEAM_LEADER",
        status: "ACTIVE",
      },
      select: { id: true, teamId: true },
    });

    if (!tlMembership) {
      console.warn("[reassignCleaningByLeader] Usuario no es TL", { userId: ctx.user.id });
      redirect("/cleaner");
      return;
    }

    // Cargar la limpieza
    const cleaning = await prisma.cleaning.findUnique({
      where: { id: cleaningId },
      select: {
        id: true,
        teamId: true,
        tenantId: true,
        status: true,
        assignmentStatus: true,
        assignedMembershipId: true,
      },
    });

    if (!cleaning) {
      redirect("/cleaner");
      return;
    }

    // Verificar que el TL pertenece al mismo team que la limpieza
    if (cleaning.teamId !== tlMembership.teamId) {
      console.warn("[reassignCleaningByLeader] El TL no pertenece al equipo de la limpieza", {
        tlTeamId: tlMembership.teamId,
        cleaningTeamId: cleaning.teamId,
      });
      redirect("/cleaner");
      return;
    }

    // Freeze guard: no reasignar si ya inició
    assertCleaningIsNotFrozen(cleaningId, cleaning.status);

    // Validar que el miembro destino es ACTIVE y pertenece al mismo team
    const targetMembership = await prisma.teamMembership.findFirst({
      where: {
        id: targetMembershipId,
        teamId: tlMembership.teamId,
        status: "ACTIVE",
      },
      select: { id: true, teamId: true },
    });

    if (!targetMembership) {
      console.warn("[reassignCleaningByLeader] El miembro destino no es válido", {
        targetMembershipId,
        teamId: tlMembership.teamId,
      });
      redirect("/cleaner");
      return;
    }

    assertAssignmentCoherence({ assignedMembershipId: targetMembershipId, needsAttention: false, attentionReason: null }, "reassignCleaningByLeader");

    // Ejecutar la reasignación
    await prisma.cleaning.update({
      where: { id: cleaningId },
      data: {
        assignedMembershipId: targetMembershipId,
        assignmentStatus: "ASSIGNED",
        // Limpiar flags de DECLINED_BY_ASSIGNEE si aplica
        needsAttention: false,
        attentionReason: null,
      },
    });

    console.log("[assignment-model] reassignCleaningByLeader", {
      cleaningId,
      prevMembershipId: cleaning.assignedMembershipId,
      targetMembershipId,
      byTlMembershipId: tlMembership.id,
    });

    revalidatePath("/cleaner");
    revalidatePath(`/cleaner/cleanings/${cleaningId}`);
    revalidatePath("/host/cleanings");

    if (returnTo?.startsWith("/cleaner")) redirect(returnTo);
    redirect(`/cleaner/cleanings/${cleaningId}`);
  } catch (error: any) {
    if (error?.name === "CleaningFrozenError") {
      console.warn("[reassignCleaningByLeader] Limpieza congelada:", error.message);
      if (returnTo?.startsWith("/cleaner")) redirect(returnTo);
      redirect("/cleaner");
      return;
    }
    if (
      error?.message === "NEXT_REDIRECT" ||
      `${error?.digest || ""}`.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    console.error("[reassignCleaningByLeader] Error:", error);
    redirect("/cleaner");
  }
}
