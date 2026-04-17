// lib/cleaner/checkCleaningPropertyAccess.ts
import prisma from "@/lib/prisma";
import { resolveCleanerContext } from "./resolveCleanerContext";
import { getAccessiblePropertiesAndTenants } from "./getAccessiblePropertiesAndTenants";
import { getActiveMembershipsForUser } from "./getActiveMembershipsForUser";

export interface CleaningPropertyAccessResult {
  hasAccess: boolean;
  isAssigned: boolean;
  reason?: string;
}

/**
 * Verifica si un cleaner tiene acceso a la propiedad de una limpieza
 * (sin requerir que esté asignado a la limpieza)
 * 
 * Retorna:
 * - hasAccess: true si la propiedad es accesible vía WGE o PropertyTeam
 * - isAssigned: true si el cleaner está asignado a la limpieza
 */
export async function checkCleaningPropertyAccess(
  cleaningId: string
): Promise<CleaningPropertyAccessResult> {
  const context = await resolveCleanerContext();

  // Obtener cleaning básico con propertyId
  const cleaning = await prisma.cleaning.findUnique({
    where: { id: cleaningId },
    select: {
      id: true,
      property: {
        select: {
          id: true,
        },
      },
      tenantId: true,
      assignedMembershipId: true,
      assignmentStatus: true,
    },
  });

  if (!cleaning) {
    return { hasAccess: false, isAssigned: false, reason: "Cleaning not found" };
  }

  // Verificar si está asignado
  let isAssigned = false;
  
  if (context.mode === "membership") {
    const membershipsAccess = await getActiveMembershipsForUser(context.user.id);
    isAssigned =
      (cleaning.assignedMembershipId &&
        membershipsAccess.membershipIds.includes(cleaning.assignedMembershipId)) ||
      false;
  }

  // Validar acceso a la propiedad
  if (context.mode === "membership") {
    const membershipsAccess = await getActiveMembershipsForUser(context.user.id);
    const teamIds = membershipsAccess.allTeamIds;

    if (teamIds.length === 0) {
      return { hasAccess: false, isAssigned, reason: "No team memberships" };
    }

    // Usar helper canónico para obtener propiedades accesibles
    const { propertyIds: accessiblePropertyIds, tenantIds: accessibleTenantIds } =
      await getAccessiblePropertiesAndTenants(context.user.id, teamIds);

    // Verificar que la propiedad y tenant sean accesibles
    const hasPropertyAccess =
      accessiblePropertyIds.includes(cleaning.property.id) &&
      accessibleTenantIds.includes(cleaning.tenantId);

    return {
      hasAccess: hasPropertyAccess,
      isAssigned,
      reason: hasPropertyAccess ? undefined : "Property not accessible",
    };
  } else {
    // Legacy mode: validar que el team del cleaning coincida con el team del legacyMember
    if (!context.legacyMember) {
      return { hasAccess: false, isAssigned, reason: "No legacy member" };
    }

    // En legacy, necesitamos verificar PropertyTeam
    const propertyTeam = await (prisma as any).propertyTeam.findFirst({
      where: {
        tenantId: cleaning.tenantId,
        propertyId: cleaning.property.id,
        teamId: context.legacyMember.teamId,
      },
    });

    return {
      hasAccess: !!propertyTeam,
      isAssigned,
      reason: propertyTeam ? undefined : "PropertyTeam not found",
    };
  }
}

