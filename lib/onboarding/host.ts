import prisma from "@/lib/prisma";

export type HostOnboardingStepKey =
  | "first-property"
  | "organize-properties"
  | "first-workgroup"
  | "first-cleaner";

export type HostOnboardingStep = {
  key: HostOnboardingStepKey;
  title: string;
  description: string;
  href?: string;
  ctaLabel: string;
  completed: boolean;
};

export type HostOnboardingProgress = {
  completedSteps: number;
  totalSteps: number;
  currentStep: HostOnboardingStep | null;
  steps: HostOnboardingStep[];
};

export async function getHostOnboardingProgress(
  tenantId: string
): Promise<HostOnboardingProgress> {
  const [
    activePropertiesCount,
    groupedPropertiesCount,
    workGroupsCount,
    activeExecutorsCount,
    workGroupInvitesCount,
    legacyTeamMembershipsCount,
    legacyTeamInvitesCount,
  ] = await Promise.all([
    prisma.property.count({
      where: { tenantId, isActive: true },
    }),
    prisma.property.count({
      where: {
        tenantId,
        isActive: true,
        groupName: { not: null },
        NOT: { groupName: "" },
      },
    }),
    prisma.hostWorkGroup.count({
      where: { tenantId },
    }),
    prisma.workGroupExecutor.count({
      where: { hostTenantId: tenantId, status: "ACTIVE" },
    }),
    prisma.hostWorkGroupInvite.count({
      where: { tenantId, status: { in: ["PENDING", "CLAIMED"] } },
    }),
    prisma.teamMembership.count({
      where: {
        Team: { tenantId },
        status: { in: ["PENDING", "ACTIVE"] },
      },
    }),
    prisma.teamInvite.count({
      where: {
        Team: { tenantId },
        status: { in: ["PENDING", "CLAIMED"] },
      },
    }),
  ]);

  const hasProperty = activePropertiesCount > 0;
  const hasOrganizedProperties =
    activePropertiesCount <= 1 ? hasProperty : groupedPropertiesCount > 0;
  const hasWorkGroup = workGroupsCount > 0;
  const hasCleanerConnection =
    activeExecutorsCount > 0 ||
    workGroupInvitesCount > 0 ||
    legacyTeamMembershipsCount > 0 ||
    legacyTeamInvitesCount > 0;

  const steps: HostOnboardingStep[] = [
    {
      key: "first-property",
      title: "Crear primera propiedad",
      description:
        "Registra tu alojamiento con alias, dirección, horarios e iCal para empezar a operar.",
      ctaLabel: "Agregar propiedad",
      completed: hasProperty,
    },
    {
      key: "organize-properties",
      title: "Organizar propiedades",
      description:
        "Usa el campo grupo de cada propiedad para separar zonas, edificios o portafolios.",
      href: "/host/properties",
      ctaLabel: "Ver propiedades",
      completed: hasOrganizedProperties,
    },
    {
      key: "first-workgroup",
      title: "Crear primer grupo de trabajo",
      description:
        "Crea un WorkGroup para conectar propiedades con equipos de limpieza.",
      ctaLabel: "Crear grupo",
      completed: hasWorkGroup,
    },
    {
      key: "first-cleaner",
      title: "Invitar primer cleaner",
      description:
        "Invita o conecta un equipo ejecutor para que pueda recibir limpiezas.",
      href: hasWorkGroup ? "/host/workgroups" : undefined,
      ctaLabel: hasWorkGroup ? "Ir a WorkGroups" : "Crea un WorkGroup primero",
      completed: hasCleanerConnection,
    },
  ];

  const completedSteps = steps.filter((step) => step.completed).length;

  return {
    completedSteps,
    totalSteps: steps.length,
    currentStep: steps.find((step) => !step.completed) ?? null,
    steps,
  };
}
