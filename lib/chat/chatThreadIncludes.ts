// lib/chat/chatThreadIncludes.ts
// Helpers tipados para includes/selects estándar de ChatThread
// Evita errores de nombres de relaciones incorrectos y centraliza queries

import { Prisma } from "@/lib/generated/prisma";

/**
 * Select mínimo para validación de acceso (requireThreadAccess)
 * Incluye solo campos esenciales para autorización
 */
export const chatThreadAccessSelect = {
  id: true,
  tenantId: true,
  teamId: true,
  status: true,
  type: true,
} as const satisfies Prisma.ChatThreadSelect;

/**
 * Tipo derivado del select mínimo para acceso
 */
export type ChatThreadAccessPayload = Prisma.ChatThreadGetPayload<{
  select: typeof chatThreadAccessSelect;
}>;

/**
 * Include completo para detalle de thread con relaciones
 * Incluye team, participants con sus relaciones (User, TeamMembership)
 */
export const chatThreadDetailInclude = {
  team: {
    select: {
      id: true,
      name: true,
      tenantId: true,
    },
  },
  property: {
    select: {
      id: true,
      name: true,
      shortName: true,
    },
  },
  participants: {
    where: {
      leftAt: null, // Solo participantes activos
    },
    select: {
      id: true,
      userId: true,
      role: true,
      joinedAt: true,
      teamMembership: {
        select: {
          id: true,
          role: true,
          status: true,
          User: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          Team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      joinedAt: "asc",
    },
  },
} as const satisfies Prisma.ChatThreadInclude;

/**
 * Tipo derivado del include completo para detalle
 */
export type ChatThreadDetailPayload = Prisma.ChatThreadGetPayload<{
  include: typeof chatThreadDetailInclude;
}>;

