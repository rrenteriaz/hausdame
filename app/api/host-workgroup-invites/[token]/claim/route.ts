// app/api/host-workgroup-invites/[token]/claim/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { ensureCleanerPersonalTeam } from "@/lib/teams/provisioning";
import { resolveCleanerContext } from "@/lib/cleaner/resolveCleanerContext";
import { assertNoConflictingExecutor } from "@/lib/workgroups/assertNoConflictingExecutor";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const resolvedParams = await params;
  const token = resolvedParams.token;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Validar que el usuario es CLEANER
  if (user.role !== "CLEANER") {
    return NextResponse.json(
      { error: "Solo Team Leaders (Cleaners) pueden aceptar esta invitación" },
      { status: 403 }
    );
  }

  // Verificar que el modelo está disponible
  if (!(prisma as any).hostWorkGroupInvite) {
    return NextResponse.json(
      { error: "El modelo HostWorkGroupInvite no está disponible. Por favor, regenera Prisma Client y reinicia el servidor." },
      { status: 500 }
    );
  }

  const invite = await (prisma as any).hostWorkGroupInvite.findUnique({
    where: { token },
    include: {
      workGroup: {
        select: {
          id: true,
          tenantId: true,
        },
      },
    },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invitación no encontrada" }, { status: 404 });
  }

  const now = new Date();
  const expiresAt = new Date(invite.expiresAt);
  const isExpired = expiresAt < now;
  const effectiveStatus =
    invite.status === "PENDING" && isExpired ? "EXPIRED" : invite.status;

  if (effectiveStatus !== "PENDING") {
    return NextResponse.json(
      {
        error:
          effectiveStatus === "EXPIRED"
            ? "Esta invitación ha expirado"
            : effectiveStatus === "REVOKED"
            ? "Esta invitación ha sido revocada"
            : "Esta invitación ya fue aceptada",
      },
      { status: 410 }
    );
  }

  // Resolver contexto del cleaner
  // REGLA DE ORO: resolveCleanerContext NO crea Team ni TeamMembership automáticamente
  let teamId: string;
  let servicesTenantId: string;

  try {
    const cleanerContext = await resolveCleanerContext(user);
    
    // Si no tiene tenant hogar, crear uno primero (solo en este flujo de claim)
    if (!cleanerContext.homeTenantId) {
      // Crear tenant hogar para el cleaner (solo en este flujo específico)
      const tenantName = user.name
        ? `Services - ${user.name}`
        : `Services - ${user.email.split("@")[0]}`;
      const tenantSlug = tenantName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      let finalSlug = tenantSlug;
      let attempts = 0;
      let tenant: { id: string } | null = null;

      while (attempts < 10) {
        try {
          tenant = await prisma.tenant.create({
            data: { name: tenantName, slug: finalSlug },
            select: { id: true },
          });
          break;
        } catch (error: any) {
          if (error.code === "P2002" && error.meta?.target?.includes("slug")) {
            attempts++;
            finalSlug = `${tenantSlug}-${attempts}`;
          } else {
            throw error;
          }
        }
      }

      if (!tenant) {
        throw new Error("No se pudo crear tenant hogar después de 10 intentos");
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { tenantId: tenant.id },
      });

      servicesTenantId = tenant.id;
    } else {
      servicesTenantId = cleanerContext.homeTenantId;
    }
    
    // Buscar TeamMembership ACTIVE donde el usuario es TEAM_LEADER en el tenant hogar
    const leaderMembership = await prisma.teamMembership.findFirst({
      where: {
        userId: user.id,
        role: "TEAM_LEADER",
        status: "ACTIVE",
        Team: {
          tenantId: servicesTenantId,
        },
      },
      include: {
        Team: {
          select: {
            id: true,
            tenantId: true,
          },
        },
      },
    });

    if (!leaderMembership) {
      // Si no existe, crear el equipo "Mi equipo" usando ensureCleanerPersonalTeam
      const personalTeam = await ensureCleanerPersonalTeam({
        tenantId: servicesTenantId,
        cleanerUserId: user.id,
      });
      teamId = personalTeam.teamId;
    } else {
      teamId = leaderMembership.Team.id;
    }
  } catch (error: any) {
    console.error("Error resolviendo contexto del cleaner:", error);
    return NextResponse.json(
      { error: "Error al resolver tu equipo. Por favor, intenta nuevamente." },
      { status: 500 }
    );
  }

  const hostTenantId = invite.workGroup.tenantId;
  const workGroupId = invite.workGroupId;

  // Crear/activar WorkGroupExecutor y marcar invite como CLAIMED en una transacción
  try {
    await prisma.$transaction(async (tx) => {
      // VALIDACIÓN MULTI-TEAM: dentro de la tx para consistencia.
      // Si el TL ya tiene otro equipo activo en este WG (mismo servicesTenantId),
      // bloqueamos el claim para no violar la regla de unicidad operativa.
      await assertNoConflictingExecutor(tx, {
        hostTenantId,
        workGroupId,
        servicesTenantId,
        teamId,
      });

      // Upsert WorkGroupExecutor
      await tx.workGroupExecutor.upsert({
        where: {
          hostTenantId_workGroupId_teamId: {
            hostTenantId,
            workGroupId,
            teamId,
          },
        },
        create: {
          hostTenantId,
          workGroupId,
          servicesTenantId,
          teamId,
          status: "ACTIVE",
        },
        update: {
          status: "ACTIVE",
          servicesTenantId, // Asegurar que servicesTenantId esté actualizado
        },
      });

      // Marcar invite como CLAIMED
      await (tx as any).hostWorkGroupInvite.update({
        where: { id: invite.id },
        data: {
          status: "CLAIMED",
          claimedByUserId: user.id,
          claimedAt: now,
        },
      });
    });
  } catch (error: any) {
    console.error("Error al crear WorkGroupExecutor o actualizar invite:", error);
    return NextResponse.json(
      { error: "Error al aceptar la invitación. Por favor, intenta nuevamente." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    redirectTo: "/cleaner/teams",
  });
}

