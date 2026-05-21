"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { removeWorkGroupFromProperty } from "../actions-workgroups";
import AssignWorkGroupModal from "./AssignWorkGroupModal";
import { getTeamDisplayNameForHost } from "@/lib/teams/getTeamDisplayNameForHost";

interface WorkGroup {
  id: string;
  name: string;
}

interface AssignedWorkGroup {
  id: string;
  workGroupId: string;
  workGroup: {
    id: string;
    name: string;
  };
}

interface Executor {
  workGroupId: string;
  teamId: string;
  status: string;
}

interface Team {
  id: string;
  name: string;
  status?: string;
  leaderName?: string | null;
}

interface WorkGroupsSectionProps {
  propertyId: string;
  workGroups: WorkGroup[];
  assignedWorkGroups: AssignedWorkGroup[];
  executorsByWorkGroup: Record<string, Executor[]>;
  executorTeamsById: Record<string, Team>;
  returnTo: string;
}

export default function WorkGroupsSection({
  propertyId,
  workGroups,
  assignedWorkGroups: initialAssignedWorkGroups,
  executorsByWorkGroup,
  executorTeamsById,
  returnTo,
}: WorkGroupsSectionProps) {
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [assignedWorkGroups, setAssignedWorkGroups] = useState(initialAssignedWorkGroups);
  const assignedWorkGroupIds = new Set(assignedWorkGroups.map((wgp) => wgp.workGroupId));

  return (
    <>
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3 mt-6">
        <h2 className="text-base font-semibold text-neutral-800">
          Grupos de trabajo asignados
        </h2>

        {assignedWorkGroups.length > 0 && (
          <ul className="space-y-3">
            {assignedWorkGroups.map((wgp) => {
              const workGroupDetailHref = `/host/workgroups/${wgp.workGroupId}?returnTo=${encodeURIComponent(returnTo)}`;
              const workGroupExecutors = executorsByWorkGroup[wgp.workGroupId] ?? [];
              return (
                <li
                  key={wgp.id}
                  className="rounded-xl border border-neutral-200 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <Link
                      href={workGroupDetailHref}
                      className="min-w-0 flex-1 block rounded-lg -m-1 p-1 hover:bg-neutral-50 active:bg-neutral-100 transition"
                      aria-label={`Ver detalles del grupo de trabajo ${wgp.workGroup.name}`}
                    >
                      <span className="text-base font-medium text-neutral-900">{wgp.workGroup.name}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        const workGroupIdToRemove = wgp.workGroupId;
                        // Capturar posición de scroll antes de la acción
                        const scrollY = window.scrollY;
                        startTransition(async () => {
                          try {
                            const formData = new FormData();
                            formData.append("propertyId", propertyId);
                            formData.append("workGroupId", workGroupIdToRemove);
                            formData.append("returnTo", returnTo);
                            formData.append("skipRedirect", "true");

                            const result = await removeWorkGroupFromProperty(formData);
                            if (result?.success) {
                              // Actualizar estado local sin navegación
                              setAssignedWorkGroups((prev) =>
                                prev.filter((wgp) => wgp.workGroupId !== workGroupIdToRemove)
                              );
                              // Restaurar posición de scroll si cambió
                              requestAnimationFrame(() => {
                                if (Math.abs(window.scrollY - scrollY) > 10) {
                                  window.scrollTo({ top: scrollY, behavior: "instant" });
                                }
                              });
                            }
                          } catch (error: any) {
                            console.error("Error al quitar grupo de trabajo:", error);
                            alert(error?.message || "Error al quitar grupo de trabajo");
                          }
                        });
                      }}
                      disabled={isPending}
                      className="text-xs text-neutral-500 underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Quitar
                    </button>
                  </div>
                  
                  {/* Equipos ejecutores (read-only) */}
                  {workGroupExecutors.length > 0 && (
                    <div className="pl-2 border-l-2 border-neutral-100 space-y-1">
                      <p className="text-xs font-medium text-neutral-600">Equipos ejecutores:</p>
                      <ul className="space-y-1">
                        {workGroupExecutors.map((executor) => {
                          const team = executorTeamsById[executor.teamId];
                          const teamStatus = team?.status || executor.status;
                          // Host UI muestra displayName derivado cuando Team.name es genérico
                          const displayName = team
                            ? getTeamDisplayNameForHost(team, team.leaderName)
                            : `Equipo ${executor.teamId.slice(0, 8)}...`;
                          return (
                            <li key={`${executor.workGroupId}-${executor.teamId}`} className="text-xs text-neutral-500">
                              • {displayName}
                              {teamStatus === "ACTIVE" ? (
                                <span className="ml-2 text-[10px] px-1 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                  Activo
                                </span>
                              ) : teamStatus === "INACTIVE" ? (
                                <span className="ml-2 text-[10px] px-1 py-0.5 rounded-full bg-neutral-100 text-neutral-600">
                                  Inactivo
                                </span>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {workGroups.length > 0 ? (
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full lg:w-1/4 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base font-medium text-neutral-700 hover:bg-neutral-50 active:scale-[0.99] transition"
          >
            Asignar grupo
          </button>
        ) : (
          <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-center">
            <p className="text-xs text-neutral-500 mb-2">
              No hay grupos de trabajo disponibles.
            </p>
            <Link 
              href={`/host/workgroups?returnTo=${encodeURIComponent(returnTo)}`} 
              className="text-xs text-neutral-900 underline underline-offset-2"
            >
              Administrar grupos de trabajo
            </Link>
          </div>
        )}
      </section>

      <AssignWorkGroupModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={(workGroupId, workGroupName) => {
          // Actualizar estado local con el nuevo grupo asignado
          setAssignedWorkGroups((prev) => [
            ...prev,
            {
              id: `temp-${workGroupId}`, // ID temporal, se actualizará en el próximo refresh
              workGroupId,
              workGroup: {
                id: workGroupId,
                name: workGroupName,
              },
            },
          ]);
        }}
        propertyId={propertyId}
        workGroups={workGroups}
        assignedWorkGroupIds={assignedWorkGroupIds}
        returnTo={returnTo}
      />
    </>
  );
}

