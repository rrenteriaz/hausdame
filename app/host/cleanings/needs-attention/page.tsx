// app/host/cleanings/needs-attention/page.tsx
// 
// Contrato canónico: docs/contracts/HOST_CLEANINGS_NEEDS_ATTENTION_CONTRACT.md
// Copy canónico: docs/contracts/ASSIGNMENT_COPY_V1.md
//
// Esta página muestra limpiezas que requieren atención usando copy canónico según assignmentLevel.
// NO inventar textos nuevos. Usar SOLO los 7 mensajes canónicos definidos en ASSIGNMENT_COPY_V1.md.
import { requireHostUser } from "@/lib/auth/requireUser";
import { getCleaningsNeedingAttention } from "@/lib/cleaning-needs-attention";
import { getEligibleMembersForCleaning } from "@/lib/cleaning-eligibility";
import { getCoverThumbUrlsBatch } from "@/lib/media/getCoverThumbUrl";
import Page from "@/lib/ui/Page";
import ListContainer from "@/lib/ui/ListContainer";
import ListRow from "@/lib/ui/ListRow";
import ListThumb from "@/lib/ui/ListThumb";
import TeamMemberSelect from "../[id]/TeamMemberSelect";
import Link from "next/link";
import { getCleaningAssignmentLevel } from "@/lib/cleanings/getCleaningAssignmentLevel";
import { resolveAvailableTeamsForProperty } from "@/lib/workgroups/resolveAvailableTeamsForProperty";
import prisma from "@/lib/prisma";
import { isPastDateOnly } from "@/lib/datetime/isPastDateOnly";
import { formatDateOnly } from "@/lib/ui/formatDateOnly";

const OVERDUE_MESSAGE_V1 = "La fecha programada ya pasó y la limpieza sigue pendiente.";

/**
 * Obtiene el copy canónico según el nivel de asignación.
 * Basado en: docs/contracts/ASSIGNMENT_COPY_V1.md — Sección 3
 */
function getAssignmentCopy(level: number, data: {
  teamName?: string | null;
  cleanerName?: string | null;
  teamNameSecondary?: string | null;
  status?: string;
  hasError?: boolean;
}): { title: string; secondary?: string } {
  if (data.hasError) {
    return {
      title: "Asignación",
      secondary: "No se pudo cargar la asignación.",
    };
  }

  switch (level) {
    case 0:
      return {
        title: "Sin equipo disponible",
        secondary: "Esta propiedad no tiene equipos configurados. Ve a la propiedad para configurar equipos.",
      };
    case 1:
      return {
        title: "Pendiente de aceptación",
        secondary: "Hay equipos asignados a esta propiedad, pero ningún miembro ha aceptado la limpieza.",
      };
    case 2:
      return {
        title: `Asignada a equipo: ${data.teamName || "Equipo"}`,
        secondary: "La limpieza está asignada al equipo. Los cleaners del equipo pueden ver y aceptar la limpieza.",
      };
    case 3:
      return {
        title: data.cleanerName || "Cleaner asignado",
        secondary: `${data.teamNameSecondary || "Equipo"} · ${data.status === "IN_PROGRESS" ? "En progreso" : data.status === "COMPLETED" ? "Completada" : "Pendiente"}`,
      };
    case 4:
      return {
        title: `En ejecución por: ${data.cleanerName || "Cleaner asignado"}`,
        secondary: `${data.teamNameSecondary || "Equipo"} · En progreso`,
      };
    case 5:
      return {
        title: `Completada por: ${data.cleanerName || "Cleaner asignado"}`,
        secondary: `${data.teamNameSecondary || "Equipo"} · Completada`,
      };
    default:
      return {
        title: "Asignación",
        secondary: "No se pudo cargar la asignación.",
      };
  }
}

export default async function CleaningsNeedingAttentionPage() {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  const now = new Date();
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const cleaningsNeedingAttention = await getCleaningsNeedingAttention(
    tenantId,
    false
  );

  // Obtener thumbnails para las propiedades
  const thumbUrls =
    cleaningsNeedingAttention.length > 0
      ? await getCoverThumbUrlsBatch(
          cleaningsNeedingAttention.map((c) => ({
            id: c.property.id,
            coverAssetGroupId: c.property.coverAssetGroupId || null,
          }))
        )
      : new Map<string, string | null>();

  // Obtener datos adicionales necesarios para calcular assignmentLevel y mostrar copy canónico
  const cleaningIds = cleaningsNeedingAttention.map((c) => c.id);
  const cleaningsWithDetails = cleaningIds.length > 0
    ? await prisma.cleaning.findMany({
        where: { id: { in: cleaningIds }, tenantId },
        select: {
          id: true,
          teamId: true,
          assignedMembershipId: true,
          status: true,
          startedAt: true,
          completedAt: true,
          TeamMembership: {
            select: {
              id: true,
              User: {
                select: {
                  id: true,
                  name: true,
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
        },
      })
    : [];

  // Tipo local para los detalles de cleaning que se usan en getCleaningAssignmentLevel
  type CleaningAssignmentDetails = {
    teamId: string | null;
    assignedMembershipId: string | null;
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | null;
    startedAt: Date | null;
    completedAt: Date | null;
    team?: { id: string; name: string } | null;
    TeamMembership?: {
      id: string;
      User?: { id: string; name: string | null } | null;
      Team?: { id: string; name: string } | null;
    } | null;
  };

  type PartialCleaningAssignmentDetails = Partial<CleaningAssignmentDetails>;

  const cleaningsDetailsMap = new Map<string, PartialCleaningAssignmentDetails>(
    cleaningsWithDetails.map((c) => [c.id, c])
  );

  // Para cada limpieza, calcular assignmentLevel y obtener miembros elegibles
  const cleaningsWithEligibleMembers = await Promise.all(
    cleaningsNeedingAttention.map(async (cleaning) => {
      const details = cleaningsDetailsMap.get(cleaning.id);
      
      // Calcular hasAvailableTeams usando helper canónico
      const { teamIds } = await resolveAvailableTeamsForProperty(
        tenantId,
        cleaning.propertyId
      );
      const hasAvailableTeams = teamIds.length > 0;

      // Calcular assignmentLevel
      let assignmentLevel = 0;
      let hasError = false;
      try {
        assignmentLevel = getCleaningAssignmentLevel({
          teamId: details?.teamId || null,
          assignedMembershipId: details?.assignedMembershipId || null,
          status: (details?.status || cleaning.status) as "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
          startedAt: details?.startedAt || null,
          completedAt: details?.completedAt || null,
          hasAvailableTeams,
        });
      } catch (error) {
        hasError = true;
        assignmentLevel = 0;
      }

      // Obtener nombres para el copy
      const teamName = details?.team?.name || null;
      const cleanerName = details?.TeamMembership?.User?.name || cleaning.assignedMember?.name || null;
      const teamNameSecondary = details?.TeamMembership?.Team?.name || cleaning.assignedMember?.team?.name || null;

      // Obtener miembros elegibles
      const eligibleMembers = await getEligibleMembersForCleaning(
        tenantId,
        cleaning.propertyId,
        cleaning.scheduledDate
      );

      // Obtener copy canónico
      const assignmentCopy = getAssignmentCopy(assignmentLevel, {
        teamName,
        cleanerName,
        teamNameSecondary,
        status: details?.status || cleaning.status,
        hasError,
      });

      return {
        ...cleaning,
        assignmentLevel,
        assignmentCopy,
        teamName,
        cleanerName,
        teamNameSecondary,
        eligibleMembers: eligibleMembers.map((m) => ({
          id: m.id,
          name: m.name,
          team: { id: m.teamId, name: m.teamName },
        })),
      };
    })
  );

  const returnTo = "/host/cleanings/needs-attention";

  return (
    <Page
      title="Limpiezas que requieren atención"
      subtitle="Estas limpiezas requieren atención porque no tienen equipo o cleaner asignado, o el horario no es compatible."
      showBack={true}
      backHref="/host/cleanings"
    >
      {cleaningsNeedingAttention.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <p className="text-base text-neutral-600">
            No hay limpiezas que requieran atención en este momento.
          </p>
          <Link
            href="/host/cleanings"
            className="mt-4 inline-block text-base text-neutral-900 underline underline-offset-2 hover:text-neutral-700"
          >
            Volver a Limpiezas
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900">
              {cleaningsNeedingAttention.length} limpieza
              {cleaningsNeedingAttention.length > 1 ? "s" : ""} requiere
              {cleaningsNeedingAttention.length > 1 ? "n" : ""} atención
            </p>
          </div>

          <ListContainer>
            {cleaningsWithEligibleMembers.map((cleaning, index) => {
              const isLast = index === cleaningsWithEligibleMembers.length - 1;
              const propertyName =
                cleaning.property.shortName || cleaning.property.name;
              const detailsHref = `/host/cleanings/${cleaning.id}?returnTo=${encodeURIComponent(returnTo)}`;

              return (
                <div key={cleaning.id}>
                  <ListRow
                    href={detailsHref}
                    isLast={isLast}
                    ariaLabel={`Ver detalles de limpieza ${propertyName}`}
                  >
                    <ListThumb
                      src={thumbUrls.get(cleaning.property.id) || null}
                      alt={propertyName}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-medium text-neutral-900 truncate">
                          {propertyName}
                        </h3>
                        {isPastDateOnly(new Date(cleaning.scheduledDate)) && (
                          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                            Vencida
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-500 truncate mt-0.5">
                        {formatDateOnly(new Date(cleaning.scheduledDate))}
                      </p>
                      {/* Copy canónico según assignmentLevel */}
                      <div className="mt-1 space-y-0.5">
                        <p className="text-xs font-medium text-neutral-700">
                          {cleaning.assignmentCopy.title}
                        </p>
                        {cleaning.assignmentCopy.secondary && (
                          <p className="text-xs text-neutral-500">
                            {cleaning.assignmentCopy.secondary}
                          </p>
                        )}
                        {isPastDateOnly(new Date(cleaning.scheduledDate)) && (
                          <p className="text-[10px] sm:text-xs text-amber-600 font-medium">
                            {OVERDUE_MESSAGE_V1}
                          </p>
                        )}
                      </div>
                    </div>
                  </ListRow>

                  {/* Selector de cleaner elegible */}
                  {cleaning.eligibleMembers.length > 0 && (
                    <div className="px-4 pb-4 bg-neutral-50 border-b border-neutral-200">
                      <TeamMemberSelect
                        teamMembers={cleaning.eligibleMembers}
                        defaultValue={""}
                        cleaningId={cleaning.id}
                        returnTo={returnTo}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </ListContainer>
        </div>
      )}
    </Page>
  );
}

