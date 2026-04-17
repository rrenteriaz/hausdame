// lib/cleaner/requireCleanerAccessToCleaning.ts
import prisma from "@/lib/prisma";
import { resolveCleanerContext, CleanerContext } from "./resolveCleanerContext";
import { forbidden, notFound } from "@/lib/http/errors";
import { getActiveMembershipsForUser } from "./getActiveMembershipsForUser";
import { getAccessibleHostTenantIdsForUser } from "./getAccessibleHostTenantIdsForUser";

export interface CleanerCleaningAccess {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
  };
  cleaning: {
    id: string;
    teamId: string | null;
    tenantId: string;
    scheduledDate: Date;
    status: string;
    notes: string | null;
    assignedMembershipId: string | null;
    assignmentStatus: string;
    startedAt: Date | null;
    completedAt: Date | null;
    scheduledAtPlanned: Date | null;
    needsAttention: boolean;
    attentionReason: string | null;
    property: {
      id: string;
      name: string;
      shortName: string | null;
      address: string | null;
      latitude: number | null;
      longitude: number | null;
      coverAssetGroupId: string | null;
      checkInTime: string | null;
      checkOutTime: string | null;
      wifiSsid: string | null;
      wifiPassword: string | null;
      accessCode: string | null;
    };
    assignedMember: {
      id: string;
      name: string;
      team: {
        id: string;
        name: string;
      };
    } | null;
    TeamMembership: {
      id: string;
      userId: string;
      User: {
        id: string;
        name: string | null;
        email: string;
      };
    } | null;
  };
  mode: "membership" | "legacy";
  membership?: {
    id: string;
    teamId: string;
    role: string;
    status: string;
  };
  legacyMember?: {
    id: string;
    teamId: string;
    isActive: boolean;
  };
}

/**
 * Requiere acceso de cleaner a una limpieza
 * Valida TeamMembership o TeamMember legacy según el contexto
 */
export async function requireCleanerAccessToCleaning(
  cleaningId: string
): Promise<CleanerCleaningAccess> {
  // Resolver contexto del cleaner
  const context = await resolveCleanerContext();

  // Cargar cleaning con todas las relaciones necesarias
  const cleaning = await prisma.cleaning.findUnique({
    where: { id: cleaningId },
    select: {
      id: true,
      teamId: true,
      tenantId: true,
      scheduledDate: true,
      status: true,
      notes: true,
      assignedMembershipId: true,
      assignmentStatus: true,
      startedAt: true,
      completedAt: true,
      scheduledAtPlanned: true,
      needsAttention: true,
      attentionReason: true,
      property: {
        select: {
          id: true,
          name: true,
          shortName: true,
          address: true,
          latitude: true,
          longitude: true,
          coverAssetGroupId: true,
          checkInTime: true,
          checkOutTime: true,
          wifiSsid: true,
          wifiPassword: true,
          accessCode: true,
        },
      },
      assignedMember: {
        select: {
          id: true,
          name: true,
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      TeamMembership: {
        select: {
          id: true,
          userId: true,
          User: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!cleaning) {
    notFound("Limpieza no encontrada.");
  }

  const assignedMembership = cleaning.assignedMembershipId
    ? await prisma.teamMembership.findUnique({
        where: { id: cleaning.assignedMembershipId },
        select: { id: true, userId: true, status: true, teamId: true, role: true },
      })
    : null;

  const isAssignedToViewer =
    !!assignedMembership && assignedMembership.userId === context.user.id;

  // Validar acceso según modo
  if (context.mode === "membership") {
    const membershipsAccess = await getActiveMembershipsForUser(context.user.id);
    const myMembershipIds = membershipsAccess.membershipIds;
    const { allTeamIds, activeTeamIds, tenantIds } = membershipsAccess;
    // En WGE, cleaning.tenantId es el tenant del Host (no el del equipo del cleaner).
    // Por eso también se incluyen los hostTenantIds accesibles vía WorkGroupExecutor.
    const hostTenantIds = await getAccessibleHostTenantIdsForUser(context.user.id);
    const allAccessibleTenantIds = new Set([...tenantIds, ...hostTenantIds]);
    if (!allAccessibleTenantIds.has(cleaning.tenantId) && !isAssignedToViewer) {
      forbidden("No tienes acceso a esta limpieza.");
    }

      if (!isAssignedToViewer) {
        // Intentar obtener propiedades vía WGE primero
        const { getPropertiesForCleanerTeamsViaWGE } = await import("@/lib/workgroups/getPropertiesForCleanerTeamViaWGE");
        const wgePropertyIds = await getPropertiesForCleanerTeamsViaWGE(allTeamIds);
        
        let allowedPropertyIds: Set<string>;
        let propertyTeams: any[] = [];
        
        if (wgePropertyIds.length > 0) {
          // Usar propiedades vía WGE
          allowedPropertyIds = new Set(wgePropertyIds);
        } else {
          // Fallback a PropertyTeam
          propertyTeams = await (prisma as any).propertyTeam.findMany({
            where: {
              tenantId: { in: tenantIds },
              teamId: { in: allTeamIds },
            },
            select: {
              propertyId: true,
              teamId: true,
              property: { select: { isActive: true } },
            },
          });

          allowedPropertyIds = new Set(
            propertyTeams
              .filter((pt: any) => pt.property?.isActive !== false)
              .map((pt: any) => pt.propertyId)
          );
        }
        
        if (!allowedPropertyIds.has(cleaning.property.id)) {
          forbidden("No tienes acceso a esta limpieza.");
        }

      const now = new Date();
      const isFuture = cleaning.scheduledDate > now;
      const activeTeamsForProperty = propertyTeams
        .filter((pt: any) => pt.propertyId === cleaning.property.id)
        .map((pt: any) => pt.teamId)
        .filter((teamId: string) => activeTeamIds.includes(teamId));
      const mustBeActiveForFuture = cleaning.teamId
        ? activeTeamIds.includes(cleaning.teamId)
        : activeTeamsForProperty.length > 0;
      if (isFuture && !mustBeActiveForFuture) {
        forbidden("Equipo inactivo.");
      }
    }

    const isAssignedToMe =
      (cleaning.assignedMembershipId &&
        myMembershipIds.includes(cleaning.assignedMembershipId)) ||
      isAssignedToViewer;
    const isOpenUnassigned =
      cleaning.assignmentStatus === "OPEN" &&
      !cleaning.assignedMembershipId;

    if (!isAssignedToMe && !isOpenUnassigned) {
      forbidden("No tienes acceso a esta limpieza.");
    }

    if (
      isAssignedToViewer &&
      cleaning.teamId &&
      assignedMembership?.teamId &&
      cleaning.teamId !== assignedMembership.teamId
    ) {
      forbidden("No tienes acceso a esta limpieza.");
    }

    const membership =
      (cleaning.teamId
        ? context.memberships.find((m) => m.teamId === cleaning.teamId)
        : undefined) ||
      (cleaning.assignedMembershipId
        ? context.memberships.find((m) => m.id === cleaning.assignedMembershipId)
        : undefined) ||
      (isAssignedToViewer
        ? {
            id: assignedMembership.id,
            teamId: assignedMembership.teamId,
            role: assignedMembership.role,
            status: assignedMembership.status,
          }
        : undefined);

    return {
      user: context.user,
      cleaning,
      mode: "membership",
      membership,
    };
  } else {
    // Modo legacy: validar que legacyMember.teamId === cleaning.teamId
    if (!context.legacyMember) {
      forbidden("No perteneces a un equipo.");
    }

    if (cleaning.teamId !== context.legacyMember.teamId) {
      forbidden("No tienes acceso a esta limpieza.");
    }

    // Log warning para legacy
    console.warn("[legacy-cleaner] Cleaning access via TeamMember fallback", {
      userId: context.user.id,
      cleaningId: cleaning.id,
      teamId: cleaning.teamId,
    });

    return {
      user: context.user,
      cleaning,
      mode: "legacy",
      legacyMember: context.legacyMember,
    };
  }
}
