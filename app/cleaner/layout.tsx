// app/cleaner/layout.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import CleanerLayoutClient from "./layout-client";
import MembershipGuard from "./MembershipGuard";

/**
 * Server Component wrapper para Cleaner layout
 * Valida que el usuario sea CLEANER y tenga TeamMembership ACTIVE para rutas operativas
 */
export default async function CleanerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  // Si no hay user, redirigir a login
  // (el middleware ya valida cookies, pero esto es la barrera definitiva)
  if (!user) {
    redirect("/login");
  }

  // Si hay user con role HOST, redirigir
  const hostRoles = ["OWNER", "ADMIN", "MANAGER", "AUXILIAR"];
  
  if (hostRoles.includes(user.role)) {
    redirect("/host/hoy");
  }

  if (user.role !== "CLEANER") {
    redirect("/host/hoy");
  }

  // Resolver contexto del cleaner (sin crear nada)
  // REGLA DE ORO: resolveCleanerContext NO crea Team ni TeamMembership
  let hasActiveMembership = false;
  let isTeamLeader = false;
  let inProgressCleanings: { id: string }[] = [];
  try {
    const { resolveCleanerContext } = await import("@/lib/cleaner/resolveCleanerContext");
    const context = await resolveCleanerContext(user);
    hasActiveMembership = context.hasMembership;

    if (context.hasMembership && context.memberships.length > 0) {
      const membershipIds = context.memberships.map((m) => m.id);
      isTeamLeader = context.memberships.some((m) => m.role === "TEAM_LEADER");
      inProgressCleanings = await prisma.cleaning.findMany({
        where: { status: "IN_PROGRESS", assignedMembershipId: { in: membershipIds } },
        select: { id: true },
        orderBy: { scheduledDate: "asc" },
        take: 10,
      });
    }
  } catch (error) {
    // Si falla, asumir que no tiene membership (el guard redirigirá)
    hasActiveMembership = false;
  }

  const cleanerProfile = await prisma.cleanerProfile.findUnique({
    where: { userId: user.id },
    select: { fullName: true },
  });

  return (
    <MembershipGuard hasActiveMembership={hasActiveMembership}>
      <CleanerLayoutClient
        menuUser={{
          email: user.email,
          nickname: user.name,
          fullName: cleanerProfile?.fullName ?? null,
        }}
        inProgressCleanings={inProgressCleanings}
        isTeamLeader={isTeamLeader}
      >
        {children}
      </CleanerLayoutClient>
    </MembershipGuard>
  );
}
