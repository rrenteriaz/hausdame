// lib/cleanings/cleaningIncludes.ts
// Helpers tipados para includes estándar de Cleaning
// Evita errores de nombres de relaciones incorrectos

import { Prisma } from "@/lib/generated/prisma";

/**
 * Include estándar para detalle completo de Cleaning (Host)
 * Incluye todas las relaciones necesarias para mostrar el detalle
 */
export const cleaningDetailInclude = {
  property: {
    select: {
      id: true,
      name: true,
      shortName: true,
    },
  },
  reservation: {
    select: {
      id: true,
      startDate: true,
      endDate: true,
      status: true,
    },
  },
  assignedTeamMember: {
    include: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  assignedMember: {
    include: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  TeamMembership: {
    include: {
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
  team: {
    select: {
      id: true,
      name: true,
    },
  },
  cleaningChecklistItems: {
    orderBy: [
      { area: "asc" },
      { sortOrder: "asc" },
    ],
  },
} as const satisfies Prisma.CleaningInclude;

/**
 * Tipo derivado del include para tipado fuerte
 */
export type CleaningDetailPayload = Prisma.CleaningGetPayload<{
  include: typeof cleaningDetailInclude;
}>;

