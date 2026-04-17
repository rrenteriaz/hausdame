import prisma from "@/lib/prisma";
import { resolveCleanerContext } from "@/lib/cleaner/resolveCleanerContext";
import { forbidden, notFound } from "@/lib/http/errors";
import { getActiveMembershipsForUser } from "@/lib/cleaner/getActiveMembershipsForUser";

export async function assertCleanerCanOperateCleaning(cleaningId: string) {
  const context = await resolveCleanerContext();
  const cleaning = await prisma.cleaning.findUnique({
    where: { id: cleaningId },
    select: {
      id: true,
      tenantId: true,
      teamId: true,
      status: true,
      assignmentStatus: true,
      assignedMembershipId: true,
    },
  });

  if (!cleaning) {
    notFound("Limpieza no encontrada.");
  }

  if (context.mode === "membership") {
    const access = await getActiveMembershipsForUser(context.user.id);
    if (
      cleaning.assignmentStatus !== "ASSIGNED" ||
      !cleaning.assignedMembershipId ||
      !access.membershipIds.includes(cleaning.assignedMembershipId)
    ) {
      forbidden("Acceso denegado.");
    }

    return {
      mode: "membership" as const,
      userId: context.user.id,
      membershipId: cleaning.assignedMembershipId,
      memberId: null,
      cleaning,
    };
  }

  forbidden("Acceso denegado.");
}

